#!/usr/bin/env bash
# verify-closure.sh — committed fixed-base, active-only V3 closure verification plus evidence log.
# No arguments: infer the candidate root from this script, pin the fixed base,
# and create a private external evidence directory with mktemp.
# Explicit arguments: all three of --repo, --base and --evidence-dir are required.
# Environment: OPENCODE_UPSTREAM_CACHE (default ~/.cache/opencode-upstream), TMPDIR (scratch/evidence parent).
set -euo pipefail

FIXED_BASE="d37260c002b4390060f7d6cd78ffe6a11e9e1012"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT_REPO="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
REPO_ARG=""
BASE_ARG=""
EVIDENCE_ARG=""
usage() { echo "usage: $0 --repo CANDIDATE_ROOT --base $FIXED_BASE --evidence-dir EXTERNAL_DIR" >&2; }
fail_args() { usage; exit 2; }
AUTO_EVIDENCE=0
if (($# == 0)); then
  REPO_ARG="$SCRIPT_REPO"
  BASE_ARG="$FIXED_BASE"
  AUTO_EVIDENCE=1
else
  REPO_SET=0
  BASE_SET=0
  EVIDENCE_SET=0
  while (($#)); do
    case "$1" in
      --repo)
        (($# >= 2)) || fail_args
        ((REPO_SET == 0)) || fail_args
        REPO_ARG="$2"
        [[ -n "$REPO_ARG" ]] || fail_args
        REPO_SET=1
        shift 2
        ;;
      --base)
        (($# >= 2)) || fail_args
        ((BASE_SET == 0)) || fail_args
        BASE_ARG="$2"
        [[ -n "$BASE_ARG" ]] || fail_args
        BASE_SET=1
        shift 2
        ;;
      --evidence-dir)
        (($# >= 2)) || fail_args
        ((EVIDENCE_SET == 0)) || fail_args
        EVIDENCE_ARG="$2"
        [[ -n "$EVIDENCE_ARG" ]] || fail_args
        EVIDENCE_SET=1
        shift 2
        ;;
      *) echo "verify-closure: FAIL invalid argument" >&2; fail_args ;;
    esac
  done
  [[ "$REPO_SET" == 1 && "$BASE_SET" == 1 && "$EVIDENCE_SET" == 1 ]] || fail_args
fi
[[ "$BASE_ARG" == "$FIXED_BASE" ]] || { echo "verify-closure: FAIL base does not match the fixed candidate base" >&2; exit 2; }
[[ -d "$REPO_ARG" ]] || { echo "verify-closure: FAIL candidate repo is not a directory" >&2; exit 2; }
ROOT="$(cd "$REPO_ARG" && pwd -P)"
GIT_ROOT="$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null)" || { echo "verify-closure: FAIL candidate repo is not a Git worktree" >&2; exit 2; }
[[ "$GIT_ROOT" == "$ROOT" ]] || { echo "verify-closure: FAIL --repo must name the worktree root" >&2; exit 2; }
BASE="$(git -C "$ROOT" rev-parse --verify "$BASE_ARG^{commit}" 2>/dev/null)" || { echo "verify-closure: FAIL base commit is unavailable" >&2; exit 2; }
[[ "$BASE" == "$FIXED_BASE" ]] || { echo "verify-closure: FAIL resolved base differs from fixed base" >&2; exit 2; }
HEAD="$(git -C "$ROOT" rev-parse --verify 'HEAD^{commit}' 2>/dev/null)" || { echo "verify-closure: FAIL candidate HEAD is not a commit" >&2; exit 1; }
if ! git -C "$ROOT" merge-base --is-ancestor "$BASE" "$HEAD"; then
  echo "verify-closure: FAIL fixed base is not an ancestor of candidate HEAD" >&2
  exit 1
fi
if [[ -n "$(git -C "$ROOT" status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "verify-closure: FAIL candidate checkout is dirty; validation is limited to committed HEAD" >&2
  exit 1
fi
if [[ "$AUTO_EVIDENCE" == 1 ]]; then
  TMP_PARENT=""
  for candidate in "${TMPDIR:-/tmp}" /tmp /var/tmp; do
    [[ -d "$candidate" ]] || continue
    candidate="$(cd "$candidate" && pwd -P)" || continue
    case "$candidate/" in "$ROOT/"*) continue ;; esac
    [[ -w "$candidate" && -x "$candidate" ]] || continue
    TMP_PARENT="$candidate"
    break
  done
  [[ -n "$TMP_PARENT" ]] || { echo "verify-closure: FAIL no writable external temp directory for evidence" >&2; exit 125; }
  EVIDENCE_ARG="$(mktemp -d "${TMP_PARENT%/}/verify-closure-evidence.XXXXXX")" || { echo "verify-closure: FAIL cannot create private evidence directory" >&2; exit 125; }
fi
mkdir -p "$EVIDENCE_ARG" || { echo "verify-closure: FAIL cannot create evidence directory" >&2; exit 125; }
EVIDENCE_DIR="$(cd "$EVIDENCE_ARG" && pwd -P)" || { echo "verify-closure: FAIL cannot resolve evidence directory" >&2; exit 125; }
case "$EVIDENCE_DIR/" in "$ROOT/"*) echo "verify-closure: FAIL evidence directory must be outside candidate repo" >&2; exit 2 ;; esac
LOG="$EVIDENCE_DIR/verify-closure.$$.log"
OUTPUT="$EVIDENCE_DIR/verify-closure.$$.output"
[[ ! -e "$LOG" && ! -e "$OUTPUT" ]] || { echo "verify-closure: FAIL evidence output path already exists" >&2; exit 125; }
: > "$LOG" || { echo "verify-closure: FAIL cannot write evidence log" >&2; exit 125; }
: > "$OUTPUT" || { echo "verify-closure: FAIL cannot write evidence output" >&2; exit 125; }

run_checks() {
DEST="$ROOT/vendor/upstream"
MANIFEST="$DEST/vendor-manifest.json"
CACHE="${OPENCODE_UPSTREAM_CACHE:-$HOME/.cache/opencode-upstream}"

PIN="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["upstream"]["pin"])' "$MANIFEST")"
PACKAGES="$(python3 -c 'import json,sys; print(" ".join(json.load(open(sys.argv[1]))["packages"]))' "$MANIFEST")"
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

# ---------- Block 1 fixed-base, active-only contract ----------
echo "Block 1 candidate: repo=$ROOT base=$BASE head=$HEAD evidence=$EVIDENCE_DIR"
if git -C "$ROOT" diff --quiet "$BASE" "$HEAD" -- vendor/upstream/packages; then
  echo "Block 1 runtime: PASS vendor/upstream/packages byte/tree state unchanged from base"
else
  echo "Block 1 runtime: FAIL vendor/upstream/packages differs from base" >&2
  exit 1
fi
python3 - "$ROOT" "$BASE" <<'PY_META'
import hashlib, json, subprocess, sys
from pathlib import Path, PurePosixPath
root = Path(sys.argv[1]).resolve(strict=True)
base = sys.argv[2]

def within(path, parent):
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False

vendor_path = root / "vendor/upstream"
vendor_root = vendor_path.resolve(strict=True)
if vendor_root != vendor_path or not within(vendor_root, root):
    raise SystemExit("FAIL: vendor/upstream resolves outside candidate repo")
patches_path = vendor_root / "patches"
patches_root = patches_path.resolve(strict=True)
if patches_root != patches_path or not within(patches_root, vendor_root):
    raise SystemExit("FAIL: vendor/upstream/patches resolves outside vendor tree")
mobile_path = patches_path / "mobile"
mobile_patch_dir = mobile_path.resolve(strict=True)
if not mobile_patch_dir.is_dir() or not within(mobile_patch_dir, patches_root):
    raise SystemExit("FAIL: mobile patch directory resolves outside vendor/upstream/patches")
if mobile_patch_dir != mobile_path:
    raise SystemExit("FAIL: mobile patch directory uses a symlinked or non-canonical parent")

def read_json(path):
    file_path = root / path
    if file_path.is_symlink() or not file_path.is_file():
        raise SystemExit(f"FAIL: metadata file is missing, symlinked, or not regular: {path}")
    return json.loads(file_path.read_text())
def base_json(path): return json.loads(subprocess.check_output(["git", "-C", str(root), "show", f"{base}:{path}"]))

def registered_patch_file(record):
    relative = record.get("patch")
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise SystemExit("FAIL: registered patch path is not a canonical relative POSIX path")
    posix = PurePosixPath(relative)
    parts = relative.split("/")
    if posix.is_absolute() or posix.as_posix() != relative or any(part in ("", ".", "..") for part in parts):
        raise SystemExit("FAIL: registered patch path is absolute, traversing, or non-canonical")
    if len(parts) != 3 or parts[:2] != ["patches", "mobile"]:
        raise SystemExit("FAIL: registered patch path is outside vendor/upstream/patches/mobile")
    path = vendor_root.joinpath(*parts)
    try:
        resolved = path.resolve(strict=True)
    except (OSError, RuntimeError):
        raise SystemExit("FAIL: registered patch path cannot be resolved")
    if path.is_symlink() or not resolved.is_file() or not within(resolved, mobile_patch_dir):
        raise SystemExit("FAIL: registered patch path is missing, symlinked, or resolves outside the mobile patch directory")
    return resolved

manifest_path = "vendor/upstream/patches/mobile/manifest.json"
vendor_path = "vendor/upstream/vendor-manifest.json"
provenance_path = "vendor/upstream/provenance.json"
manifest, vendor, provenance = read_json(manifest_path), read_json(vendor_path), read_json(provenance_path)
base_manifest, base_vendor = base_json(manifest_path), base_json(vendor_path)
base_ids = [p["id"] for p in base_manifest["patches"]]
base_paths = [p["patch"] for p in base_manifest["patches"]]
if len(base_ids) != 56 or len(set(base_ids)) != 56:
    raise SystemExit("FAIL: base active registry is not a unique 56-entry list")
if [p["id"] for p in manifest["patches"][:56]] != base_ids or [p["patch"] for p in manifest["patches"][:56]] != base_paths:
    raise SystemExit("FAIL: active manifest IDs/paths/order differ from base")
registry = manifest["patches"]
if len(registry) != 62 or len({p["id"] for p in registry}) != 62 or len({p["patch"] for p in registry}) != 62:
    raise SystemExit("FAIL: manifest registry is not 62 unique ID/path records")
active = registry[:56]
deferred = registry[56:]
if any(p.get("status") != "active" for p in active) or any(p.get("status") != "deferred-source-only" for p in deferred):
    raise SystemExit("FAIL: registry status boundary is inconsistent")
if any(p["patch"] in vendor["mobilePatches"] for p in deferred):
    raise SystemExit("FAIL: deferred source is in the active replay list")
if vendor["mobilePatches"] != base_vendor["mobilePatches"] or vendor["mobilePatches"] != base_paths:
    raise SystemExit("FAIL: active closure path list/order differs from the 56-entry base")
patch_files = {}
for p in registry:
    file_path = registered_patch_file(p)
    patch_files[p["id"]] = file_path
expected_deferred = [
    ("M-057", "patches/mobile/P126-U-session-workbench.patch", "999102046b0b9e559875e9afcc0aa734558e6e8c4087d11daacdb160ce1b5fb1", "deferred-source-only"),
    ("M-058", "patches/mobile/P126-C-client-compat.patch", "f32f9e6289d97c2a3e8b965e9d0ddfc41283bb48105827f57b9b5c79a3e5e359", "deferred-source-only"),
    ("M-059", "patches/mobile/P126-S-media-source-safety.patch", "384326345d18cc9e0822a2abaa7ace24e1bf4fbee759cc5fe22aa73f73fb48c2", "deferred-source-only"),
    ("M-060", "patches/mobile/P126-A-android-adaptation.patch", "1592f92778e4916476b2e15b0ce0664925a39be88ebcfcb88bb30fa997f44f73", "deferred-source-only"),
    ("M-063", "patches/mobile/P126-A-agent-selector.patch", "9bf73e327546874ab363cf611e3070b43dd03a154b5dfbb6b518c04b222a5bd9", "deferred-source-only"),
    ("M-064", "patches/mobile/P126-S-session-ownership-whitespace.patch", "8291ac3b2706058702587750e73d47b5f299eb54736087652e1f3b4d2063ab5c", "deferred-source-only"),
]
actual_deferred = [(p.get("id"), p.get("patch"), p.get("sha256"), p.get("status")) for p in deferred]
if actual_deferred != expected_deferred:
    raise SystemExit("FAIL: deferred ID/path/hash/status/order differs from the fixed literal contract")
shared = [{"id": p["id"], "path": p["patch"], "sha256": p["sha256"], "status": p["status"]} for p in registry]
if vendor.get("mobilePatchRegistry") != shared or provenance.get("mobilePatchRegistry") != shared:
    raise SystemExit("FAIL: cross-file ID/path/hash/status registries disagree")
if vendor.get("deferredMobilePatches") != shared[56:] or provenance.get("deferredMobilePatches") != shared[56:]:
    raise SystemExit("FAIL: deferred inventory cross-file mismatch")
expected_policy = {
    "base": "d37260c002b4390060f7d6cd78ffe6a11e9e1012",
    "activePatchCount": 56,
    "deferredSourceOnlyPatchCount": 6,
    "deferredPatchesApplied": False,
    "activeClosureUsesOnlyBaseOrder": True,
    "futureOrderContract": "p126-replay-order.json",
}
def exact_policy(value):
    return (
        isinstance(value, dict)
        and value.keys() == expected_policy.keys()
        and all(
            type(value[key]) is type(expected) and value[key] == expected
            for key, expected in expected_policy.items()
        )
    )

if any(not exact_policy(document.get("block1PatchPolicy")) for document in (manifest, vendor, provenance)):
    raise SystemExit("FAIL: Block 1 policy is not the fixed active/deferred isolation contract")
for p in registry:
    file_path = patch_files[p["id"]]
    actual = hashlib.sha256(file_path.read_bytes()).hexdigest()
    if actual != p["sha256"]:
        raise SystemExit("FAIL: registered patch hash does not match bytes")
fixed = {
    "M-037": "9a3cca744552093ed517c1a217e0e1c2ccff4d4c1f1ade7ec859e975088e29ae",
    "M-062": "630baba49be6c76bb1875d6496446dc59c6a40cce4c792de75cf34f67e047288",
    "M-057": "999102046b0b9e559875e9afcc0aa734558e6e8c4087d11daacdb160ce1b5fb1",
    "M-058": "f32f9e6289d97c2a3e8b965e9d0ddfc41283bb48105827f57b9b5c79a3e5e359",
    "M-059": "384326345d18cc9e0822a2abaa7ace24e1bf4fbee759cc5fe22aa73f73fb48c2",
    "M-060": "1592f92778e4916476b2e15b0ce0664925a39be88ebcfcb88bb30fa997f44f73",
    "M-063": "9bf73e327546874ab363cf611e3070b43dd03a154b5dfbb6b518c04b222a5bd9",
    "M-064": "8291ac3b2706058702587750e73d47b5f299eb54736087652e1f3b4d2063ab5c",
}
by_id = {p["id"]: p for p in registry}
for patch_id, expected in fixed.items():
    if patch_id not in by_id or by_id[patch_id]["sha256"] != expected:
        raise SystemExit("FAIL: fixed SHA contract mismatch")
order = read_json("vendor/upstream/patches/mobile/p126-replay-order.json")
without = [i for i in base_ids if i not in ("M-061", "M-062")]
expected_future = without + ["M-057", "M-058", "M-059", "M-060", "M-061", "M-062", "M-063", "M-064"]
if order.get("activeClosureOrder") != base_ids or order.get("futureReplayOrder") != expected_future:
    raise SystemExit("FAIL: future replay order contract mismatch")
if order.get("status") != "future-contract-only" or order.get("applied") is not False:
    raise SystemExit("FAIL: future order is not explicitly marked unapplied")
print("Block 1 registry: PASS active=56 deferred=6 unique=62 hashes/order/status consistent; deferred are not replayed")
print("Block 1 fixed hashes: PASS M-037/M-062 and six literal deferred source mappings")
PY_META


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

for f in $TOPFILES; do
  if cmp -s "$WORK/pristine/$f" "$DEST/$f"; then
    echo "V3(a) OK: $f byte-identical to pin"
  else
    echo "V3(a) FAIL: $f differs from pin"
    status=1
  fi
done

# ---------- (a2) closure shape/content contract ----------
if python3 "$ROOT/scripts/check-closure-tree.py" \
  --expected "$WORK/pristine/packages" \
  --actual "$DEST/packages" \
  --label "V3(a2) active closure path/type/mode/bytes/symlink"; then
  :
else
  status=1
fi

# ---------- (b) workspace reference consistency ----------
CLOSURE_NAMES="$(python3 - "$DEST" $PACKAGES <<'PY'
import json, sys
dest, packages = sys.argv[1], sys.argv[2:]
names = {}
for p in packages:
    d = json.load(open(f"{dest}/packages/{p}/package.json"))
    names[d["name"]] = p
print(" ".join(names))
PY
)"
WORKSPACE_REFS="$(python3 - "$DEST" $PACKAGES <<'PY'
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

}
set +e
( set -e; run_checks ) > "$OUTPUT" 2>&1
RESULT=$?
set -e
if ! cat "$OUTPUT" | tee -a "$LOG"; then
  echo "verify-closure: FAIL evidence log write failed" >&2
  exit 125
fi
printf 'verify-closure: command_rc=%s log=%s\n' "$RESULT" "$LOG" | tee -a "$LOG" || { echo "verify-closure: FAIL evidence log write failed" >&2; exit 125; }
exit "$RESULT"
