#!/usr/bin/env bash
# Verify the fixed P126 runtime closure. The frozen historical Block 1 snapshot
# is available only through an explicit --profile historical-block1 request.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT_REPO="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
PROFILE="p126-runtime"
REPO_ARG="$SCRIPT_REPO"
BASE_ARG=""
EVIDENCE_ARG=""
CANDIDATE_HEAD=""
PROFILE_SET=0
REPO_SET=0
BASE_SET=0
EVIDENCE_SET=0
CANDIDATE_HEAD_SET=0

RUNTIME_BASE="afef1b948c59a901da710bb5793ea73d53948fbb"
HISTORICAL_BASE="d37260c002b4390060f7d6cd78ffe6a11e9e1012"

usage() {
  cat >&2 <<EOF
usage: $0 [--profile p126-runtime|historical-block1] [--repo ROOT]
          [--base COMMIT] [--evidence-dir DIR] [--candidate-head COMMIT]

Defaults: profile=p126-runtime, repo=the repository containing this script,
base=the fixed base for the selected profile, and a private external evidence
directory. --candidate-head is for a clean committed runtime candidate only.
EOF
}

fail_args() {
  echo "verify-closure: FAIL invalid or incomplete argument set" >&2
  usage
  exit 2
}

while (($#)); do
  case "$1" in
    --profile)
      (($# >= 2 && PROFILE_SET == 0)) || fail_args
      PROFILE="$2"
      PROFILE_SET=1
      shift 2
      ;;
    --repo)
      (($# >= 2 && REPO_SET == 0)) || fail_args
      REPO_ARG="$2"
      [[ -n "$REPO_ARG" ]] || fail_args
      REPO_SET=1
      shift 2
      ;;
    --base)
      (($# >= 2 && BASE_SET == 0)) || fail_args
      BASE_ARG="$2"
      [[ -n "$BASE_ARG" ]] || fail_args
      BASE_SET=1
      shift 2
      ;;
    --evidence-dir)
      (($# >= 2 && EVIDENCE_SET == 0)) || fail_args
      EVIDENCE_ARG="$2"
      [[ -n "$EVIDENCE_ARG" ]] || fail_args
      EVIDENCE_SET=1
      shift 2
      ;;
    --candidate-head)
      (($# >= 2 && CANDIDATE_HEAD_SET == 0)) || fail_args
      CANDIDATE_HEAD="$2"
      [[ -n "$CANDIDATE_HEAD" ]] || fail_args
      CANDIDATE_HEAD_SET=1
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "verify-closure: FAIL unknown argument: $1" >&2
      fail_args
      ;;
  esac
done

case "$PROFILE" in
  p126-runtime) EXPECTED_BASE="$RUNTIME_BASE" ;;
  historical-block1)
    EXPECTED_BASE="$HISTORICAL_BASE"
    [[ "$CANDIDATE_HEAD_SET" == 0 ]] || {
      echo "verify-closure: FAIL --candidate-head is not valid for historical-block1" >&2
      exit 2
    }
    ;;
  *)
    echo "verify-closure: FAIL unknown profile: $PROFILE" >&2
    fail_args
    ;;
esac

if [[ -z "$BASE_ARG" ]]; then
  BASE_ARG="$EXPECTED_BASE"
elif [[ "$BASE_ARG" != "$EXPECTED_BASE" ]]; then
  echo "verify-closure: FAIL base does not match profile $PROFILE" >&2
  exit 2
fi

[[ -d "$REPO_ARG" ]] || { echo "verify-closure: FAIL repo is not a directory" >&2; exit 2; }
ROOT="$(cd "$REPO_ARG" && pwd -P)"
GIT_ROOT="$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null)" || {
  echo "verify-closure: FAIL repo is not a Git worktree" >&2
  exit 2
}
[[ "$GIT_ROOT" == "$ROOT" ]] || { echo "verify-closure: FAIL --repo must name the worktree root" >&2; exit 2; }

if [[ -z "$EVIDENCE_ARG" ]]; then
  TMP_PARENT=""
  for candidate in "${TMPDIR:-/tmp}" /tmp/opencode /tmp /var/tmp; do
    [[ -d "$candidate" ]] || continue
    candidate="$(cd "$candidate" && pwd -P)" || continue
    case "$candidate/" in "$ROOT/"*) continue ;; esac
    [[ -w "$candidate" && -x "$candidate" ]] || continue
    TMP_PARENT="$candidate"
    break
  done
  [[ -n "$TMP_PARENT" ]] || { echo "verify-closure: FAIL no writable external temp directory for evidence" >&2; exit 125; }
  EVIDENCE_ARG="$(mktemp -d "${TMP_PARENT%/}/verify-closure-evidence.XXXXXX")" || {
    echo "verify-closure: FAIL cannot create private evidence directory" >&2
    exit 125
  }
else
  mkdir -p "$EVIDENCE_ARG" || { echo "verify-closure: FAIL cannot create evidence directory" >&2; exit 125; }
fi

EVIDENCE_DIR="$(cd "$EVIDENCE_ARG" && pwd -P)" || { echo "verify-closure: FAIL cannot resolve evidence directory" >&2; exit 125; }
case "$EVIDENCE_DIR/" in "$ROOT/"*) echo "verify-closure: FAIL evidence directory must be outside repo" >&2; exit 2 ;; esac
if [[ "$EVIDENCE_DIR" == "$EVIDENCE_ARG" && "$EVIDENCE_ARG" == "$(dirname "$EVIDENCE_ARG")" ]]; then
  echo "verify-closure: FAIL invalid evidence directory" >&2
  exit 2
fi

LOG="$EVIDENCE_DIR/verify-closure.$$.log"
[[ ! -e "$LOG" ]] || { echo "verify-closure: FAIL evidence log already exists: $LOG" >&2; exit 125; }

ARGS=(
  --repo "$ROOT"
  --profile "$PROFILE"
  --base "$BASE_ARG"
  --evidence-dir "$EVIDENCE_DIR"
)
[[ -z "$CANDIDATE_HEAD" ]] || ARGS+=(--candidate-head "$CANDIDATE_HEAD")

echo "verify-closure: profile=$PROFILE repo=$ROOT base=$BASE_ARG evidence=$EVIDENCE_DIR"
set +e
python3 "$SCRIPT_DIR/verify-closure.py" "${ARGS[@]}" 2>&1 | tee "$LOG"
RESULT=${PIPESTATUS[0]}
set -e
printf 'verify-closure: command_rc=%s log=%s\n' "$RESULT" "$LOG" | tee -a "$LOG"
exit "$RESULT"
