#!/usr/bin/env bash
# Run the E2E smoke spec via Playwright Chromium.
#
# Usage:   bash scripts/e2e.sh    (or: npm run e2e)
# Env:
#   YK_E2E_PORT           dev server port (default 8002)
#   PLAYWRIGHT_NODE_PATH  override the directory containing the playwright
#                         module — useful when playwright isn't a project
#                         devDep. Defaults to a common Homebrew location.
#
# Exits 0 on full pass, 1 on any failure. Server is always killed on exit.
#
# Mirrors scripts/test.sh's Playwright resolution strategy so it works on
# any machine that already has the unit-test runner working.

set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${YK_E2E_PORT:-8002}"

RESOLVED_NODE_PATH=""
for candidate in \
  "${PLAYWRIGHT_NODE_PATH:-}" \
  "$REPO/node_modules" \
  "/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules" \
  "/usr/local/lib/node_modules/@playwright/mcp/node_modules"; do
  [ -z "$candidate" ] && continue
  if [ -d "$candidate/playwright" ]; then
    RESOLVED_NODE_PATH="$candidate"
    break
  fi
done

if [ -z "$RESOLVED_NODE_PATH" ]; then
  echo "ERROR: playwright module not found." >&2
  echo "  Tried: \$PLAYWRIGHT_NODE_PATH, $REPO/node_modules, and common Homebrew @playwright/mcp paths." >&2
  echo "  Either install playwright in this repo (npm i -D playwright) or set" >&2
  echo "  PLAYWRIGHT_NODE_PATH to the dir containing the playwright/ subfolder." >&2
  exit 1
fi

echo "Using playwright at: $RESOLVED_NODE_PATH/playwright"

# Boot a static server on $PORT, wait for it, kill on exit.
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT

# Wait for port to accept connections (up to 5s).
for _ in $(seq 1 25); do
  if curl -fsS "http://localhost:$PORT/index.html" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

NODE_PATH="$RESOLVED_NODE_PATH" YK_E2E_PORT="$PORT" \
  node "$REPO/tests/e2e/smoke.spec.mjs"
EXIT_CODE=$?

exit $EXIT_CODE
