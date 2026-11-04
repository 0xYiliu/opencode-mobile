#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECKER="$ROOT/scripts/check-closure-tree.py"
TMP_ROOT="${TMPDIR:-/tmp/opencode}"
WORK="$(mktemp -d "$TMP_ROOT/closure-checker.XXXXXX")"
TEST_EVIDENCE_DIR="${CLOSURE_TEST_EVIDENCE_DIR:-}"
if [[ -n "$TEST_EVIDENCE_DIR" ]]; then
  mkdir -p "$TEST_EVIDENCE_DIR"
  TEST_EVIDENCE_DIR="$(cd "$TEST_EVIDENCE_DIR" && pwd -P)"
  case "$TEST_EVIDENCE_DIR/" in "$ROOT/"*) echo "FAIL: test evidence directory must be outside candidate repo" >&2; exit 2 ;; esac
fi
cleanup() {
  if [[ -n "$TEST_EVIDENCE_DIR" ]]; then
    mkdir -p "$TEST_EVIDENCE_DIR/validator-evidence"
    if [[ -d "$WORK/validator-evidence" ]]; then
      cp -a "$WORK/validator-evidence/." "$TEST_EVIDENCE_DIR/validator-evidence/"
    fi
    cp -a "$WORK"/validator-*.log "$WORK"/validator-*.normalized "$TEST_EVIDENCE_DIR/" 2>/dev/null || true
  fi
  rm -rf "$WORK"
}
trap cleanup EXIT

EXPECTED="$WORK/expected"
ACTUAL="$WORK/actual"
mkdir -p "$EXPECTED/dir/nested" "$EXPECTED/type-dir"
printf 'stable bytes\n' > "$EXPECTED/dir/nested/file.txt"
printf 'mode bytes\n' > "$EXPECTED/mode.txt"
printf 'file type\n' > "$EXPECTED/type-file"
printf 'symlink target\n' > "$EXPECTED/target-a.txt"
ln -s "dir/nested/file.txt" "$EXPECTED/link"
ln -s "target-a.txt" "$EXPECTED/link-target"
chmod 640 "$EXPECTED/dir/nested/file.txt" "$EXPECTED/mode.txt" "$EXPECTED/type-file"
chmod 750 "$EXPECTED/dir" "$EXPECTED/dir/nested" "$EXPECTED/type-dir"
cp -a "$EXPECTED" "$ACTUAL"

check_ok() {
  python3 "$CHECKER" --expected "$EXPECTED" --actual "$ACTUAL" --strict-mode --label "$1"
}

restore() {
  rm -rf "$ACTUAL"
  cp -a "$EXPECTED" "$ACTUAL"
  check_ok "$1-restored"
}

check_fail() {
  local label="$1"
  if python3 "$CHECKER" --expected "$EXPECTED" --actual "$ACTUAL" --strict-mode --label "$label"; then
    echo "FAIL: checker accepted negative case $label" >&2
    exit 1
  fi
  echo "negative $label: rc=1"
}

check_ok positive

printf 'changed bytes\n' > "$ACTUAL/dir/nested/file.txt"
check_fail content
restore content

printf 'added\n' > "$ACTUAL/added.txt"
check_fail added-file
restore added-file

rm "$ACTUAL/dir/nested/file.txt"
check_fail deleted-file
restore deleted-file

rm "$ACTUAL/type-file"
mkdir "$ACTUAL/type-file"
check_fail file-to-dir
restore file-to-dir

rm -rf "$ACTUAL/type-dir"
printf 'directory became file\n' > "$ACTUAL/type-dir"
check_fail dir-to-file
restore dir-to-file

rm "$ACTUAL/link"
printf 'symlink became file\n' > "$ACTUAL/link"
check_fail symlink-to-file
restore symlink-to-file

chmod 600 "$ACTUAL/mode.txt"
check_fail mode
restore mode

rm "$ACTUAL/link-target"
ln -s "target-b.txt" "$ACTUAL/link-target"
check_fail symlink-target
restore symlink-target

echo 'closure checker disposable positive/negative suite: PASS'

# Exercise the delivered verifier itself from several working directories and
# against disposable committed candidates. Never commit or alter the source
# worktree: all commits below are made with commit-tree in this temporary clone.
BASE="d37260c002b4390060f7d6cd78ffe6a11e9e1012"
FIXTURE="$WORK/candidate-fixture"
VERIFY="$FIXTURE/scripts/verify-closure.sh"
NON_GIT_CWD="$WORK/cwd-outside-git"
OTHER_GIT_CWD="$WORK/cwd-another-git"
VALIDATOR_EVIDENCE="$WORK/validator-evidence"
SCRATCH="$WORK/verifier-scratch"
mkdir -p "$NON_GIT_CWD" "$OTHER_GIT_CWD" "$VALIDATOR_EVIDENCE" "$SCRATCH" "$TMP_ROOT"

git -C "$ROOT" cat-file -e "$BASE^{commit}"
git clone --quiet --shared --no-checkout "$ROOT" "$FIXTURE"
git -C "$FIXTURE" checkout --quiet --detach "$BASE"
git -C "$OTHER_GIT_CWD" init --quiet
git -C "$OTHER_GIT_CWD" -c user.name='Closure test' -c user.email='closure-test@example.invalid' commit --allow-empty --quiet -m 'disposable cwd repository'

APPROVED_FILES=(
  docs/build-and-verify.md
  scripts/verify-closure.sh
  scripts/check-closure-tree.py
  scripts/test-closure-checker.sh
  vendor/upstream/PROVENANCE.md
  vendor/upstream/patches/mobile/manifest.json
  vendor/upstream/patches/mobile/p126-replay-order.json
  vendor/upstream/patches/mobile/P126-U-session-workbench.patch
  vendor/upstream/patches/mobile/P126-C-client-compat.patch
  vendor/upstream/patches/mobile/P126-S-media-source-safety.patch
  vendor/upstream/patches/mobile/P126-A-android-adaptation.patch
  vendor/upstream/patches/mobile/P126-A-agent-selector.patch
  vendor/upstream/patches/mobile/P126-S-session-ownership-whitespace.patch
  vendor/upstream/provenance.json
  vendor/upstream/vendor-manifest.json
)

reset_fixture() {
  git -C "$FIXTURE" update-ref HEAD "$BASE"
  rm -f "$FIXTURE/vendor/upstream/patches/mobile/P126-not-approved.patch"
  git -C "$FIXTURE" read-tree --reset -u "$BASE"
  rm -f "$FIXTURE/vendor/upstream/patches/mobile/P126-not-approved.patch"
  rm -rf "$WORK/outside-mobile-patches"
  for file in "${APPROVED_FILES[@]}"; do
    mkdir -p "$FIXTURE/$(dirname "$file")"
    cp -a "$ROOT/$file" "$FIXTURE/$file"
  done
}

commit_fixture() {
  local message="$1"
  local parent_mode="${2:-parent}"
  local tree commit
  git -C "$FIXTURE" add --all
  tree="$(git -C "$FIXTURE" write-tree)"
  if [[ "$parent_mode" == "orphan" ]]; then
    commit="$(printf '%s\n' "$message" | GIT_AUTHOR_NAME='Closure test' GIT_AUTHOR_EMAIL='closure-test@example.invalid' GIT_COMMITTER_NAME='Closure test' GIT_COMMITTER_EMAIL='closure-test@example.invalid' git -C "$FIXTURE" commit-tree "$tree")"
  else
    commit="$(printf '%s\n' "$message" | GIT_AUTHOR_NAME='Closure test' GIT_AUTHOR_EMAIL='closure-test@example.invalid' GIT_COMMITTER_NAME='Closure test' GIT_COMMITTER_EMAIL='closure-test@example.invalid' git -C "$FIXTURE" commit-tree "$tree" -p "$BASE")"
  fi
  git -C "$FIXTURE" update-ref HEAD "$commit"
  [[ -z "$(git -C "$FIXTURE" status --porcelain=v1 --untracked-files=all)" ]] || {
    echo "FAIL: disposable candidate is not clean after commit-tree" >&2
    return 1
  }
  printf '%s\n' "$commit"
}

run_validator() {
  local cwd="$1" evidence="$2" base="$3"
  shift 3
  (cd "$cwd" && TMPDIR="$SCRATCH" "$VERIFY" --repo "$FIXTURE" --base "$base" --evidence-dir "$evidence" "$@")
}

run_default_validator() {
  local cwd="$1"
  shift
  (cd "$cwd" && TMPDIR="$SCRATCH" "$VERIFY" "$@")
}

check_cli_reject() {
  local name="$1" expected_rc="$2" expected_text="$3"
  shift 3
  local log="$WORK/validator-$name.log" rc
  set +e
  (cd "$NON_GIT_CWD" && TMPDIR="$SCRATCH" "$VERIFY" "$@") > "$log" 2>&1
  rc=$?
  set -e
  if [[ "$rc" -ne "$expected_rc" ]]; then
    echo "FAIL: delivered verifier argument case $name returned rc=$rc, expected=$expected_rc" >&2
    cat "$log" >&2
    exit 1
  fi
  if [[ -n "$expected_text" ]] && ! grep -Fq "$expected_text" "$log"; then
    echo "FAIL: delivered verifier argument case $name lacked expected rejection reason: $expected_text" >&2
    cat "$log" >&2
    exit 1
  fi
  echo "delivery-validator argument negative $name: rc=$rc (expected $expected_rc)"
}

check_validator_reject() {
  local name="$1" expected_rc="$2" expected_text="$3" cwd="${4:-$NON_GIT_CWD}" base="${5:-$BASE}"
  local log="$WORK/validator-$name.log" evidence="$VALIDATOR_EVIDENCE/$name"
  local rc
  set +e
  run_validator "$cwd" "$evidence" "$base" > "$log" 2>&1
  rc=$?
  set -e
  if [[ "$rc" -ne "$expected_rc" ]]; then
    echo "FAIL: delivered verifier case $name returned rc=$rc, expected=$expected_rc" >&2
    cat "$log" >&2
    exit 1
  fi
  if [[ -n "$expected_text" ]] && ! grep -Fq "$expected_text" "$log"; then
    echo "FAIL: delivered verifier case $name lacked expected rejection reason: $expected_text" >&2
    cat "$log" >&2
    exit 1
  fi
  echo "delivery-validator negative $name: rc=$rc (expected $expected_rc)"
}

reset_fixture
GOOD_COMMIT="$(commit_fixture 'disposable PR candidate based on fixed base')"
grep -Fq "$BASE" <(git -C "$FIXTURE" show -s --format=%P "$GOOD_COMMIT")
EXPECTED_CANDIDATE_PATHS="$(printf '%s\n' "${APPROVED_FILES[@]}" | sort)"
ACTUAL_CANDIDATE_PATHS="$(git -C "$FIXTURE" diff-tree --no-commit-id --name-only -r "$BASE" "$GOOD_COMMIT" | sort)"
[[ "$ACTUAL_CANDIDATE_PATHS" == "$EXPECTED_CANDIDATE_PATHS" ]] || {
  echo 'FAIL: disposable PR fixture does not contain exactly the 15 approved paths' >&2
  exit 1
}
git -C "$FIXTURE" diff --check "$BASE" "$GOOD_COMMIT"
printf 'PR-checkout fixture commit: %s (parent %s)\n' "$GOOD_COMMIT" "$BASE"
echo 'committed 15-file fixture diff-check: PASS'

run_validator "$NON_GIT_CWD" "$VALIDATOR_EVIDENCE/non-git-cwd" "$BASE" > "$WORK/validator-non-git-cwd.log" 2>&1
run_validator "$OTHER_GIT_CWD" "$VALIDATOR_EVIDENCE/other-git-cwd" "$BASE" > "$WORK/validator-other-git-cwd.log" 2>&1
for output in "$WORK/validator-non-git-cwd.log" "$WORK/validator-other-git-cwd.log"; do
  grep -Fq 'verify-closure: PASS' "$output"
  grep -Fq 'Block 1 runtime: PASS' "$output"
  grep -Fq 'Block 1 registry: PASS active=56 deferred=6 unique=62 hashes/order/status consistent; deferred are not replayed' "$output"
done
sed -E 's# log=.*$##' "$WORK/validator-non-git-cwd.log" | grep -v '^Block 1 candidate:' > "$WORK/validator-non-git-cwd.normalized"
sed -E 's# log=.*$##' "$WORK/validator-other-git-cwd.log" | grep -v '^Block 1 candidate:' > "$WORK/validator-other-git-cwd.normalized"
cmp -s "$WORK/validator-non-git-cwd.normalized" "$WORK/validator-other-git-cwd.normalized"
echo 'delivery-validator positive committed PR fixture: PASS from non-Git cwd and another Git repo; normalized results identical'

run_default_validator "$NON_GIT_CWD" > "$WORK/validator-default-script.log" 2>&1
grep -Fq 'verify-closure: PASS' "$WORK/validator-default-script.log"
grep -Fq "Block 1 candidate: repo=$FIXTURE base=$BASE" "$WORK/validator-default-script.log"
DEFAULT_EVIDENCE="$(sed -n 's/^Block 1 candidate: .* evidence=//p' "$WORK/validator-default-script.log" | head -1)"
[[ -n "$DEFAULT_EVIDENCE" && -d "$DEFAULT_EVIDENCE" ]] || {
  echo 'FAIL: no-argument verifier did not create its default evidence directory' >&2
  exit 1
}
[[ "$(stat -c '%a' "$DEFAULT_EVIDENCE")" == 700 ]] || {
  echo 'FAIL: no-argument verifier evidence directory is not private (mode 0700)' >&2
  exit 1
}
case "$DEFAULT_EVIDENCE/" in "$FIXTURE/"*)
  echo 'FAIL: no-argument verifier evidence directory is inside the candidate repo' >&2
  exit 1
  ;;
esac
mkdir -p "$VALIDATOR_EVIDENCE/default-script"
cp -a "$DEFAULT_EVIDENCE/." "$VALIDATOR_EVIDENCE/default-script/"
echo 'delivery-validator no-argument direct entry: PASS from non-Git cwd; inferred script repo, fixed base and private external evidence'

if command -v bun >/dev/null 2>&1; then
  (cd "$FIXTURE" && TMPDIR="$SCRATCH" bun run verify:closure) > "$WORK/validator-bun-entry.log" 2>&1
  grep -Fq 'verify-closure: PASS' "$WORK/validator-bun-entry.log"
  grep -Fq "Block 1 candidate: repo=$FIXTURE base=$BASE" "$WORK/validator-bun-entry.log"
  BUN_EVIDENCE="$(sed -n 's/^Block 1 candidate: .* evidence=//p' "$WORK/validator-bun-entry.log" | head -1)"
  [[ -n "$BUN_EVIDENCE" && -d "$BUN_EVIDENCE" ]] || {
    echo 'FAIL: bun run verify:closure did not create its default evidence directory' >&2
    exit 1
  }
  [[ "$(stat -c '%a' "$BUN_EVIDENCE")" == 700 ]] || {
    echo 'FAIL: bun run verify:closure evidence directory is not private (mode 0700)' >&2
    exit 1
  }
  mkdir -p "$VALIDATOR_EVIDENCE/bun-entry"
  cp -a "$BUN_EVIDENCE/." "$VALIDATOR_EVIDENCE/bun-entry/"
  echo 'delivery-validator bun run verify:closure entry: PASS on clean committed fixture'
else
  echo 'delivery-validator bun run verify:closure entry: SKIP (bun not installed locally; no download attempted)'
fi

check_cli_reject incomplete-arguments 2 'usage:' --repo "$FIXTURE"
check_cli_reject unknown-argument 2 'invalid argument' --bogus
check_cli_reject duplicate-argument 2 'usage:' --repo "$FIXTURE" --repo "$FIXTURE" --base "$BASE" --evidence-dir "$VALIDATOR_EVIDENCE/duplicate"
printf 'not a directory\n' > "$WORK/evidence-parent-file"
check_cli_reject evidence-create-failure 125 'cannot create evidence directory' --repo "$FIXTURE" --base "$BASE" --evidence-dir "$WORK/evidence-parent-file/child"

WRONG_BASE="$(git -C "$FIXTURE" rev-parse "$BASE^")"
check_validator_reject wrong-base-argument 2 'base does not match the fixed candidate base' "$NON_GIT_CWD" "$WRONG_BASE"

reset_fixture
commit_fixture 'disposable unrelated candidate' orphan > /dev/null
check_validator_reject non-ancestor 1 'fixed base is not an ancestor of candidate HEAD'

mutate_metadata() {
  local case_name="$1"
  python3 - "$FIXTURE" "$case_name" "$WORK/outside-mobile-patches" <<'PY'
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys

root = Path(sys.argv[1])
case = sys.argv[2]
outside = Path(sys.argv[3])
mobile = root / "vendor/upstream/patches/mobile"
manifest_path = mobile / "manifest.json"
vendor_path = root / "vendor/upstream/vendor-manifest.json"
provenance_path = root / "vendor/upstream/provenance.json"
order_path = mobile / "p126-replay-order.json"
manifest = json.loads(manifest_path.read_text())
vendor = json.loads(vendor_path.read_text())
provenance = json.loads(provenance_path.read_text())
order = json.loads(order_path.read_text())
record = manifest["patches"][56]

if case == "absolute-path":
    record["patch"] = "/tmp/outside.patch"
elif case == "traversal-path":
    record["patch"] = "patches/mobile/../../../../tmp/outside.patch"
elif case == "noncanonical-path":
    record["patch"] = "patches/mobile/./P126-U-session-workbench.patch"
elif case == "outside-directory":
    record["patch"] = "patches/not-mobile.patch"
    outside_patch = root / "vendor/upstream/patches/not-mobile.patch"
    outside_patch.write_bytes(b"outside allowed mobile patch directory\n")
    record["sha256"] = hashlib.sha256(outside_patch.read_bytes()).hexdigest()
elif case == "wrong-id":
    record["id"] = "M-999"
elif case == "wrong-path":
    record["patch"] = "patches/mobile/P126-not-approved.patch"
    (mobile / "P126-not-approved.patch").write_bytes(b"unapproved test fixture patch\n")
    record["sha256"] = hashlib.sha256((mobile / "P126-not-approved.patch").read_bytes()).hexdigest()
elif case == "wrong-hash":
    record["sha256"] = "0" * 64
elif case == "wrong-status":
    record["status"] = "active"
elif case == "wrong-order":
    manifest["patches"][56], manifest["patches"][57] = manifest["patches"][57], manifest["patches"][56]
    order["futureReplayOrder"][56], order["futureReplayOrder"][57] = order["futureReplayOrder"][57], order["futureReplayOrder"][56]
elif case == "symlink-parent":
    shutil.copytree(mobile, outside)
    shutil.rmtree(mobile)
    os.symlink(outside, mobile, target_is_directory=True)
elif case == "activate-deferred":
    vendor["mobilePatches"].append(record["patch"])
    vendor["block1PatchPolicy"]["deferredPatchesApplied"] = True
    provenance["block1PatchPolicy"]["deferredPatchesApplied"] = True
elif case == "manifest-policy-invalid":
    manifest["block1PatchPolicy"]["deferredPatchesApplied"] = True
    manifest["block1PatchPolicy"]["activePatchCount"] = 999
elif case == "vendor-policy-mismatch":
    vendor["block1PatchPolicy"]["activeClosureUsesOnlyBaseOrder"] = False
elif case == "provenance-policy-mismatch":
    provenance["block1PatchPolicy"]["futureOrderContract"] = "unexpected-order.json"
elif case.endswith("-policy-missing"):
    policy_document = {
        "manifest": manifest,
        "vendor": vendor,
        "provenance": provenance,
    }[case.removesuffix("-policy-missing")]
    policy_document.pop("block1PatchPolicy", None)
elif case.endswith("-policy-wrong-type"):
    policy_document = {
        "manifest": manifest,
        "vendor": vendor,
        "provenance": provenance,
    }[case.removesuffix("-policy-wrong-type")]
    # JSON number 1 compares equal to Python True. Require exact JSON types,
    # not just Python's bool/int-coercive dictionary equality.
    policy_document["block1PatchPolicy"]["activeClosureUsesOnlyBaseOrder"] = 1
else:
    raise SystemExit(f"unknown metadata test case: {case}")

if case in {"wrong-id", "wrong-path", "wrong-hash", "wrong-status", "wrong-order"}:
    shared = [
        {"id": p["id"], "path": p["patch"], "sha256": p["sha256"], "status": p["status"]}
        for p in manifest["patches"]
    ]
    vendor["mobilePatchRegistry"] = shared
    provenance["mobilePatchRegistry"] = shared
    vendor["deferredMobilePatches"] = shared[56:]
    provenance["deferredMobilePatches"] = shared[56:]

manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
vendor_path.write_text(json.dumps(vendor, ensure_ascii=False, indent=2) + "\n")
provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n")
order_path.write_text(json.dumps(order, ensure_ascii=False, indent=2) + "\n")
PY
}

run_metadata_case() {
  local name="$1" expected="$2"
  reset_fixture
  mutate_metadata "$name"
  commit_fixture "disposable metadata negative: $name" > /dev/null
  check_validator_reject "$name" 1 "$expected"
}

run_metadata_case absolute-path 'absolute, traversing, or non-canonical'
run_metadata_case traversal-path 'absolute, traversing, or non-canonical'
run_metadata_case noncanonical-path 'absolute, traversing, or non-canonical'
run_metadata_case outside-directory 'outside vendor/upstream/patches/mobile'
run_metadata_case symlink-parent 'mobile patch directory resolves outside vendor/upstream/patches'
run_metadata_case wrong-id 'fixed literal contract'
run_metadata_case wrong-path 'fixed literal contract'
run_metadata_case wrong-hash 'fixed literal contract'
run_metadata_case wrong-status 'registry status boundary'
run_metadata_case wrong-order 'fixed literal contract'
run_metadata_case activate-deferred 'deferred source is in the active replay list'
run_metadata_case manifest-policy-invalid 'Block 1 policy is not the fixed active/deferred isolation contract'
run_metadata_case vendor-policy-mismatch 'Block 1 policy is not the fixed active/deferred isolation contract'
run_metadata_case provenance-policy-mismatch 'Block 1 policy is not the fixed active/deferred isolation contract'
run_metadata_case manifest-policy-missing 'Block 1 policy is not the fixed active/deferred isolation contract'
run_metadata_case vendor-policy-missing 'Block 1 policy is not the fixed active/deferred isolation contract'
run_metadata_case provenance-policy-missing 'Block 1 policy is not the fixed active/deferred isolation contract'
run_metadata_case manifest-policy-wrong-type 'Block 1 policy is not the fixed active/deferred isolation contract'
run_metadata_case vendor-policy-wrong-type 'Block 1 policy is not the fixed active/deferred isolation contract'
run_metadata_case provenance-policy-wrong-type 'Block 1 policy is not the fixed active/deferred isolation contract'

reset_fixture
printf '\n# runtime isolation negative\n' >> "$FIXTURE/vendor/upstream/packages/app/package.json"
commit_fixture 'disposable runtime mutation negative' > /dev/null
check_validator_reject runtime-change 1 'vendor/upstream/packages differs from base'

reset_fixture
commit_fixture 'disposable clean candidate for dirty-state negative' > /dev/null
printf '\n# uncommitted\n' >> "$FIXTURE/vendor/upstream/PROVENANCE.md"
check_validator_reject dirty-checkout 1 'candidate checkout is dirty'

echo 'delivered closure verifier disposable integration suite: PASS'
