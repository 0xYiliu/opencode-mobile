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
mkdir -p "$EXPECTED/dir/nested" "$EXPECTED/type-dir" "$EXPECTED/app/e2e/test-results" "$EXPECTED/components/example/test-results"
printf 'stable bytes\n' > "$EXPECTED/dir/nested/file.txt"
printf 'mode bytes\n' > "$EXPECTED/mode.txt"
printf 'file type\n' > "$EXPECTED/type-file"
printf 'symlink target\n' > "$EXPECTED/target-a.txt"
printf 'generated output\n' > "$EXPECTED/app/e2e/test-results/results.json"
printf 'source baseline\n' > "$EXPECTED/components/example/test-results/fixture.ts"
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

check_fail_with_generated_path_exclusion() {
  local label="$1"
  if python3 "$CHECKER" --expected "$EXPECTED" --actual "$ACTUAL" --strict-mode --exclude-path app/e2e/test-results --label "$label"; then
    echo "FAIL: checker accepted negative case $label" >&2
    exit 1
  fi
  echo "negative $label with exact generated-path exclusion: rc=1"
}

check_ok positive

printf 'regenerated output\n' > "$ACTUAL/app/e2e/test-results/results.json"
printf 'new generated output\n' > "$ACTUAL/app/e2e/test-results/trace.zip"
python3 "$CHECKER" --expected "$EXPECTED" --actual "$ACTUAL" --strict-mode --exclude-path app/e2e/test-results --label generated-test-results-ignored
echo 'positive exact generated test-results exclusion: PASS'
restore generated-test-results-ignored

printf 'modified source\n' > "$ACTUAL/components/example/test-results/fixture.ts"
check_fail_with_generated_path_exclusion same-name-test-results-source-mutation
restore same-name-test-results-source-mutation

printf 'added source\n' > "$ACTUAL/components/example/test-results/added.ts"
check_fail_with_generated_path_exclusion same-name-test-results-source-addition
restore same-name-test-results-source-addition

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

# Exercise both delivered profiles and their failure boundaries in disposable
# Git fixtures. All commits are created with commit-tree in this temporary clone;
# the source worktree is read-only throughout the suite.
RUNTIME_BASE="afef1b948c59a901da710bb5793ea73d53948fbb"
HISTORICAL_BASE="d37260c002b4390060f7d6cd78ffe6a11e9e1012"
FIXTURE="$WORK/candidate-fixture"
VERIFY="$FIXTURE/scripts/verify-closure.sh"
NON_GIT_CWD="$WORK/cwd-outside-git"
OTHER_GIT_CWD="$WORK/cwd-another-git"
VALIDATOR_EVIDENCE="$WORK/validator-evidence"
SCRATCH="$WORK/verifier-scratch"
mkdir -p "$NON_GIT_CWD" "$OTHER_GIT_CWD" "$VALIDATOR_EVIDENCE" "$SCRATCH" "$TMP_ROOT"

git -C "$ROOT" cat-file -e "$RUNTIME_BASE^{commit}"
git -C "$ROOT" cat-file -e "$HISTORICAL_BASE^{commit}"
git clone --quiet --shared --no-checkout "$ROOT" "$FIXTURE"
git -C "$FIXTURE" checkout --quiet --detach "$RUNTIME_BASE"
git -C "$OTHER_GIT_CWD" init --quiet
git -C "$OTHER_GIT_CWD" -c user.name='Closure test' -c user.email='closure-test@example.invalid' commit --allow-empty --quiet -m 'disposable cwd repository'

install_runtime_candidate() {
  rm -rf "$FIXTURE/vendor/upstream/packages"
  cp -a "$ROOT/vendor/upstream/packages" "$FIXTURE/vendor/upstream/"
  rm -rf "$FIXTURE/vendor/upstream/patches/mobile"
  cp -a "$ROOT/vendor/upstream/patches/mobile" "$FIXTURE/vendor/upstream/patches/"
  cp -a "$ROOT/vendor/upstream/vendor-manifest.json" "$FIXTURE/vendor/upstream/vendor-manifest.json"
  cp -a "$ROOT/vendor/upstream/provenance.json" "$FIXTURE/vendor/upstream/provenance.json"
  for file in scripts/verify-closure.sh scripts/verify-closure.py scripts/check-closure-tree.py; do
    mkdir -p "$FIXTURE/$(dirname "$file")"
    cp -a "$ROOT/$file" "$FIXTURE/$file"
  done
}

commit_fixture() {
  local message="$1" parent="${2:-$RUNTIME_BASE}" tree commit
  git -C "$FIXTURE" add --all
  tree="$(git -C "$FIXTURE" write-tree)"
  commit="$(printf '%s\n' "$message" | GIT_AUTHOR_NAME='Closure test' GIT_AUTHOR_EMAIL='closure-test@example.invalid' GIT_COMMITTER_NAME='Closure test' GIT_COMMITTER_EMAIL='closure-test@example.invalid' git -C "$FIXTURE" commit-tree "$tree" -p "$parent")"
  git -C "$FIXTURE" update-ref HEAD "$commit"
  [[ -z "$(git -C "$FIXTURE" status --porcelain=v1 --untracked-files=all)" ]] || {
    echo "FAIL: disposable candidate is not clean after commit-tree" >&2
    return 1
  }
  printf '%s\n' "$commit"
}

reset_fixture() {
  git -C "$FIXTURE" update-ref HEAD "$GOOD_COMMIT"
  git -C "$FIXTURE" read-tree --reset -u "$GOOD_COMMIT"
  rm -rf "$WORK/outside-mobile-patches" "$WORK/packages-outside"
}

run_validator() {
  local cwd="$1" evidence="$2"
  shift 2
  (cd "$cwd" && TMPDIR="$SCRATCH" "$VERIFY" --repo "$FIXTURE" --evidence-dir "$evidence" "$@")
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
  if [[ -n "$expected_text" ]] && ! grep -Fq -- "$expected_text" "$log"; then
    echo "FAIL: delivered verifier argument case $name lacked expected rejection reason: $expected_text" >&2
    cat "$log" >&2
    exit 1
  fi
  echo "delivery-validator argument negative $name: rc=$rc (expected $expected_rc)"
}

check_validator_reject() {
  local name="$1" expected_rc="$2" expected_text="$3" candidate_head="${4:-$(git -C "$FIXTURE" rev-parse HEAD)}"
  local log="$WORK/validator-$name.log" evidence="$VALIDATOR_EVIDENCE/$name" rc
  set +e
  run_validator "$NON_GIT_CWD" "$evidence" --profile p126-runtime --base "$RUNTIME_BASE" --candidate-head "$candidate_head" > "$log" 2>&1
  rc=$?
  set -e
  if [[ "$rc" -ne "$expected_rc" ]]; then
    echo "FAIL: delivered verifier case $name returned rc=$rc, expected=$expected_rc" >&2
    cat "$log" >&2
    exit 1
  fi
  if [[ -n "$expected_text" ]] && ! grep -Fq -- "$expected_text" "$log"; then
    echo "FAIL: delivered verifier case $name lacked expected rejection reason: $expected_text" >&2
    cat "$log" >&2
    exit 1
  fi
  echo "delivery-validator negative $name: rc=$rc (expected $expected_rc)"
}

install_runtime_candidate
GOOD_COMMIT="$(commit_fixture 'disposable P126 runtime candidate')"
[[ "$(git -C "$FIXTURE" show -s --format=%P "$GOOD_COMMIT")" == "$RUNTIME_BASE" ]]
git -C "$FIXTURE" diff --check "$RUNTIME_BASE" "$GOOD_COMMIT"
printf 'P126 runtime fixture commit: %s (parent %s)\n' "$GOOD_COMMIT" "$RUNTIME_BASE"
echo 'committed disposable runtime candidate diff-check: PASS'

# No-argument invocation defaults to the runtime profile and infers the repo
# from the script path even when the caller is outside any Git worktree.
(cd "$NON_GIT_CWD" && TMPDIR="$SCRATCH" "$VERIFY") > "$WORK/validator-runtime-default.log" 2>&1
grep -Fq 'verify-closure: PASS profile=p126-runtime' "$WORK/validator-runtime-default.log"
grep -Fq "verify-closure: profile=p126-runtime repo=$FIXTURE base=$RUNTIME_BASE" "$WORK/validator-runtime-default.log"
DEFAULT_EVIDENCE="$(sed -n 's/^verify-closure: profile=.* evidence=//p' "$WORK/validator-runtime-default.log" | head -1)"
[[ -n "$DEFAULT_EVIDENCE" && -d "$DEFAULT_EVIDENCE" && "$(stat -c '%a' "$DEFAULT_EVIDENCE")" == 700 ]]
case "$DEFAULT_EVIDENCE/" in "$FIXTURE/"*) echo 'FAIL: default evidence directory is inside candidate repo' >&2; exit 1 ;; esac
mkdir -p "$VALIDATOR_EVIDENCE/runtime-positive"
cp -a "$DEFAULT_EVIDENCE/." "$VALIDATOR_EVIDENCE/runtime-positive/"
grep -Fq 'runtime policy: PASS active=65 deferred=1 M-063=deferred source IDs/order/hash/status locked' "$WORK/validator-runtime-default.log"
grep -Fq 'runtime replay: PASS pristine→65 active→reverse==independent pristine' "$WORK/validator-runtime-default.log"
echo 'delivery-validator runtime positive: PASS default profile from non-Git cwd; private external evidence; committed candidate is exact replay'

if command -v bun >/dev/null 2>&1; then
  (cd "$FIXTURE" && TMPDIR="$SCRATCH" bun run verify:closure) > "$WORK/validator-bun-entry.log" 2>&1
  grep -Fq 'verify-closure: PASS profile=p126-runtime' "$WORK/validator-bun-entry.log"
  BUN_EVIDENCE="$(sed -n 's/^verify-closure: profile=.* evidence=//p' "$WORK/validator-bun-entry.log" | head -1)"
  [[ -n "$BUN_EVIDENCE" && -d "$BUN_EVIDENCE" && "$(stat -c '%a' "$BUN_EVIDENCE")" == 700 ]]
  mkdir -p "$VALIDATOR_EVIDENCE/bun-entry"
  cp -a "$BUN_EVIDENCE/." "$VALIDATOR_EVIDENCE/bun-entry/"
  echo 'delivery-validator bun run verify:closure entry: PASS on committed runtime fixture'
else
  echo 'delivery-validator bun run verify:closure entry: SKIP (bun not installed locally; no download attempted)'
fi

check_cli_reject unknown-profile 2 'unknown profile' --profile invalid
check_cli_reject duplicate-profile 2 'invalid or incomplete argument set' --profile p126-runtime --profile historical-block1
check_cli_reject wrong-runtime-base 2 'base does not match profile p126-runtime' --base "$HISTORICAL_BASE"
check_cli_reject historical-candidate-head 2 '--candidate-head is not valid for historical-block1' --profile historical-block1 --candidate-head "$GOOD_COMMIT"
printf 'not a directory\n' > "$WORK/evidence-parent-file"
check_cli_reject evidence-create-failure 125 'cannot create evidence directory' --repo "$FIXTURE" --evidence-dir "$WORK/evidence-parent-file/child"

mutate_metadata() {
  local case_name="$1"
  python3 - "$FIXTURE" "$case_name" "$WORK/outside-mobile-patches" <<'PY'
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
by_id = {patch["id"]: patch for patch in manifest["patches"]}

if case == "m063-wrong-hash":
    by_id["M-063"]["sha256"] = "0" * 64
elif case == "m063-wrong-status":
    by_id["M-063"]["status"] = "active"
elif case == "m063-active-order":
    order["activeReplayOrder"].append("M-063")
elif case == "runtime-order":
    order["activeReplayOrder"][56], order["activeReplayOrder"][57] = order["activeReplayOrder"][57], order["activeReplayOrder"][56]
elif case == "deferred-activation":
    vendor["mobilePatches"].append(by_id["M-063"]["patch"])
elif case == "m065-wrong-path":
    by_id["M-065"]["patch"] = "patches/mobile/P126-not-approved.patch"
elif case == "m065-broadened-targets":
    by_id["M-065"]["targets"].append("packages/app/src/runtime/plugin/extensions.tsx")
elif case == "m066-wrong-path":
    by_id["M-066"]["patch"] = "patches/mobile/P126-not-approved.patch"
elif case == "m066-wrong-hash":
    by_id["M-066"]["sha256"] = "0" * 64
elif case == "m066-broadened-targets":
    by_id["M-066"]["targets"].append("packages/app/src/composer/submit.ts")
elif case == "new-runtime-order":
    order["activeReplayOrder"][-2], order["activeReplayOrder"][-1] = order["activeReplayOrder"][-1], order["activeReplayOrder"][-2]
elif case == "m067-wrong-path":
    by_id["M-067"]["patch"] = "patches/mobile/P126-not-approved.patch"
elif case == "m067-wrong-hash":
    by_id["M-067"]["sha256"] = "0" * 64
elif case == "m067-broadened-targets":
    by_id["M-067"]["targets"].append("packages/app/src/session/route.tsx")
elif case == "m067-helper-drift":
    helper = root / "vendor/upstream/packages/app/e2e/utils/mock-server.ts"
    helper.write_text(helper.read_text().replace("Location plugins did not finish activating", "Location plugins changed"))
elif case == "m068-wrong-path":
    by_id["M-068"]["patch"] = "patches/mobile/P126-not-approved.patch"
elif case == "m068-wrong-hash":
    by_id["M-068"]["sha256"] = "0" * 64
elif case == "m068-broadened-targets":
    by_id["M-068"]["targets"].append("packages/app/src/shell/routes/routes.tsx")
elif case == "m068-fixture-drift":
    fixture = root / "vendor/upstream/packages/app/e2e/utils/app-direction.fixture.tsx"
    fixture.write_text(fixture.read_text().replace('from "@opencode/plugin/gui"', 'from "@opencode/plugin/other"'))
elif case == "source-ledger-drift":
    provenance["p126RuntimePatchSources"][0]["files"][0]["hunks"] += 1
elif case == "vendor-runtime-policy":
    vendor["runtimePatchPolicy"]["deferredPatchesApplied"] = True
elif case == "manifest-runtime-policy-missing":
    manifest.pop("runtimePatchPolicy")
elif case == "provenance-runtime-policy-wrong-type":
    provenance["runtimePatchPolicy"]["activeClosureUsesExactOrder"] = 1
elif case == "replay-runtime-policy":
    order["runtimePatchPolicy"]["activePatchCount"] = 61
elif case == "wrong-initial-screen-owner":
    route = root / "vendor/upstream/packages/app/src/shell/routes/routes.tsx"
    route.write_text(route.read_text().replace("!getMobileHosts().initialScreenOwned()", "!getMobileHosts().initialOwned()"))
elif case == "voice-scope-expansion":
    region = root / "vendor/upstream/packages/app/src/session/composer/region.tsx"
    region.write_text(region.read_text() + '\nimport { VoiceComposer } from "@/voice/composer";\n')
elif case == "mobile-patch-parent-symlink":
    shutil.copytree(mobile, outside)
    shutil.rmtree(mobile)
    os.symlink(outside, mobile, target_is_directory=True)
elif case == "package-root-symlink":
    packages = root / "vendor/upstream/packages"
    shutil.move(packages, root / "vendor/upstream/packages.saved")
    shutil.move(root / "vendor/upstream/packages.saved", outside.parent / "packages-outside")
    os.symlink(outside.parent / "packages-outside", packages, target_is_directory=True)
else:
    raise SystemExit(f"unknown metadata test case: {case}")

if mobile.exists() and mobile.is_dir():
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    order_path.write_text(json.dumps(order, ensure_ascii=False, indent=2) + "\n")
    vendor_path.write_text(json.dumps(vendor, ensure_ascii=False, indent=2) + "\n")
    provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + "\n")
PY
}

run_metadata_case() {
  local name="$1" expected="$2"
  reset_fixture
  mutate_metadata "$name"
  local head
  head="$(commit_fixture "disposable runtime negative: $name" "$GOOD_COMMIT")"
  check_validator_reject "$name" 1 "$expected" "$head"
}

run_metadata_case m063-wrong-hash 'fixed P126 ID/path/hash mismatch: M-063'
run_metadata_case m063-wrong-status 'M-063 is not the sole final deferred record'
run_metadata_case m063-active-order 'runtime replay-order ID sequence differs from literal order'
run_metadata_case runtime-order 'runtime replay-order ID sequence differs from literal order'
run_metadata_case deferred-activation 'vendor-manifest active path list/order differs from the exact runtime order'
run_metadata_case m065-wrong-path 'fixed P126 ID/path/hash mismatch: M-065'
run_metadata_case m065-broadened-targets 'M-065 targets expanded beyond the real host API and its test'
run_metadata_case m066-wrong-path 'fixed P126 ID/path/hash mismatch: M-066'
run_metadata_case m066-wrong-hash 'fixed P126 ID/path/hash mismatch: M-066'
run_metadata_case m066-broadened-targets 'M-066 targets expanded beyond the composer submit test'
run_metadata_case new-runtime-order 'runtime replay-order ID sequence differs from literal order'
run_metadata_case m067-wrong-path 'fixed P126 ID/path/hash mismatch: M-067'
run_metadata_case m067-wrong-hash 'fixed P126 ID/path/hash mismatch: M-067'
run_metadata_case m067-broadened-targets 'M-067 targets expanded beyond its two approved E2E compatibility files'
run_metadata_case m067-helper-drift 'M-067 mockPluginsActivating differs from the fixed upstream helper'
run_metadata_case m068-wrong-path 'fixed P126 ID/path/hash mismatch: M-068'
run_metadata_case m068-wrong-hash 'fixed P126 ID/path/hash mismatch: M-068'
run_metadata_case m068-broadened-targets 'M-068 targets expanded beyond its two approved E2E compatibility files'
run_metadata_case m068-fixture-drift 'M-068 app-direction fixture differs from the complete fixed upstream target copy'
run_metadata_case source-ledger-drift 'source file add/delete/hunk ledger differs from immutable bytes: M-057'
run_metadata_case vendor-runtime-policy 'runtime policy mismatch or missing in vendor-manifest'
run_metadata_case manifest-runtime-policy-missing 'runtime policy mismatch or missing in manifest'
run_metadata_case provenance-runtime-policy-wrong-type 'runtime policy mismatch or missing in provenance'
run_metadata_case replay-runtime-policy 'runtime policy mismatch or missing in replay-order'
run_metadata_case wrong-initial-screen-owner 'M-060 mobile-hosts initialScreenOwned gate was lost'
run_metadata_case voice-scope-expansion 'deferred VoiceComposer wrapper/import was activated'
run_metadata_case mobile-patch-parent-symlink 'mobile patch directory is symlinked or non-canonical'
run_metadata_case package-root-symlink 'vendor package tree is symlinked or non-canonical'

# The historical profile must stay pinned to the old commit even when the
# current candidate metadata is intentionally invalid.
reset_fixture
mutate_metadata vendor-runtime-policy
HISTORICAL_NEGATIVE_CANDIDATE="$(commit_fixture 'runtime metadata intentionally invalid' "$GOOD_COMMIT")"
run_validator "$NON_GIT_CWD" "$VALIDATOR_EVIDENCE/historical-frozen" --profile historical-block1 --base "$HISTORICAL_BASE" > "$WORK/validator-historical.log" 2>&1
grep -Fq 'historical fixture: PASS profile=historical-block1 base=d37260c002b4390060f7d6cd78ffe6a11e9e1012 snapshot=aa666a31b7e1fae5fbd17bc616df38f2e3c634c3 frozen metadata/source; active=56 deferred=6' "$WORK/validator-historical.log"
mkdir -p "$VALIDATOR_EVIDENCE/historical-frozen-copy"
cp -a "$VALIDATOR_EVIDENCE/historical-frozen/." "$VALIDATOR_EVIDENCE/historical-frozen-copy/"
printf 'historical profile ignored intentionally invalid current metadata at %s\n' "$HISTORICAL_NEGATIVE_CANDIDATE"

reset_fixture
printf '\n# unregistered runtime drift\n' >> "$FIXTURE/vendor/upstream/packages/app/package.json"
DRIFT_COMMIT="$(commit_fixture 'disposable exact-tree drift negative' "$GOOD_COMMIT")"
check_validator_reject runtime-tree-drift 1 'runtime candidate vendor packages vs exact 65-patch replay: FAIL' "$DRIFT_COMMIT"

reset_fixture
printf '\n# uncommitted verifier state\n' >> "$FIXTURE/vendor/upstream/PROVENANCE.md"
check_validator_reject dirty-committed-candidate 1 'candidate checkout is dirty in committed-state mode' "$GOOD_COMMIT"

reset_fixture
ORPHAN="$(printf '%s\n' 'disposable unrelated runtime candidate' | GIT_AUTHOR_NAME='Closure test' GIT_AUTHOR_EMAIL='closure-test@example.invalid' GIT_COMMITTER_NAME='Closure test' GIT_COMMITTER_EMAIL='closure-test@example.invalid' git -C "$FIXTURE" commit-tree "$GOOD_COMMIT^{tree}")"
git -C "$FIXTURE" update-ref HEAD "$ORPHAN"
check_validator_reject non-ancestor 1 'fixed runtime base is not an ancestor of candidate HEAD' "$ORPHAN"

echo 'delivered P126 closure verifier disposable runtime/historical integration suite: PASS'
