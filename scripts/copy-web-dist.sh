#!/usr/bin/env bash
# copy-web-dist.sh — copy the built web app into the Android WebView assets directory and
# record a sha256 manifest of everything that was copied.
#
# The payload itself is gitignored (android/app/src/main/assets/web/, and the vite output
# dist/); the committed record is web-dist/manifest.json. Rollback builds can be compared
# byte-for-byte against that manifest (preferred) or verified via scripts/verify-closure.sh
# plus a fresh build (fallback).
#
# Usage: scripts/copy-web-dist.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/vendor/upstream/packages/app/dist"
ASSETS="$ROOT/android/app/src/main/assets/web"
OUT_DIR="$ROOT/web-dist"
OUT="$OUT_DIR/manifest.json"

[ -d "$SRC" ] || { echo "copy-web-dist: $SRC missing — run 'bun run build:web' first" >&2; exit 1; }

rm -rf "$ASSETS"
mkdir -p "$ASSETS" "$OUT_DIR"
cp -a "$SRC/." "$ASSETS/"

python3 - "$SRC" "$OUT" <<'PY'
import hashlib, json, os, sys, time

src, out = sys.argv[1], sys.argv[2]
files = {}
for dirpath, _dirnames, filenames in os.walk(src):
    for name in sorted(filenames):
        full = os.path.join(dirpath, name)
        rel = os.path.relpath(full, src)
        h = hashlib.sha256()
        with open(full, "rb") as fh:
            for chunk in iter(lambda: fh.read(1 << 20), b""):
                h.update(chunk)
        files[rel] = h.hexdigest()

payload = {
    "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "source": "vendor/upstream/packages/app/dist",
    "copiedTo": "android/app/src/main/assets/web/",
    "fileCount": len(files),
    "totalBytes": sum(os.path.getsize(os.path.join(src, rel)) for rel in files),
    "files": dict(sorted(files.items())),
}
with open(out, "w") as fh:
    json.dump(payload, fh, indent=2, sort_keys=True)
    fh.write("\n")
print(f"copy-web-dist: {payload['fileCount']} files, {payload['totalBytes']} bytes -> manifest {out}")
PY
echo "copy-web-dist: payload copied to $ASSETS (gitignored)"
