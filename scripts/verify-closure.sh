#!/usr/bin/env bash
# verify-closure.sh — V3 closure verification.
#
# (a) Tree equivalence: vendor/upstream/{packages,LICENSE} is byte-identical to the pinned
#     upstream tree with exactly the registered mobile patches applied — zero other diff.
# (b) Workspace-reference consistency: every `workspace:*` reference inside the 11 vendored
#     packages resolves to a package inside the closure; no dangling references.
#
# Usage: scripts/verify-closure.sh
# Environment:
#   OPENCODE_UPSTREAM_CACHE  path to the upstream cache clone.
#   TMPDIR                   scratch space (the script refuses a /tmp TMPDIR by default to
#                            stay inside a roomier filesystem; override explicitly if needed).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/vendor/upstream"
MANIFEST="$DEST/vendor-manifest.json"
CACHE="${OPENCODE_UPSTREAM_CACHE:-$HOME/.cache/opencode-upstream}"

python3 "$ROOT/scripts/mobile-patches.py"

PIN="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["upstream"]["pin"])' "$MANIFEST")"
PACKAGES="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["packages"]))' "$MANIFEST")"
PATCH_CREATED="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1])).get("patchCreatedPackages", [])))' "$MANIFEST")"
WORKSPACE_PACKAGES="$PACKAGES $PATCH_CREATED"
TOPFILES="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["topLevelFiles"]))' "$MANIFEST")"
MOBILE_PATCHES="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["mobilePatches"]))' "$MANIFEST")"
PARTIALS="$(python3 -c 'import json,sys; print(" ".join(e["path"] for e in json.load(open(sys.argv[1])).get("partialPackages", [])))' "$MANIFEST")"
# Per-package extraction revisions (issue #67): manifest "packageSources" overrides the
# pin for the listed packages; the pristine tree is built under the same rule as
# scripts/vendor-sync.sh so both sides of the equivalence check agree.
declare -A PKG_REV
while read -r p r; do PKG_REV["$p"]="$r"; done < <(python3 - "$MANIFEST" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
for p, r in (m.get("packageSources") or {}).items():
    print(f"{p} {r}")
PY
)

SCRATCH="${TMPDIR:-}"
case "$SCRATCH" in
  ""|/tmp|/tmp/) SCRATCH="${HOME}/.cache/opencode-mobile-verify-tmp" ;;
esac
mkdir -p "$SCRATCH"
trap 'rm -rf "$SCRATCH/verify-closure.$$"' EXIT
# git apply --directory needs a path relative to the CWD it runs from, so work from $SCRATCH.
WORK_REL="verify-closure.$$"
WORK="$SCRATCH/$WORK_REL"
mkdir -p "$WORK/pristine"

status=0

# ---------- (a) tree equivalence ----------
PATHSPEC=()
for p in $PACKAGES; do
  [ -n "${PKG_REV[$p]:-}" ] || PATHSPEC+=("packages/$p")
done
for f in $TOPFILES; do PATHSPEC+=("$f"); done
for f in $PARTIALS; do PATHSPEC+=("$f"); done

git -C "$CACHE" archive "$PIN" -- "${PATHSPEC[@]}" \
  | tar -x --exclude='packages/ai/test/fixtures/recordings' -C "$WORK/pristine"
for p in $PACKAGES; do
  r="${PKG_REV[$p]:-}"
  [ -n "$r" ] || continue
  git -C "$CACHE" archive "$r" -- "packages/$p" \
    | tar -x --exclude='packages/ai/test/fixtures/recordings' -C "$WORK/pristine"
done

for mp in $MOBILE_PATCHES; do
  (cd "$SCRATCH" && git apply --directory="$WORK_REL/pristine" --check "$DEST/$mp") \
    || { echo "V3(a) FAIL: mobile patch $mp does not apply to pristine tree (pin + packageSources)"; exit 1; }
  (cd "$SCRATCH" && git apply --directory="$WORK_REL/pristine" "$DEST/$mp")
done

DIFFS="$(diff -r \
  --exclude=node_modules --exclude=dist --exclude=.vite --exclude=.turbo \
  "$WORK/pristine/packages" "$DEST/packages" 2>&1 || true)"
if [ -n "$DIFFS" ]; then
  echo "V3(a) FAIL: vendor packages tree differs from pin tree + registered patches:"
  echo "$DIFFS" | head -40
  status=1
else
  SOURCES_NOTE="(per-package sources:"
  for p in $PACKAGES; do
    SOURCES_NOTE="$SOURCES_NOTE $p=${PKG_REV[$p]:-$PIN}"
  done
  SOURCES_NOTE="$SOURCES_NOTE)"
  echo "V3(a) OK: vendor packages tree == pin $PIN + packageSources + registered mobile patches, byte-identical $SOURCES_NOTE (install/build artifact dirs node_modules|dist|.vite|.turbo excluded)"
fi

# diff -r compares contents, not Git executable bits or symlink identity.
if ! python3 - "$WORK/pristine" "$DEST" $TOPFILES <<'PY'
import os
from pathlib import Path
import sys

def modes(root):
    result = {}
    for directory, dirs, files in os.walk(root / "packages"):
        dirs[:] = [d for d in dirs if d not in {"node_modules", "dist", ".vite", ".turbo"}]
        for name in dirs[:] + files:
            path = Path(directory) / name
            if path.is_symlink():
                result[path.relative_to(root).as_posix()] = ("symlink", os.readlink(path))
                if name in dirs:
                    dirs.remove(name)
            elif path.is_file():
                result[path.relative_to(root).as_posix()] = ("file", bool(path.stat().st_mode & 0o100))
    for name in sys.argv[3:]:
        path = root / name
        if path.is_symlink():
            result[name] = ("symlink", os.readlink(path))
        elif path.is_file():
            result[name] = ("file", bool(path.stat().st_mode & 0o100))
        else:
            result[name] = ("missing-or-not-file",)
    return result

expected, actual = map(modes, map(Path, sys.argv[1:3]))
different = [p for p in sorted(expected.keys() | actual.keys()) if expected.get(p) != actual.get(p)]
if different:
    print("V3(a) FAIL: file types/executable bits/symlinks differ:", *different[:40], sep="\n")
    sys.exit(1)
print("V3(a) OK: file types, executable bits and symlinks match")
PY
then
  status=1
fi

for f in $TOPFILES; do
  if cmp -s "$WORK/pristine/$f" "$DEST/$f"; then
    echo "V3(a) OK: $f byte-identical to pin"
  else
    echo "V3(a) FAIL: $f differs from pin"
    status=1
  fi
done

# ---------- (b) workspace reference consistency ----------
CLOSURE_NAMES="$(python3 - "$DEST" $WORKSPACE_PACKAGES <<'PY'
import json, sys
dest, packages = sys.argv[1], sys.argv[2:]
names = {}
for p in packages:
    d = json.load(open(f"{dest}/packages/{p}/package.json"))
    names[d["name"]] = p
print(" ".join(names))
PY
)"
WORKSPACE_REFS="$(python3 - "$DEST" $WORKSPACE_PACKAGES <<'PY'
import json, sys
dest, packages = sys.argv[1], sys.argv[2:]
names = {}
for p in packages:
    d = json.load(open(f"{dest}/packages/{p}/package.json"))
    names[d["name"]] = p
dangling = 0
for p in packages:
    d = json.load(open(f"{dest}/packages/{p}/package.json"))
    for section in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"):
        for dep, spec in (d.get(section) or {}).items():
            if isinstance(spec, str) and spec.startswith("workspace:"):
                if dep in names:
                    print(f"  ok   {p} {section} {dep} -> {names[dep]}")
                else:
                    print(f"  FAIL {p} {section} {dep} (dangling, not in closure)")
                    dangling += 1
print(f"DANGLING={dangling}")
PY
)"
echo "$WORKSPACE_REFS"
if echo "$WORKSPACE_REFS" | grep -q "DANGLING=0"; then
  echo "V3(b) OK: all workspace:* references resolve inside the closure"
else
  echo "V3(b) FAIL: dangling workspace references found"
  status=1
fi

# ---------- file-level exclusion check ----------
if [ -e "$DEST/packages/ai/test/fixtures/recordings" ]; then
  echo "V3(c) FAIL: excluded recordings directory present in vendor tree"
  status=1
else
  echo "V3(c) OK: packages/ai/test/fixtures/recordings excluded"
fi

if [ "$status" -eq 0 ]; then
  echo "verify-closure: PASS"
else
  echo "verify-closure: FAIL"
fi
exit "$status"
