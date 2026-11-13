#!/usr/bin/env python3
"""Check mobile patch registration; explicitly refresh hashes and generated mirrors."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile


def read_json(path):
    def unique_keys(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"{path}: duplicate JSON key {key}")
            result[key] = value
        return result

    return json.loads(path.read_text(), object_pairs_hook=unique_keys)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check(vendor, refresh=False):
    registry_path = vendor / "patches/mobile/manifest.json"
    registry = read_json(registry_path)
    mirrors = {vendor / name: read_json(vendor / name)
               for name in ("vendor-manifest.json", "provenance.json")}
    entries = registry["patches"]
    order = mirrors[vendor / "vendor-manifest.json"]["mobilePatches"]
    require(isinstance(entries, list) and isinstance(order, list), "patches/mobilePatches must be arrays")
    require(all(isinstance(p, str) for p in order), "mobilePatches must contain paths")
    require(len(order) == len(set(order)), "duplicate mobilePatches entry")
    mobile = vendor / "patches/mobile"
    require(not mobile.is_symlink() and not mobile.parent.is_symlink(), "patch directory must not be a symlink")
    by_id, by_path, hashes = {}, {}, {}
    for entry in entries:
        identity, path, status = entry["id"], entry["patch"], entry["status"]
        require(isinstance(identity, str) and re.fullmatch(r"[a-z][a-z0-9]*(?:-[a-z0-9]+)+", identity),
                f"invalid semantic patch ID: {identity!r}")
        require(isinstance(path, str) and re.fullmatch(r"patches/mobile/[A-Za-z0-9][A-Za-z0-9._-]*\.patch", path),
                f"invalid patch path: {path!r}")
        require(identity not in by_id, f"duplicate ID: {identity}")
        require(path not in by_path, f"duplicate patch path: {path}")
        require(path == f"patches/mobile/{identity}.patch", f"patch filename must match ID: {identity}")
        require(status in ("active", "deferred", "absorbed"), f"invalid status: {identity}")
        file = vendor / path
        require(file.is_file() and not file.is_symlink(), f"missing or symlink patch: {path}")
        hashes[identity] = hashlib.sha256(file.read_bytes()).hexdigest()
        by_id[identity], by_path[path] = entry, entry

    files = {p.relative_to(vendor).as_posix() for p in mobile.rglob("*.patch")}
    require(files == set(by_path), f"unregistered patch files: {sorted(files - set(by_path))}")
    active = {e["patch"] for e in entries if e["status"] == "active"}
    require(set(order) == active,
            f"active/order mismatch: missing={sorted(active - set(order))}, extra={sorted(set(order) - active)}")
    positions = {by_path[path]["id"]: i for i, path in enumerate(order)}
    for entry in entries:
        identity = entry["id"]
        deps = entry.get("dependsOn", [])
        require(isinstance(deps, list) and all(isinstance(d, str) for d in deps),
                f"dependsOn must be an ID array: {identity}")
        require(len(deps) == len(set(deps)), f"duplicate dependency: {identity}")
        for dep in deps:
            require(dep in by_id and dep != identity, f"unknown/self dependency: {identity} -> {dep}")
            if identity in positions:
                require(dep in positions and positions[dep] < positions[identity],
                        f"dependency must be active and earlier: {identity} -> {dep}")

    visiting, visited = set(), set()

    def visit(identity):
        require(identity not in visiting, f"dependency cycle: {identity}")
        if identity in visited:
            return
        visiting.add(identity)
        for dep in by_id[identity].get("dependsOn", []):
            visit(dep)
        visiting.remove(identity)
        visited.add(identity)

    for identity in by_id:
        visit(identity)

    # Structural checks complete before refreshing anything. Neither order nor status
    # is inferred or repaired; only hashes and the documented registry projections change.
    for entry in entries:
        digest = hashes[entry["id"]]
        if refresh:
            entry["sha256"] = digest
        else:
            require(entry.get("sha256") == digest, f"hash mismatch: {entry['patch']}")
    projection = [dict(id=e["id"], path=e["patch"], sha256=e["sha256"], status=e["status"])
                  for e in entries]
    deferred = [e for e in projection if e["status"] == "deferred"]
    absorbed = [e for e in projection if e["status"] == "absorbed"]
    for path, document in mirrors.items():
        for key, value in (
            ("mobilePatchRegistry", projection),
            ("deferredMobilePatches", deferred),
            ("absorbedMobilePatches", absorbed),
        ):
            if refresh:
                document[key] = value
            else:
                require(document.get(key) == value, f"stale generated field: {path.name}#{key}; run --refresh")

    changed = []
    if refresh:
        for path, document in {registry_path: registry, **mirrors}.items():
            # Preserve original formatting when the parsed document is unchanged.
            if read_json(path) == document:
                continue
            content = json.dumps(document, ensure_ascii=False, indent=2) + "\n"
            with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as out:
                temporary = Path(out.name)
                try:
                    out.write(content)
                    out.flush()
                    os.chmod(temporary, path.stat().st_mode & 0o777)
                    os.replace(temporary, path)
                finally:
                    temporary.unlink(missing_ok=True)
            changed.append(path.name)
    return len(entries), changed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vendor-dir", type=Path,
                        default=Path(__file__).resolve().parents[1] / "vendor/upstream")
    parser.add_argument("--refresh", action="store_true", help="explicitly refresh hashes and generated mirrors")
    args = parser.parse_args()
    try:
        count, changed = check(args.vendor_dir.resolve(), args.refresh)
    except (ValueError, KeyError, TypeError, OSError) as error:
        parser.exit(1, f"mobile-patches: FAIL: {error}\n")
    print(f"mobile-patches: PASS ({count} registered; updated: {', '.join(changed) or 'none'})")


if __name__ == "__main__":
    main()
