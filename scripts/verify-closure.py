#!/usr/bin/env python3
"""Verify the finite P126 runtime closure or a frozen historical Block 1 snapshot.

Runtime inputs are read from the selected candidate worktree. The historical profile is
explicit-only and reads every historical manifest and patch blob from its frozen commit.
Both profiles rebuild their pristine side from the fixed upstream cache and replay the
registered ordered patch list; neither copies a future worktree as a source baseline.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
import tempfile
from typing import Any


RUNTIME_BASE = "afef1b948c59a901da710bb5793ea73d53948fbb"
HISTORICAL_BASE = "d37260c002b4390060f7d6cd78ffe6a11e9e1012"
HISTORICAL_SNAPSHOT = "aa666a31b7e1fae5fbd17bc616df38f2e3c634c3"
UPSTREAM_TARGET = "3ebcf9a32c7b28f658cfee80775448929361727a"
RUNTIME_ACTIVE_SUFFIX = [
    "M-057",
    "M-058",
    "M-065",
    "M-059",
    "M-060",
    "M-061",
    "M-062",
    "M-064",
    "M-066",
    "M-067",
    "M-068",
]
RUNTIME_SOURCE_HASHES = {
    "M-057": ("patches/mobile/P126-U-session-workbench.patch", "999102046b0b9e559875e9afcc0aa734558e6e8c4087d11daacdb160ce1b5fb1"),
    "M-058": ("patches/mobile/P126-C-client-compat.patch", "f32f9e6289d97c2a3e8b965e9d0ddfc41283bb48105827f57b9b5c79a3e5e359"),
    "M-059": ("patches/mobile/P126-S-media-source-safety.patch", "384326345d18cc9e0822a2abaa7ace24e1bf4fbee759cc5fe22aa73f73fb48c2"),
    "M-060": ("patches/mobile/P126-A-android-adaptation.patch", "1592f92778e4916476b2e15b0ce0664925a39be88ebcfcb88bb30fa997f44f73"),
    "M-063": ("patches/mobile/P126-A-agent-selector.patch", "9bf73e327546874ab363cf611e3070b43dd03a154b5dfbb6b518c04b222a5bd9"),
    "M-064": ("patches/mobile/P126-S-session-ownership-whitespace.patch", "8291ac3b2706058702587750e73d47b5f299eb54736087652e1f3b4d2063ab5c"),
    "M-067": ("patches/mobile/P126-B-e2e-runtime-compat.patch", "134572bb64882a2bd0dfa350c8f6afbe5a736e1000c587ad34b435a93a09436a"),
    "M-068": ("patches/mobile/P126-C-composer-test-fixture-compat.patch", "7ea239fc1c2c87270b0f6f6128b056e094343295ef174fa43caee120528fcea6"),
}
M065_PATH = "patches/mobile/P126-C-project-open-compat.patch"
M065_SHA256 = "d2a3f07ae5a31d2bdb650e07dd5943010edf05549fe6434fc093846a2c0ef42d"
M066_PATH = "patches/mobile/P126-C-composer-restore-test-compat.patch"
M066_SHA256 = "67c88b685a385bfc34722baa2a957ad05d37760e671bc23dac5dbdb7e8bc68a6"
FIXED_M037_SHA256 = "9a3cca744552093ed517c1a217e0e1c2ccff4d4c1f1ade7ec859e975088e29ae"
FIXED_M061_SHA256 = "d259b2b8ef6c3fec523f0f16ab3464b2c70f62796d98d772e5497e1ac38cca70"
FIXED_M062_SHA256 = "630baba49be6c76bb1875d6496446dc59c6a40cce4c792de75cf34f67e047288"
RUNTIME_POLICY = {
    "version": 1,
    "profile": "p126-runtime",
    "base": RUNTIME_BASE,
    "targetUpstream": UPSTREAM_TARGET,
    "activePatchCount": 65,
    "deferredSourceOnlyPatchCount": 1,
    "deferredPatchesApplied": False,
    "activeClosureUsesExactOrder": True,
    "replayOrderContract": "p126-replay-order.json",
    "deferredPatchIDs": ["M-063"],
}
BLOCK1_POLICY = {
    "base": HISTORICAL_BASE,
    "activePatchCount": 56,
    "deferredSourceOnlyPatchCount": 6,
    "deferredPatchesApplied": False,
    "activeClosureUsesOnlyBaseOrder": True,
    "futureOrderContract": "p126-replay-order.json",
}


class ValidationFailure(Exception):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationFailure(message)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def git(root: Path, *args: str, check: bool = True, binary: bool = False) -> bytes | str:
    result = subprocess.run(
        ["git", "-C", str(root), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if check and result.returncode != 0:
        detail = result.stderr.decode("utf-8", "replace").strip()
        raise ValidationFailure(f"git {' '.join(args)} failed rc={result.returncode}: {detail}")
    return result.stdout if binary else result.stdout.decode("utf-8", "replace")


def git_json(root: Path, revision: str, relative: str) -> Any:
    data = git(root, "show", f"{revision}:{relative}", binary=True)
    try:
        return json.loads(data)
    except (json.JSONDecodeError, TypeError) as error:
        raise ValidationFailure(f"frozen JSON input is invalid: {revision}:{relative}: {error}") from error


def frozen_bytes(root: Path, revision: str, relative: str) -> bytes:
    return git(root, "show", f"{revision}:{relative}", binary=True)


def regular_json(root: Path, relative: str) -> Any:
    path = root / relative
    require(not path.is_symlink() and path.is_file(), f"metadata file is missing, symlinked or not regular: {relative}")
    try:
        return json.loads(path.read_text())
    except (json.JSONDecodeError, OSError) as error:
        raise ValidationFailure(f"metadata JSON is invalid: {relative}: {error}") from error


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def patch_path(root: Path, vendor_root: Path, relative: str) -> Path:
    require(isinstance(relative, str) and bool(relative) and "\\" not in relative, "registered patch path is not canonical POSIX text")
    parsed = PurePosixPath(relative)
    parts = relative.split("/")
    require(
        not parsed.is_absolute()
        and parsed.as_posix() == relative
        and all(part not in ("", ".", "..") for part in parts)
        and len(parts) == 3
        and parts[:2] == ["patches", "mobile"],
        f"patch path is absolute, traversing, non-canonical or outside patches/mobile: {relative!r}",
    )
    path = vendor_root.joinpath(*parts)
    try:
        resolved = path.resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise ValidationFailure(f"registered patch cannot be resolved: {relative}: {error}") from error
    mobile = vendor_root / "patches/mobile"
    mobile_resolved = mobile.resolve(strict=True)
    require(not path.is_symlink() and resolved.is_file(), f"registered patch is missing, symlinked or not a file: {relative}")
    require(resolved.parent == mobile_resolved, f"registered patch resolves outside the canonical mobile patch directory: {relative}")
    return resolved


def parse_patch(path: Path) -> tuple[str, list[dict[str, Any]]]:
    """Read path operations and hunk counts from the immutable unified patch bytes."""
    data = path.read_bytes()
    text = data.decode("utf-8", errors="replace")
    files: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    old_mode: str | None = None
    new_mode: str | None = None
    old_oid: str | None = None
    new_oid: str | None = None

    def strip_prefix(value: str) -> str:
        if value == "/dev/null":
            return value
        return value.split("/", 1)[1] if "/" in value else value

    def close_current() -> None:
        nonlocal current, old_mode, new_mode, old_oid, new_oid
        if current is None:
            return
        if "change" not in current:
            current["change"] = "rename" if current["oldPath"] != current["path"] else "modify"
        if current["oldPath"] != current["path"]:
            current["from"] = current.pop("oldPath")
        else:
            current.pop("oldPath", None)
        if current["change"] == "modify" and old_mode != new_mode:
            current["mode"] = {"from": old_mode, "to": new_mode}
        if old_oid and new_oid:
            current["blobRange"] = f"{old_oid}..{new_oid}"
        if not current["binary"]:
            current.pop("binary")
        files.append(current)
        current = None
        old_mode = new_mode = old_oid = new_oid = None

    for line in text.splitlines():
        if line.startswith("diff --git "):
            close_current()
            pair = line[len("diff --git ") :].split(" ")
            old_path = strip_prefix(pair[0]) if len(pair) == 2 else ""
            new_path = strip_prefix(pair[1]) if len(pair) == 2 else ""
            current = {"path": new_path, "oldPath": old_path, "hunks": 0, "binary": False}
            continue
        if line.startswith("--- "):
            raw = line[4:].split("\t", 1)[0]
            old_path = strip_prefix(raw)
            if old_path == "/dev/null" and current is not None:
                current["oldPath"] = old_path
                current["change"] = "add"
                continue
            if current is not None and current.get("oldPath") == old_path:
                continue
            close_current()
            current = {"path": old_path, "oldPath": old_path, "hunks": 0, "binary": False}
            continue
        if line.startswith("+++ "):
            raw = line[4:].split("\t", 1)[0]
            new_path = strip_prefix(raw)
            if current is None:
                current = {"path": new_path, "oldPath": new_path, "hunks": 0, "binary": False}
            if new_path == "/dev/null":
                current["change"] = "delete"
            elif current["path"] == current["oldPath"]:
                current["path"] = new_path
            continue
        if current is None:
            continue
        if line.startswith("new file mode "):
            new_mode = line.removeprefix("new file mode ")
            current["change"] = "add"
        elif line.startswith("deleted file mode "):
            old_mode = line.removeprefix("deleted file mode ")
            current["change"] = "delete"
        elif line.startswith("old mode "):
            old_mode = line.removeprefix("old mode ")
        elif line.startswith("new mode "):
            new_mode = line.removeprefix("new mode ")
        elif line.startswith("index "):
            parts = line.split()
            if len(parts) >= 2 and ".." in parts[1]:
                old_oid, new_oid = parts[1].split("..", 1)
            if len(parts) >= 3:
                old_mode = old_mode or parts[2]
                new_mode = new_mode or parts[2]
        elif line.startswith("@@"):
            current["hunks"] += 1
        elif line.startswith("GIT binary patch") or line.startswith("Binary files "):
            current["binary"] = True
    close_current()
    return sha256(data), files


def safe_registered_records(root: Path, vendor_root: Path, records: list[dict[str, Any]]) -> dict[str, Path]:
    resolved: dict[str, Path] = {}
    for record in records:
        path = patch_path(root, vendor_root, record.get("patch"))
        actual = sha256(path.read_bytes())
        require(actual == record.get("sha256"), f"registered patch hash differs from bytes: {record.get('id')}")
        resolved[record["id"]] = path
    return resolved


def projected_registry(records: list[dict[str, Any]]) -> list[dict[str, str]]:
    return [{"id": p["id"], "path": p["patch"], "sha256": p["sha256"], "status": p["status"]} for p in records]


def immutable_sources(cache: Path, manifest: dict[str, Any], destination: Path) -> None:
    require(destination.exists(), f"scratch destination was not created: {destination}")
    packages = manifest.get("packages")
    overrides = manifest.get("packageSources") or {}
    require(isinstance(packages, list) and all(isinstance(p, str) for p in packages), "frozen package list has wrong shape")
    require(isinstance(overrides, dict), "frozen packageSources is not an object")
    for package, revision in overrides.items():
        require(package in packages and isinstance(revision, str), f"invalid frozen packageSources entry: {package!r}")
    pathspec = [f"packages/{package}" for package in packages if package not in overrides]
    pathspec.extend(item["path"] for item in manifest.get("partialPackages", []))
    pathspec.extend(manifest.get("topLevelFiles", []))
    safe = all(
        not PurePosixPath(value).is_absolute()
        and ".." not in PurePosixPath(value).parts
        and "\\" not in value
        for value in pathspec
    )
    require(safe, "frozen upstream extraction path escapes the closure")

    def archive(revision: str, paths: list[str], output: Path) -> None:
        with output.open("wb") as stream:
            result = subprocess.run(
                ["git", "-C", str(cache), "archive", revision, "--", *paths],
                stdout=stream,
                stderr=subprocess.PIPE,
                check=False,
            )
        require(result.returncode == 0, f"git archive failed for fixed source {revision}: {result.stderr.decode('utf-8','replace')}")
        result = subprocess.run(
            ["tar", "-x", "--exclude=packages/ai/test/fixtures/recordings", "-f", str(output), "-C", str(destination)],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        require(result.returncode == 0, f"tar extraction failed for fixed source {revision}: {result.stderr.decode('utf-8','replace')}")

    archive(manifest["upstream"]["pin"], pathspec, destination / "pin.tar")
    for package, revision in overrides.items():
        archive(revision, [f"packages/{package}"], destination / f"{package}.tar")


def apply_chain(work: Path, tree: Path, patch_paths: list[Path], reverse: bool = False, log: Path | None = None) -> None:
    ordered = list(reversed(patch_paths)) if reverse else patch_paths
    rel = tree.relative_to(work).as_posix()
    log_lines: list[str] = []
    for patch in ordered:
        direction = ["--reverse"] if reverse else []
        check = subprocess.run(
            ["git", "apply", f"--directory={rel}", *direction, "--check", str(patch)],
            cwd=work,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        require(check.returncode == 0, f"patch {'reverse ' if reverse else ''}check failed: {patch.name}: {check.stderr.decode('utf-8','replace')}")
        applied = subprocess.run(
            ["git", "apply", f"--directory={rel}", *direction, str(patch)],
            cwd=work,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        require(applied.returncode == 0, f"patch {'reverse ' if reverse else ''}apply failed: {patch.name}: {applied.stderr.decode('utf-8','replace')}")
        log_lines.append(f"{'REVERSE' if reverse else 'APPLY'}\t{patch.name}\tcheck_rc=0\tapply_rc=0")
    if log is not None:
        log.write_text("\n".join(log_lines) + "\n")


def compare_trees(root: Path, left: Path, right: Path, label: str) -> None:
    checker = root / "scripts/check-closure-tree.py"
    result = subprocess.run(
        [
            sys.executable,
            str(checker),
            "--expected",
            str(left),
            "--actual",
            str(right),
            "--exclude-path",
            "app/e2e/test-results",
            "--label",
            label,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    output = (result.stdout + result.stderr).decode("utf-8", "replace")
    if result.returncode == 0:
        print(output, end="")
    else:
        lines = output.splitlines()
        print("\n".join(lines[:60]))
        if len(lines) > 60:
            print(f"... {len(lines) - 60} additional tree-diff lines omitted from console output")
    require(result.returncode == 0, f"tree check failed: {label}")


def runtime_active_order(base_manifest: dict[str, Any]) -> list[str]:
    base_active = base_manifest["patches"][:56]
    require(len(base_active) == 56 and all(p.get("status") == "active" for p in base_active), "fixed base active registry is not the literal 56-entry set")
    base_ids = [p["id"] for p in base_active]
    require(len(set(base_ids)) == 56, "fixed base active IDs are not unique")
    require("M-061" in base_ids and "M-062" in base_ids, "fixed base does not include the preserved M-061/M-062 records")
    return [patch_id for patch_id in base_ids if patch_id not in ("M-061", "M-062")] + RUNTIME_ACTIVE_SUFFIX


def runtime_metadata(root: Path, cache: Path, base_manifest: dict[str, Any], base_vendor: dict[str, Any]) -> tuple[list[dict[str, Any]], list[Path]]:
    vendor_root = root / "vendor/upstream"
    vendor_resolved = vendor_root.resolve(strict=True)
    require(vendor_resolved == vendor_root and vendor_root.is_dir(), "vendor/upstream path is symlinked or non-canonical")
    mobile_dir = vendor_root / "patches/mobile"
    require(mobile_dir.resolve(strict=True) == mobile_dir and mobile_dir.is_dir(), "mobile patch directory is symlinked or non-canonical")
    manifest = regular_json(root, "vendor/upstream/patches/mobile/manifest.json")
    vendor = regular_json(root, "vendor/upstream/vendor-manifest.json")
    provenance = regular_json(root, "vendor/upstream/provenance.json")
    order = regular_json(root, "vendor/upstream/patches/mobile/p126-replay-order.json")

    require("block1PatchPolicy" not in manifest and "block1PatchPolicy" not in vendor and "block1PatchPolicy" not in provenance, "historical Block 1 policy was copied into the runtime profile")
    for document_name, document in (("manifest", manifest), ("vendor-manifest", vendor), ("provenance", provenance), ("replay-order", order)):
        require(canonical_json(document.get("runtimePatchPolicy")) == canonical_json(RUNTIME_POLICY), f"runtime policy mismatch or missing in {document_name}")

    immutable_keys = ("upstream", "packages", "topLevelFiles", "partialPackages", "packageSources", "packageSourcesReason", "excluded", "upstreamPatches")
    for key in immutable_keys:
        require(canonical_json(vendor.get(key)) == canonical_json(base_vendor.get(key)), f"fixed upstream acquisition metadata changed: {key}")
    require(vendor["upstream"]["pin"] == base_vendor["upstream"]["pin"], "upstream pin changed")
    require(vendor["packageSources"] == {"gui-plugins": UPSTREAM_TARGET}, "fixed gui-plugins packageSources target changed")

    expected_order = runtime_active_order(base_manifest)
    require(order.get("formatVersion") == 2, "runtime replay-order formatVersion mismatch")
    require(order.get("status") == "active-runtime-contract" and order.get("applied") is True, "runtime replay-order state is not active")
    require(order.get("activeReplayOrder") == expected_order, "runtime replay-order ID sequence differs from literal order")
    expected_suffix = ["M-057", "M-058", "M-065", "M-059", "M-060", "M-061", "M-062", "M-064", "M-066", "M-067", "M-068"]
    require(expected_order[-len(expected_suffix):] == expected_suffix, "runtime P126 suffix order differs from fixed contract")

    original_active = {p["id"]: p for p in base_manifest["patches"][:56]}
    original_deferred = {p["id"]: p for p in base_manifest["patches"][56:]}
    current = manifest.get("patches")
    require(isinstance(current, list) and len(current) == 66, "runtime registry must contain exactly 66 records")
    ids = [p.get("id") for p in current]
    paths = [p.get("patch") for p in current]
    expected_ids = expected_order + ["M-063"]
    require(ids == expected_ids, "manifest ID sequence differs from the fixed 65-active + M-063 order")
    require(len(set(ids)) == 66 and len(set(paths)) == 66, "manifest IDs or paths are not unique")
    require(all(p.get("status") == "active" for p in current[:65]), "an active record has a non-active status")
    require(current[65].get("status") == "deferred-source-only" and current[65].get("id") == "M-063", "M-063 is not the sole final deferred record")

    base_by_id = {**original_active, **original_deferred}
    actual_by_id = {p["id"]: p for p in current}
    for patch_id, base_record in original_active.items():
        actual = actual_by_id.get(patch_id)
        require(actual is not None, f"original base patch is missing: {patch_id}")
        expected_record = {**base_record, "status": "active"}
        require(canonical_json(actual) == canonical_json(expected_record), f"original base patch metadata changed: {patch_id}")
        if patch_id in ("M-037", "M-061", "M-062"):
            require(canonical_json(actual) == canonical_json(base_record), f"protected historical metadata record changed: {patch_id}")

    for patch_id, expected_hash in (
        ("M-037", FIXED_M037_SHA256),
        ("M-061", FIXED_M061_SHA256),
        ("M-062", FIXED_M062_SHA256),
    ):
        require(original_active[patch_id].get("sha256") == expected_hash, f"fixed source hash differs from the P126 contract: {patch_id}")

    expected_sources = dict(RUNTIME_SOURCE_HASHES)
    expected_sources["M-065"] = (M065_PATH, M065_SHA256)
    expected_sources["M-066"] = (M066_PATH, M066_SHA256)
    for patch_id, (expected_path, expected_hash) in expected_sources.items():
        record = actual_by_id.get(patch_id)
        require(record is not None, f"fixed P126 source is missing from registry: {patch_id}")
        require(record.get("patch") == expected_path and record.get("sha256") == expected_hash, f"fixed P126 ID/path/hash mismatch: {patch_id}")
        expected_status = "deferred-source-only" if patch_id == "M-063" else "active"
        require(record.get("status") == expected_status, f"fixed P126 status mismatch: {patch_id}")
        path = patch_path(root, vendor_root, expected_path)
        actual_hash = sha256(path.read_bytes())
        require(actual_hash == expected_hash, f"fixed P126 patch bytes/hash mismatch: {patch_id}")
        if patch_id not in ("M-065", "M-066", "M-067", "M-068"):
            frozen = frozen_bytes(root, RUNTIME_BASE, f"vendor/upstream/{expected_path}")
            require(path.read_bytes() == frozen, f"source patch bytes changed from the fixed development base: {patch_id}")

    m065_targets = actual_by_id["M-065"].get("targets")
    expected_m065_targets = {
        "packages/app/src/runtime/plugin/host-apis.test.tsx",
        "packages/app/src/runtime/plugin/host-apis.tsx",
    }
    require(
        isinstance(m065_targets, list)
        and all(isinstance(target, str) for target in m065_targets)
        and len(set(m065_targets)) == len(m065_targets)
        and set(m065_targets) == expected_m065_targets,
        "M-065 targets expanded beyond the real host API and its test",
    )
    m066_targets = actual_by_id["M-066"].get("targets")
    require(
        isinstance(m066_targets, list)
        and all(isinstance(target, str) for target in m066_targets)
        and len(set(m066_targets)) == len(m066_targets)
        and set(m066_targets) == {"packages/app/src/composer/submit.test.ts"},
        "M-066 targets expanded beyond the composer submit test",
    )
    fixed_targets = {
        "M-067": {
            "packages/app/e2e/utils/mock-server.ts",
            "packages/app/vite.js",
        },
        "M-068": {
            "packages/app/e2e/regression/composer.spec.ts",
            "packages/app/e2e/utils/app-direction.fixture.tsx",
        },
    }
    for patch_id, targets in fixed_targets.items():
        actual_targets = actual_by_id[patch_id].get("targets")
        require(
            isinstance(actual_targets, list)
            and all(isinstance(target, str) for target in actual_targets)
            and len(set(actual_targets)) == len(actual_targets)
            and set(actual_targets) == targets,
            f"{patch_id} targets expanded beyond its two approved E2E compatibility files",
        )

    # Every active metadata record and both manifest twins must be exact, not merely mutually consistent.
    expected_records: list[dict[str, Any]] = []
    for patch_id in expected_order:
        if patch_id in original_active:
            record = {**original_active[patch_id], "status": "active"}
        elif patch_id in expected_sources:
            record = actual_by_id[patch_id]
        else:
            raise ValidationFailure(f"active patch is not registered in the fixed base or P126 map: {patch_id}")
        expected_records.append(record)
    deferred_record = actual_by_id["M-063"]
    expected_records.append(deferred_record)
    require(projected_registry(current) == projected_registry(expected_records), "registry projection differs from fixed active/deferred order")
    expected_paths = [p["patch"] for p in expected_records[:65]]
    require(vendor.get("mobilePatches") == expected_paths, "vendor-manifest active path list/order differs from the exact runtime order")
    expected_shared = projected_registry(expected_records)
    require(vendor.get("mobilePatchRegistry") == expected_shared, "vendor mobilePatchRegistry differs from fixed registry")
    require(provenance.get("mobilePatchRegistry") == expected_shared, "provenance mobilePatchRegistry differs from fixed registry")
    require(vendor.get("deferredMobilePatches") == [expected_shared[-1]], "vendor deferred inventory is not exactly M-063")
    require(provenance.get("deferredMobilePatches") == [expected_shared[-1]], "provenance deferred inventory is not exactly M-063")
    require(order.get("deferredPatches") == [expected_shared[-1]], "replay-order deferred inventory is not exactly M-063")

    source_ids = ["M-057", "M-058", "M-065", "M-059", "M-060", "M-061", "M-062", "M-064", "M-066", "M-067", "M-068", "M-063"]
    ledger = provenance.get("p126RuntimePatchSources")
    require(isinstance(ledger, list) and [entry.get("id") for entry in ledger] == source_ids, "P126 runtime source hunk ledger IDs/order mismatch")
    ledger_by_id = {entry["id"]: entry for entry in ledger}
    patch_files: dict[str, Path] = {}
    registry_sources = {**actual_by_id}
    for patch_id in source_ids:
        record = registry_sources[patch_id]
        path = patch_path(root, vendor_root, record["patch"])
        digest, parsed_files = parse_patch(path)
        expected_status = "deferred-source-only" if patch_id == "M-063" else "active"
        entry = ledger_by_id[patch_id]
        require(entry.get("path") == record["patch"] and entry.get("sha256") == digest, f"source ledger ID/path/hash mismatch: {patch_id}")
        require(entry.get("status") == expected_status and entry.get("applied") is (expected_status == "active"), f"source ledger status mismatch: {patch_id}")
        require(entry.get("files") == parsed_files, f"source file add/delete/hunk ledger differs from immutable bytes: {patch_id}")
        parsed_targets = [item["path"] for item in parsed_files]
        registered_targets = record.get("targets")
        require(
            isinstance(registered_targets, list)
            and all(isinstance(target, str) for target in registered_targets)
            and len(set(registered_targets)) == len(registered_targets)
            and sorted(registered_targets) == sorted(parsed_targets),
            f"metadata targets differ from patch hunk targets: {patch_id}",
        )
        patch_files[patch_id] = path

    # Fixed contracts explicitly forbid touching the already-target tool schema or moving voice into scope.
    all_p126_targets = {item["path"] for entry in ledger for item in entry["files"]}
    require("packages/schema/src/tool.ts" not in all_p126_targets, "P126 unexpectedly changes the already-target schema/tool.ts")
    tool_path = vendor_root / "packages/schema/src/tool.ts"
    target_tool = subprocess.run(
        ["git", "-C", str(cache), "show", f"{UPSTREAM_TARGET}:packages/schema/src/tool.ts"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    require(target_tool.returncode == 0, "fixed v2.2.1 schema/tool.ts source object is unavailable")
    require(tool_path.read_bytes() == target_tool.stdout, "schema/tool.ts differs from the fixed target object")
    route_source = (vendor_root / "packages/app/src/shell/routes/routes.tsx").read_text()
    require("!getMobileHosts().initialScreenOwned()" in route_source, "M-060 mobile-hosts initialScreenOwned gate was lost")
    composer_region = (vendor_root / "packages/app/src/session/composer/region.tsx").read_text()
    require(
        'from "@/voice/composer"' not in composer_region and "<VoiceComposer" not in composer_region,
        "deferred VoiceComposer wrapper/import was activated",
    )
    require(any("VoiceComposer" in line and line.startswith("-") for line in patch_files["M-060"].read_text().splitlines()), "M-060 voice deferral hunk is not traceable to its source patch")
    host_apis = (vendor_root / "packages/app/src/runtime/plugin/host-apis.tsx").read_text()
    require("projects.open(directory)" in host_apis and "projects.add(directory)" not in host_apis, "M-065 projects.open compatibility hunk is absent or broadened")
    require(not any("/extensions/" in path or "extension-store" in path.lower() for path in all_p126_targets), "P126 source list unexpectedly adds an Extensions store target")

    target_mock_server = subprocess.run(
        ["git", "-C", str(cache), "show", f"{UPSTREAM_TARGET}:packages/app/e2e/utils/mock-server.ts"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    require(target_mock_server.returncode == 0, "fixed v2.2.1 mock-server source object is unavailable")
    helper_start = b"// Answers the first model list as a cold Location does when its plugins outlast the server's wait."
    helper_end = b"\n\n// Mocks several servers on one page."
    current_mock_server = (vendor_root / "packages/app/e2e/utils/mock-server.ts").read_bytes()
    try:
        target_start = target_mock_server.stdout.index(helper_start)
        target_end = target_mock_server.stdout.index(helper_end, target_start)
        current_start = current_mock_server.index(helper_start)
        current_end = current_mock_server.index(helper_end, current_start)
    except ValueError as error:
        raise ValidationFailure("M-067 fixed-target mockPluginsActivating helper boundary is missing") from error
    require(
        current_mock_server[current_start:current_end] == target_mock_server.stdout[target_start:target_end],
        "M-067 mockPluginsActivating differs from the fixed upstream helper",
    )
    require(
        b"transform: { jsx: { runtime: \"classic\" } }" in (vendor_root / "packages/app/vite.js").read_bytes(),
        "M-067 optimizer-only classic JSX transform is absent",
    )
    target_fixture = subprocess.run(
        ["git", "-C", str(cache), "show", f"{UPSTREAM_TARGET}:packages/app/e2e/utils/app-direction.fixture.tsx"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    require(target_fixture.returncode == 0, "fixed v2.2.1 app-direction fixture source object is unavailable")
    require(
        (vendor_root / "packages/app/e2e/utils/app-direction.fixture.tsx").read_bytes() == target_fixture.stdout,
        "M-068 app-direction fixture differs from the complete fixed upstream target copy",
    )

    # Ensure all registered sources are confined and hashed, including the original 56 entries.
    resolved = safe_registered_records(root, vendor_root, current)
    require(resolved["M-037"].read_bytes() == frozen_bytes(root, RUNTIME_BASE, f"vendor/upstream/{original_active['M-037']['patch']}"), "M-037 original source bytes changed")
    require(resolved["M-062"].read_bytes() == frozen_bytes(root, RUNTIME_BASE, f"vendor/upstream/{original_active['M-062']['patch']}"), "M-062 original source bytes changed")

    # Ensure upstream git objects referenced by this closure are the fixed ones, not refreshed refs.
    for revision in [vendor["upstream"]["pin"], *vendor["packageSources"].values(), UPSTREAM_TARGET]:
        result = subprocess.run(["git", "-C", str(cache), "cat-file", "-e", f"{revision}^{{commit}}"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        require(result.returncode == 0, f"fixed upstream source commit is unavailable in cache: {revision}")

    active_patch_paths = [resolved[p["id"]] for p in expected_records[:65]]
    return expected_records, active_patch_paths


def run_runtime(root: Path, base: str, cache: Path, evidence: Path) -> None:
    require(base == RUNTIME_BASE, "runtime profile base does not match fixed afef1b9 development base")
    head = str(git(root, "rev-parse", "--verify", "HEAD^{commit}")).strip()
    ancestor = subprocess.run(["git", "-C", str(root), "merge-base", "--is-ancestor", base, head], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    require(ancestor.returncode == 0, "fixed runtime base is not an ancestor of candidate HEAD")

    base_manifest = git_json(root, base, "vendor/upstream/patches/mobile/manifest.json")
    base_vendor = git_json(root, base, "vendor/upstream/vendor-manifest.json")
    cache = cache.resolve(strict=True)
    records, patch_paths = runtime_metadata(root, cache, base_manifest, base_vendor)
    vendor_root = root / "vendor/upstream"
    packages = vendor_root / "packages"
    require(not packages.is_symlink() and packages.resolve(strict=True) == packages, "vendor package tree is symlinked or non-canonical")

    expected_order = [record["id"] for record in records[:65]]
    (evidence / "runtime-active-order.txt").write_text("\n".join(expected_order) + "\n")
    (evidence / "runtime-source-hashes.tsv").write_text(
        "\n".join(f"{record['id']}\t{record['patch']}\t{record['sha256']}\t{record['status']}" for record in records) + "\n"
    )
    print(f"runtime policy: PASS active=65 deferred=1 M-063=deferred source IDs/order/hash/status locked")
    print(f"runtime metadata: PASS base={base} target={UPSTREAM_TARGET} packageSources preserved; M-037/M-062 bytes fixed")
    print(f"runtime provenance ledger: PASS entries=12 file-records={sum(len(x['files']) for x in regular_json(root, 'vendor/upstream/provenance.json')['p126RuntimePatchSources'])}; M-065 targets only host-apis.tsx + host-apis.test.tsx; M-066 targets only submit.test.ts; M-067/M-068 target only their approved two E2E files")

    with tempfile.TemporaryDirectory(prefix="p126-runtime-replay-", dir=os.environ.get("TMPDIR")) as temp_name:
        work = Path(temp_name).resolve()
        pristine_a = work / "pristine-a"
        forward_a = work / "forward-a"
        reverse_a = work / "reverse-a"
        pristine_b = work / "pristine-b"
        forward_b = work / "forward-b"
        for path in (pristine_a, forward_a, reverse_a, pristine_b, forward_b):
            path.mkdir()
        immutable_sources(cache, base_vendor, pristine_a)
        immutable_sources(cache, base_vendor, pristine_b)
        shutil.copytree(pristine_a, forward_a, symlinks=True, dirs_exist_ok=True)
        apply_chain(work, forward_a, patch_paths, log=evidence / "runtime-forward-a.tsv")
        shutil.copytree(forward_a, reverse_a, symlinks=True, dirs_exist_ok=True)
        apply_chain(work, reverse_a, patch_paths, reverse=True, log=evidence / "runtime-reverse.tsv")
        compare_trees(root, pristine_a, reverse_a, "runtime reverse roundtrip vs independent pristine A")
        shutil.copytree(pristine_b, forward_b, symlinks=True, dirs_exist_ok=True)
        apply_chain(work, forward_b, patch_paths, log=evidence / "runtime-forward-b.tsv")
        compare_trees(root, forward_a, forward_b, "runtime independent pristine forward replay A vs B")
        compare_trees(root, forward_a / "packages", packages, "runtime candidate vendor packages vs exact 65-patch replay")

    print("runtime replay: PASS pristine→65 active→reverse==independent pristine; separate pristine→65 active matches candidate (packages/app/e2e/test-results excluded by exact path)")
    print("verify-closure: PASS profile=p126-runtime")


def historical_block1(root: Path, base: str, cache: Path, evidence: Path) -> None:
    require(base == HISTORICAL_BASE, "historical profile base does not match frozen d37260c commit")
    # d372 is the fixed upstream/vendor base. The frozen Block 1 candidate
    # (including its metadata and registered source blobs) is the merge commit
    # that recorded that closure; never read those inputs from the live worktree.
    ancestor = subprocess.run(
        ["git", "-C", str(root), "merge-base", "--is-ancestor", base, HISTORICAL_SNAPSHOT],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    require(ancestor.returncode == 0, "frozen Block 1 snapshot is not descended from the fixed historical base")
    manifest = git_json(root, HISTORICAL_SNAPSHOT, "vendor/upstream/patches/mobile/manifest.json")
    vendor = git_json(root, HISTORICAL_SNAPSHOT, "vendor/upstream/vendor-manifest.json")
    provenance = git_json(root, HISTORICAL_SNAPSHOT, "vendor/upstream/provenance.json")
    order = git_json(root, HISTORICAL_SNAPSHOT, "vendor/upstream/patches/mobile/p126-replay-order.json")
    for name, document in (("manifest", manifest), ("vendor-manifest", vendor), ("provenance", provenance)):
        require(canonical_json(document.get("block1PatchPolicy")) == canonical_json(BLOCK1_POLICY), f"frozen historical Block 1 policy mismatch in {name}")
    base_active = manifest["patches"][:56]
    deferred = manifest["patches"][56:]
    require(len(base_active) == 56 and len(deferred) == 6, "frozen Block 1 registry counts mismatch")
    require(vendor.get("mobilePatches") == [p["patch"] for p in base_active], "frozen Block 1 mobilePatches does not equal its first 56 active paths")
    require([p.get("status") for p in base_active] == ["active"] * 56, "frozen Block 1 active status boundary mismatch")
    require([p.get("status") for p in deferred] == ["deferred-source-only"] * 6, "frozen Block 1 deferred status boundary mismatch")
    require(order.get("status") == "future-contract-only" and order.get("applied") is False, "frozen historical replay-order contract was mutated")
    expected_future = [p["id"] for p in base_active if p["id"] not in ("M-061", "M-062")] + ["M-057", "M-058", "M-059", "M-060", "M-061", "M-062", "M-063", "M-064"]
    require(order.get("activeClosureOrder") == [p["id"] for p in base_active] and order.get("futureReplayOrder") == expected_future, "frozen historical future-order contract mismatch")
    require(vendor.get("mobilePatchRegistry") == provenance.get("mobilePatchRegistry"), "frozen historical registry twins disagree")
    require(vendor.get("deferredMobilePatches") == provenance.get("deferredMobilePatches"), "frozen historical deferred twins disagree")

    historical_records = [*base_active, *deferred]
    # Resolve source bytes exclusively from the frozen Block 1 snapshot into a private input tree.
    frozen_root = evidence / "historical-frozen-inputs"
    frozen_root.mkdir()
    frozen_vendor = frozen_root / "vendor/upstream"
    (frozen_vendor / "patches/mobile").mkdir(parents=True)
    for relative in (
        "vendor/upstream/vendor-manifest.json",
        "vendor/upstream/patches/mobile/manifest.json",
        "vendor/upstream/patches/mobile/p126-replay-order.json",
        "vendor/upstream/provenance.json",
    ):
        output = frozen_root / relative
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(frozen_bytes(root, HISTORICAL_SNAPSHOT, relative))
    frozen_patch_paths: list[Path] = []
    for record in historical_records:
        relative = f"vendor/upstream/{record['patch']}"
        target = frozen_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        blob = frozen_bytes(root, HISTORICAL_SNAPSHOT, relative)
        require(sha256(blob) == record["sha256"], f"frozen historical patch hash mismatch: {record['id']}")
        target.write_bytes(blob)
        if record["status"] == "active":
            frozen_patch_paths.append(target)
    (evidence / "historical-source-origin.txt").write_text(
        f"historical base: {base}\nfrozen metadata and source patches: {HISTORICAL_SNAPSHOT}:<path>\n"
    )

    # Extract the historical candidate package tree from the historical commit, not the current worktree.
    with tempfile.TemporaryDirectory(prefix="p126-block1-history-", dir=os.environ.get("TMPDIR")) as temp_name:
        work = Path(temp_name).resolve()
        pristine = work / "pristine"
        replay = work / "replay"
        candidate = work / "historical-candidate"
        for path in (pristine, replay, candidate):
            path.mkdir()
        immutable_sources(cache.resolve(strict=True), vendor, pristine)
        shutil.copytree(pristine, replay, symlinks=True, dirs_exist_ok=True)
        apply_chain(work, replay, frozen_patch_paths, log=evidence / "historical-forward.tsv")
        archive = work / "historical-packages.tar"
        with archive.open("wb") as stream:
            result = subprocess.run(["git", "-C", str(root), "archive", HISTORICAL_SNAPSHOT, "--", "vendor/upstream/packages"], stdout=stream, stderr=subprocess.PIPE, check=False)
        require(result.returncode == 0, f"cannot archive frozen historical candidate tree: {result.stderr.decode('utf-8','replace')}")
        result = subprocess.run(["tar", "-x", "-f", str(archive), "-C", str(candidate)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        require(result.returncode == 0, f"cannot extract frozen historical candidate tree: {result.stderr.decode('utf-8','replace')}")
        candidate_packages = candidate / "vendor/upstream/packages"
        compare_trees(root, replay / "packages", candidate_packages, "frozen Block 1 candidate vs pin + packageSources + 56 active patches")

    print(f"historical fixture: PASS profile=historical-block1 base={base} snapshot={HISTORICAL_SNAPSHOT} frozen metadata/source; active=56 deferred=6")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--profile", choices=("p126-runtime", "historical-block1"), required=True)
    parser.add_argument("--base", required=True)
    parser.add_argument("--evidence-dir", required=True, type=Path)
    parser.add_argument("--upstream-cache", type=Path, default=Path(os.environ.get("OPENCODE_UPSTREAM_CACHE", "~/.cache/opencode-upstream")).expanduser())
    parser.add_argument("--candidate-head")
    args = parser.parse_args()
    root = args.repo.resolve(strict=True)
    require(root.is_dir(), "--repo is not a directory")
    top = str(git(root, "rev-parse", "--show-toplevel")).strip()
    require(Path(top).resolve() == root, "--repo must name the Git worktree root")
    evidence = args.evidence_dir.resolve(strict=True)
    require(evidence.is_dir(), "evidence directory does not exist or is not a directory")
    require(not evidence.is_relative_to(root), "evidence directory must be outside candidate repo")

    evidence_outputs = (
        ("runtime-active-order.txt", "runtime-source-hashes.tsv", "runtime-forward-a.tsv", "runtime-reverse.tsv", "runtime-forward-b.tsv")
        if args.profile == "p126-runtime"
        else ("historical-frozen-inputs", "historical-source-origin.txt", "historical-forward.tsv")
    )
    for relative in evidence_outputs:
        require(not (evidence / relative).exists(), f"refusing to overwrite existing evidence output: {relative}")

    if args.profile == "p126-runtime":
        require(args.base == RUNTIME_BASE, "base does not match the fixed p126-runtime profile")
        if args.candidate_head:
            candidate = str(git(root, "rev-parse", "--verify", f"{args.candidate_head}^{{commit}}")).strip()
            head = str(git(root, "rev-parse", "--verify", "HEAD^{commit}")).strip()
            require(candidate == head, "candidate HEAD does not match --candidate-head")
            require(not str(git(root, "status", "--porcelain=v1", "--untracked-files=all")).strip(), "candidate checkout is dirty in committed-state mode")
            require(args.candidate_head == head, "--candidate-head must be the full resolved commit SHA")
            print(f"candidate state: committed HEAD={head} clean=true")
        else:
            print(f"candidate state: worktree HEAD={str(git(root, 'rev-parse', '--verify', 'HEAD^{commit}')).strip()} (uncommitted changes are verified directly)")
        run_runtime(root, args.base, args.upstream_cache, evidence)
    elif args.profile == "historical-block1":
        require(args.candidate_head is None, "--candidate-head is not applicable to the frozen historical profile")
        require(args.base == HISTORICAL_BASE, "base does not match the fixed historical-block1 profile")
        historical_block1(root, args.base, args.upstream_cache, evidence)
    else:
        raise ValidationFailure("unknown profile; no automatic profile downgrade is permitted")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ValidationFailure as error:
        print(f"verify-closure: FAIL {error}", file=sys.stderr)
        sys.exit(1)
    except Exception as error:  # Unexpected validator failures are failures, never empty-set passes.
        print(f"verify-closure: FAIL unexpected validator error: {type(error).__name__}: {error}", file=sys.stderr)
        sys.exit(125)
