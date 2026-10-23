#!/usr/bin/env bash
# leak-scan.sh — credential-leak heuristics for git-tracked files (V7).
#
# This is a lightweight heuristic scanner, NOT gitleaks (not installed in this environment).
# It scans files tracked by git for high-confidence secret shapes and common credential
# assignments, and spot-checks that sensitive artifact paths stay gitignored. Findings must
# be reviewed by a human; exit code 1 marks probable leaks.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

status=0

# ---------- high-confidence secret shapes ----------
echo "== high-confidence patterns (git-tracked files) =="
HIGH='-----BEGIN (RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bsk-ant-[A-Za-z0-9_-]{20,}\b|\bsk-proj-[A-Za-z0-9_-]{20,}\b|\bgsk_[A-Za-z0-9]{20,}\b|\bglpat-[A-Za-z0-9_-]{20,}\b'
RAW_HITS="$(git grep -n -E -e "$HIGH" -- . || true)"
# Documented example credentials are not leaks: AKIAIOSFODNN7EXAMPLE is AWS's canonical
# documentation example access key, used by upstream test fixtures (packages/ai/test).
FILTERED="$(printf '%s\n' "$RAW_HITS" | grep -v -F 'AKIAIOSFODNN7EXAMPLE' || true)"
FILTERED_COUNT=0
[ -n "$RAW_HITS" ] && FILTERED_COUNT="$(printf '%s\n' "$RAW_HITS" | grep -c -F 'AKIAIOSFODNN7EXAMPLE' || true)"
echo "leak-scan: filtered $FILTERED_COUNT documented example-credential hit(s) (AKIAIOSFODNN7EXAMPLE, AWS docs example)"
HITS="$FILTERED"
if [ -n "$HITS" ]; then
  echo "$HITS"
  echo "leak-scan: FAIL high-confidence secret pattern(s) found"
  status=1
else
  echo "leak-scan: OK no high-confidence secret patterns in tracked files"
fi

# ---------- low-confidence heuristic: credential assignments ----------
echo "== low-confidence patterns (review required; not a failure by themselves) =="
LOW="(password|passwd|secret|api[_-]?key|token)[[:space:]]*[:=][[:space:]]*[\"'][^\"']{8,}[\"']"
LOW_HITS="$(git grep -n -i -E -e "$LOW" -- \
  ':(exclude)*.lock' ':(exclude)web-dist/manifest.json' ':(exclude)*.svg' \
  ':(exclude)vendor/upstream' ':(exclude)pnpm-lock.yaml' ':(exclude)*.min.js' || true)"
if [ -n "$LOW_HITS" ]; then
  echo "$LOW_HITS"
  echo "leak-scan: REVIEW low-confidence credential-assignment shapes above"
else
  echo "leak-scan: OK no low-confidence credential assignments in first-party tracked files"
fi

# ---------- gitignore spot checks (V7 requirement) ----------
echo "== check-ignore spot checks =="
check_ignored() {
  local path="$1"
  if git check-ignore -q "$path"; then
    echo "leak-scan: OK  ignored: $path ($(git check-ignore -v "$path" | cut -d' ' -f2 | head -1))"
  else
    echo "leak-scan: FAIL not ignored: $path"
    status=1
  fi
}
check_ignored "android/app/src/main/assets/web/index.html"
check_ignored "android/app/src/main/assets/web/"
check_ignored "vendor/upstream/packages/app/dist/index.html"
check_ignored "node_modules/bun"
check_ignored "debug.jks"
check_ignored "release.keystore"

echo
if [ "$status" -eq 0 ]; then
  echo "leak-scan: PASS (heuristic scanner; not a substitute for gitleaks/truffleHog on a secret-capable host)"
else
  echo "leak-scan: FAIL"
fi
exit "$status"
