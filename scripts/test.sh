#!/usr/bin/env bash
# Run all *.test.html pages headlessly via Playwright.
#
# Usage:   bash scripts/test.sh    (or: npm test)
# Env:
#   YK_TEST_PORT          dev server port (default 8001)
#   PLAYWRIGHT_NODE_PATH  override the directory containing the playwright
#                         module — useful when playwright isn't a project
#                         devDep. Defaults to a common Homebrew location.
#
# Exits 0 on full pass, 1 on any failure. Server is always killed on exit.

set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${YK_TEST_PORT:-8001}"

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
  echo "ERROR: cannot find the 'playwright' Node module."
  echo "Install with one of:"
  echo "  npm install --save-dev playwright"
  echo "  npm install -g @playwright/mcp"
  echo "Or set PLAYWRIGHT_NODE_PATH to a directory containing 'playwright'."
  exit 2
fi

cd "$REPO"
python3 -m http.server "$PORT" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -s -o /dev/null "http://localhost:$PORT/index.html"; then break; fi
  sleep 0.5
done

NODE_PATH="$RESOLVED_NODE_PATH" node - "$PORT" <<'NODE_EOF'
const port = process.argv[2];
const { chromium } = require('playwright');

const TESTS = [
  'static/js/modules/analyzer/ui/jlpt/prompts.test.html',
  'static/js/modules/analyzer/ui/jlpt/session.test.html',
  'static/js/modules/analyzer/ui/jlpt/renderers.test.html',
  'static/js/modules/analyzer/ui/jlptPanel.test.html',
  'static/js/modules/ui/shortcut-help.test.html',
  'static/js/modules/ui/reader-mode.test.html',
  'static/js/modules/reading/kana.test.html',
  'static/js/modules/reading/reading.test.html',
  'static/js/modules/reading/ruby.test.html',
  'static/js/modules/player/segment.test.html',
  'static/js/modules/srs/store.test.html',
  'static/js/modules/backup/doc-export.test.html',
];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let totalPass = 0, totalCount = 0, failedPages = 0;

  for (const t of TESTS) {
    page.removeAllListeners('console');
    page.removeAllListeners('pageerror');
    const errs = [];
    page.on('pageerror', e => errs.push(`pageerror: ${e.message}`));
    await page.goto(`http://localhost:${port}/${t}`);
    await page.waitForTimeout(2000);
    const summary = await page.evaluate(() =>
      document.querySelector('#summary h3')?.textContent.trim() || '');
    const m = summary.match(/(\d+)\/(\d+)/);
    const pass = m ? +m[1] : 0;
    const count = m ? +m[2] : 0;
    totalPass += pass; totalCount += count;
    const ok = summary.includes('ALL PASS');
    if (!ok) failedPages++;
    const status = ok ? '✓' : '✗';
    const errStr = errs.length ? ` ! ${errs.join('; ')}` : '';
    console.log(`${status}  ${t.split('/').pop().padEnd(28)}  ${summary}${errStr}`);
  }

  await browser.close();
  console.log('---');
  console.log(`TOTAL: ${totalPass}/${totalCount} cases . ${TESTS.length - failedPages}/${TESTS.length} pages`);
  process.exit(failedPages === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
NODE_EOF
EXIT_CODE=$?

exit $EXIT_CODE
