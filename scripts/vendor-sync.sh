#!/usr/bin/env bash
# vendor-sync.sh — acquire the vendored upstream frontend closure.
#
# Reads vendor/upstream/vendor-manifest.json, extracts the registered packages plus the
# upstream patch subset from the local blobless clone of the upstream repository
# (default ~/.cache/opencode-upstream), applies the registered mobile patches and prints
# provenance facts. The tree is rebuilt from scratch on every run: the vendor tree must
# always equal "pin tree + registered patches" (checked by scripts/verify-closure.sh).
#
# Usage:
#   scripts/vendor-sync.sh [revision]
#     revision  optional git revision (sha, ref) inside the upstream cache; defaults to
#               the pin recorded in vendor/upstream/vendor-manifest.json.
#
# Environment:
#   OPENCODE_UPSTREAM_CACHE  path to the upstream cache clone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/vendor/upstream"
MANIFEST="$DEST/vendor-manifest.json"
CACHE="${OPENCODE_UPSTREAM_CACHE:-$HOME/.cache/opencode-upstream}"

command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
command -v python3 >/dev/null || { echo "python3 is required" >&2; exit 1; }
[ -d "$CACHE/.git" ] || { echo "upstream cache not found at $CACHE" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "vendor manifest not found at $MANIFEST" >&2; exit 1; }

# Fail on invalid registration before deleting or rebuilding any vendored source.
python3 "$ROOT/scripts/mobile-patches.py"

PIN="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["upstream"]["pin"])' "$MANIFEST")"
REV="${1:-$PIN}"
FULL="$(git -C "$CACHE" rev-parse --verify "$REV^{commit}")"
DATE="$(git -C "$CACHE" log -1 --format=%cI "$FULL")"
SUBJECT="$(git -C "$CACHE" log -1 --format=%s "$FULL")"

# Per-package extraction revisions (issue #67): packages listed in manifest
# "packageSources" extract from their own revision instead of the pin. A package born
# after the pin (gui-plugins, upstream dae4077a96) is acquired from the v2.2.1 release
# tree this way; every other package keeps the pin.
PACKAGES="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["packages"]))' "$MANIFEST")"
declare -A PKG_REV
while read -r p r; do PKG_REV["$p"]="$r"; done < <(python3 - "$MANIFEST" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
for p, r in (m.get("packageSources") or {}).items():
    print(f"{p} {r}")
PY
)
TOPFILES="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["topLevelFiles"]))' "$MANIFEST")"
PARTIALS="$(python3 -c 'import json,sys; print(" ".join(e["path"] for e in json.load(open(sys.argv[1])).get("partialPackages", [])))' "$MANIFEST")"
PATCHMAP_LEN="$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["upstreamPatches"]))' "$MANIFEST")"

echo "vendor-sync: upstream $FULL ($DATE) \"$SUBJECT\""
if [ "$FULL" != "$PIN" ]; then
  echo "vendor-sync: WARNING manifest pin is $PIN; extracting requested revision $FULL"
fi

# 1. Extract the closure packages, top-level files and the upstream patch subset from the
#    pinned tree (packageSources overrides per package). File-level excludes are dropped
#    during extraction (recordings).
PATHSPEC=()
for p in $PACKAGES; do
  [ -n "${PKG_REV[$p]:-}" ] || PATHSPEC+=("packages/$p")
done
for f in $TOPFILES; do PATHSPEC+=("$f"); done
for f in $PARTIALS; do PATHSPEC+=("$f"); done

rm -rf "$DEST/packages"
mkdir -p "$DEST/packages" "$DEST/patches"
if [ ${#PATHSPEC[@]} -gt 0 ]; then
  git -C "$CACHE" archive "$FULL" -- "${PATHSPEC[@]}" \
    | tar -x --exclude='packages/ai/test/fixtures/recordings' -C "$DEST"
fi
for p in $PACKAGES; do
  r="${PKG_REV[$p]:-}"
  [ -n "$r" ] || continue
  git -C "$CACHE" archive "$r" -- "packages/$p" \
    | tar -x --exclude='packages/ai/test/fixtures/recordings' -C "$DEST"
  echo "vendor-sync: package $p extracted from packageSources $r"
done

# 2. Extract the registered upstream npm patch files from the same revision.
python3 - "$MANIFEST" "$CACHE" "$FULL" "$DEST" <<'PY'
import json, subprocess, sys
manifest, cache, full, dest = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
patches = json.load(open(manifest))["upstreamPatches"]
for key, rel in sorted(patches.items()):
    upstream_path = rel.removeprefix("patches/")  # manifest paths are vendor-relative
    blob = subprocess.run(
        ["git", "-C", cache, "show", f"{full}:patches/{upstream_path}"],
        check=True, capture_output=True,
    ).stdout
    with open(f"{dest}/{rel}", "wb") as fh:
        fh.write(blob)
    print(f"vendor-sync: upstream patch {key} -> {rel} ({len(blob)} bytes)")
PY

# 3. Apply the registered mobile patches in manifest order, checking each patch right
#    before applying it. The chain is order-dependent (later patches anchor on earlier
#    hunks, e.g. connection-credential-reference anchors on connection-password-memory-only's MemoryOnlyPassword field), so a check-all-then-
#    apply-all sweep would reject order-dependent patches against the pristine tree.
#    (Issue #67 fix: the previous two-loop form only passed when the tree it ran against
#    was already fully patched; verify-closure.sh has always checked per patch.)
MOBILE_PATCHES="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["mobilePatches"]))' "$MANIFEST")"
for mp in $MOBILE_PATCHES; do
  git -C "$ROOT" apply --directory=vendor/upstream --check "$DEST/$mp"
  git -C "$ROOT" apply --directory=vendor/upstream "$DEST/$mp"
  echo "vendor-sync: applied mobile patch $mp"
done

# 4. Provenance facts.
echo "vendor-sync: manifest upstreamPatches=$PATCHMAP_LEN"
for p in $PACKAGES; do
  echo "vendor-sync: package source $p = ${PKG_REV[$p]:-$FULL}"
done
echo "vendor-sync: ghostty-web pin $(grep -o 'ghostty-web#[0-9a-f]*' "$DEST/packages/app/package.json" | head -1)"
echo "vendor-sync: done — tree rebuilt at $DEST"

if [ "$FULL" != "$PIN" ]; then
  echo "vendor-sync: NOTE vendor/upstream now holds revision $FULL while the manifest pin is $PIN."
  echo "vendor-sync:       Update the manifest pin + provenance before committing (maintainer decision)."
fi
