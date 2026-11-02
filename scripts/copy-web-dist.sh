#!/usr/bin/env bash
# Stage, adapt and verify the Android Web payload before publishing it.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 "$ROOT/scripts/android_web_assets.py" stage
