#!/usr/bin/env node
// Boot-analysis A/B benchmark.
//
// Runs the app headlessly under each `yomikikuan_boot_analysis` mode and
// reports how long the shell/analysis takes and how many bytes the page
// fetched before analysis was ready. Localhost only — use it to compare the
// modes against each other, not as a real-user latency measurement.
//
// Usage:
//   node scripts/bench-boot-analysis.mjs [--runs=3] [--port=8040]
//   npm run bench:boot
//
// Modes:
//   immediate — legacy: analyze ~100ms after boot
//   idle      — default: analyze after `load` + idle callback
//   manual    — no auto-analysis; a prompt with an Analyze button is shown
//               (the "after click" column measures that button)

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? 'true' : v];
}));
const RUNS = Math.max(1, Number(args.runs) || 3);
const PORT = Number(args.port) || 8040;
const BASE = `http://127.0.0.1:${PORT}`;

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [
    process.env.PLAYWRIGHT_NODE_PATH,
    path.join(REPO, 'node_modules'),
    '/opt/homebrew/lib/node_modules/@playwright/mcp/node_modules',
    '/usr/local/lib/node_modules/@playwright/mcp/node_modules',
  ].filter(Boolean);
  for (const dir of candidates) {
    try {
      return require(path.join(dir, 'playwright'));
    } catch (_) { /* try next */ }
  }
  throw new Error('playwright not found — set PLAYWRIGHT_NODE_PATH or npm install playwright');
}

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (_) { /* retry */ }
    await sleep(150);
  }
  throw new Error(`server did not start at ${url}`);
}

const MEASURE = () => {
  // Runs in the page. Polls until analysis content (or the manual prompt) is
  // visible, then snapshots navigation timing + resource transfer sizes.
  return new Promise((resolve) => {
    const t0 = performance.now();
    const isReady = () => {
      const content = document.getElementById('content');
      if (!content) return false;
      return content.querySelectorAll('.line-container, .token-pill').length > 0
        || !!document.querySelector('.boot-analysis-prompt');
    };
    const sample = () => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const res = performance.getEntriesByType('resource');
      const dicts = res.filter((r) => /\/libs\/dict\/.*\.dat\.gz/.test(r.name));
      const sums = (key) => res.reduce((a, r) => a + (r[key] || 0), 0);
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      resolve({
        readyMs: Math.round(performance.now()),
        fcpMs: fcp ? Math.round(fcp.startTime) : null,
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
        loadEventMs: Math.round(nav.loadEventEnd || 0),
        transferBytes: sums('transferSize'),
        resourceCount: res.length,
        dictFiles: dicts.length,
        dictBytes: dicts.reduce((a, r) => a + (r.transferSize || 0), 0),
        manualPrompt: !!document.querySelector('.boot-analysis-prompt'),
      });
    };
    if (isReady()) { sample(); return; }
    const timer = setInterval(() => {
      if (isReady()) { clearInterval(timer); sample(); }
      if (performance.now() - t0 > 30000) { clearInterval(timer); sample(); }
    }, 25);
  });
};

async function runOnce(browser, mode) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
  });
  await ctx.addInitScript((m) => {
    try { localStorage.setItem('yomikikuan_boot_analysis', m); } catch (_) {}
  }, mode);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.documentManager === 'object', { timeout: 15000 });
  const before = await page.evaluate(MEASURE);
  let afterClick = null;
  if (mode === 'manual') {
    const t = Date.now();
    await page.click('#bootAnalysisRunBtn');
    await page.waitForFunction(() => {
      const c = document.getElementById('content');
      return c && c.querySelectorAll('.line-container, .token-pill').length > 0;
    }, { timeout: 30000 });
    afterClick = { clickToAnalysisMs: Date.now() - t };
  }
  await ctx.close();
  return { ...before, ...(afterClick || {}), errors };
}

function median(values) {
  const v = values.filter((x) => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  return v[Math.floor(v.length / 2)];
}

const { chromium } = resolvePlaywright();
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
  cwd: REPO,
  stdio: 'ignore',
});
let browser;
try {
  await waitForServer(`${BASE}/index.html`);
  browser = await chromium.launch({ headless: true });
  const modes = ['immediate', 'idle', 'manual'];
  const results = {};
  for (const mode of modes) {
    results[mode] = [];
    for (let i = 0; i < RUNS; i++) {
      try {
        results[mode].push(await runOnce(browser, mode));
      } catch (e) {
        results[mode].push({ error: e.message });
      }
    }
  }

  const fmt = (n) => (n == null ? '—' : String(n));
  const kib = (n) => (n == null ? '—' : `${(n / 1024).toFixed(1)} KiB`);
  console.log('\n## Boot-analysis A/B benchmark (localhost, headless Chromium, SW blocked)\n');
  console.log(`runs per mode: ${RUNS} (median reported)\n`);
  console.log('| Mode | FCP | DOMContentLoaded | load | Shell/analysis ready | Transfer @ ready | Dict files @ ready |');
  console.log('|---|---|---|---|---|---|---|');
  for (const mode of modes) {
    const rows = results[mode].filter((r) => !r.error);
    console.log(`| ${mode} | ${fmt(median(rows.map((r) => r.fcpMs)))} ms | ${fmt(median(rows.map((r) => r.domContentLoadedMs)))} ms | ${fmt(median(rows.map((r) => r.loadEventMs)))} ms | ${fmt(median(rows.map((r) => r.readyMs)))} ms | ${kib(median(rows.map((r) => r.transferBytes)))} | ${fmt(median(rows.map((r) => r.dictFiles)))} |`);
  }
  const manual = results.manual.filter((r) => !r.error);
  if (manual.length) {
    console.log(`\nmanual: click → analysis ready = ${fmt(median(manual.map((r) => r.clickToAnalysisMs)))} ms (median)`);
  }
  const failures = Object.entries(results).flatMap(([m, rows]) => rows.filter((r) => r.error).map((r) => `${m}: ${r.error}`));
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(`- ${f}`));
    process.exitCode = 1;
  }
} finally {
  if (browser) await browser.close();
  server.kill();
}
