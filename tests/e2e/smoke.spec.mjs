// E2E smoke specs — 8 happy paths covering the major user-visible
// surfaces of YomiKiku-an. Run via `bash scripts/e2e.sh` (which spawns
// a Python HTTP server + injects PLAYWRIGHT_NODE_PATH).
//
// Design notes:
// - No live Gemini calls. AI-dependent flows are driven via documented
//   window.__yomikikuan* hooks (see CLAUDE.md "Classic-script globals"),
//   not via UI buttons that would require mocking the network layer.
// - Each test isolates itself by clearing localStorage + IDB before
//   the page loads (via init script).
// - Failure prints the first console error captured during the test
//   to help triage flakes.
// - Scenarios ⑤/⑥ are the 「和纸书斋」 redesign regression guards:
//   desktop = right-hand AI rail + fixed bottom dock + paper canvas;
//   mobile = rail collapses into a bottom tab strip under the dock.
// - Scenario ⑧ deliberately does NOT assert Firebase CDN success — only
//   that the static login shell renders and no fatal pageerror fires.

const PORT = process.env.YK_E2E_PORT || '8002';
const BASE = `http://localhost:${PORT}`;

// Resolve `playwright` via CommonJS require so the NODE_PATH env (set by
// scripts/e2e.sh) takes effect. Node ESM ignores NODE_PATH, hence the
// createRequire bridge — same trick scripts/test.sh uses via inline CJS.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const TESTS = [
  { name: '①  app boots — title + #textInput + 4 panel buttons present',          fn: bootSmoke },
  { name: '②  analyze → vocab — addVocab via window hook renders in vocabPanel', fn: analyzeToVocab },
  { name: '③  backup roundtrip — docs + vocab survive export → clear → import', fn: backupRoundtrip },
  { name: '④  YouTube panel opens with 3 tabs (A 字幕导入 / B 伴读 / C 听力题)', fn: youtubePanelOpens },
  { name: '⑤  desktop 1440×900 — AI rail (5 btns) + fixed dock + paper bg, 0 console errors', fn: desktopRedesign, viewport: { width: 1440, height: 900 } },
  { name: '⑥  mobile 390×844 — AI rail bottom strip, dock above it, rail click opens panel', fn: mobileRedesign, viewport: { width: 390, height: 844 } },
  { name: '⑦  backup v2 import — docs/settings restored, SRS section silently skipped', fn: backupV2Compatibility },
  { name: '⑧  login.html smoke — HTTP 200 + login card, no fatal pageerror',    fn: loginPageSmoke },
];

// Cleared once at the start of each scenario (via Playwright init script).
const INIT_SCRIPT = `(() => {
  try {
    localStorage.clear();
    indexedDB.deleteDatabase('yomikikuan-srs');
    indexedDB.deleteDatabase('yomikikuan-analysis');
    indexedDB.deleteDatabase('yomikikuan-tokens');
  } catch (e) {}
  // Pre-seed a Gemini key placeholder so the panels don't grey out their
  // CTAs in the "no key" branch — none of these tests trigger a real call.
  try { localStorage.setItem('yomikikuan_gemini_api_key', 'AIza-E2E-PLACEHOLDER'); } catch (e) {}
})();`;

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext(opts.viewport ? { viewport: opts.viewport } : {});
  await ctx.addInitScript(INIT_SCRIPT);
  // `config.js` is a gitignored local-only file (see CLAUDE.md "Local
  // config"). A CI checkout doesn't have it, so the classic
  // <script src="config.js"> would 404 and emit a console error — which
  // would defeat scenario ⑤'s "zero console errors" guard. Keep the real
  // file when present (local dev) and substitute an empty script when the
  // server 404s, so the assertion is meaningful in both environments.
  await ctx.route('**/config.js', async (route) => {
    try {
      const response = await route.fetch();
      if (response.status() < 400) return route.fulfill({ response });
    } catch (_) { /* fall through to the empty stand-in */ }
    return route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '/* e2e: config.js absent (gitignored local-only file) */\n',
    });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
  return { ctx, page, errors };
}

// Wait for the SPA bootstrap to settle. Boot is async (ESM modules +
// classic scripts), so we wait for the textarea AND a documentManager
// classic-script global to be exposed.
async function waitForBoot(page) {
  // #textInput exists in the DOM from the initial HTML but may be hidden
  // until a document is loaded — wait for attachment, not visibility.
  await page.waitForSelector('#textInput', { state: 'attached', timeout: 8000 });
  await page.waitForFunction(
    () => typeof window.documentManager === 'object' && document.getElementById('vocabBtn'),
    { timeout: 8000 },
  );
}

// --- scenarios ---

async function bootSmoke(page) {
  await page.goto(`${BASE}/index.html`);
  await waitForBoot(page);

  const checks = await page.evaluate(() => {
    const ids = ['textInput', 'vocabBtn', 'articleSummaryBtn', 'jlptBtn', 'youtubeBtn', 'bilingualToggle'];
    const missing = ids.filter((id) => !document.getElementById(id));
    return {
      title: document.title,
      missing,
      hasDocMgr: typeof window.documentManager === 'object',
      hasI18n: typeof window.YomikikuanGetText === 'function',
    };
  });

  assert(checks.missing.length === 0, `missing header elements: ${checks.missing.join(', ')}`);
  assert(checks.hasDocMgr, 'window.documentManager not exposed');
  assert(checks.hasI18n, 'window.YomikikuanGetText not exposed');
  assert(checks.title.length > 0, 'document.title empty');
}

async function analyzeToVocab(page) {
  await page.goto(`${BASE}/index.html`);
  await waitForBoot(page);

  // The vocab module is preloaded (per panel-triggers.js); wait for the
  // __yomikikuanAddVocab hook to actually be installed.
  await page.waitForFunction(
    () => typeof window.__yomikikuanAddVocab === 'function',
    { timeout: 8000 },
  );

  // Simulate the translation-modal's "📎 加入词汇本" save action. Uses the
  // canonical srs schema fields {word, reading, gloss, source} — not the
  // articleSummary.js {surface, meaning_zh} shape, which is a separate
  // pre-existing bug (silent EMPTY_VOCAB error swallowed by try/catch).
  await page.evaluate(() => {
    return window.__yomikikuanAddVocab({
      word: '気持ち',
      reading: 'きもち',
      gloss: '心情',
      source: { docId: '', sentence: '良い気持ちだ。' },
    });
  });

  // Open the vocab panel via programmatic click — the header toolbar
  // may be CSS-hidden until a document is active; force:true didn't
  // bypass actionability checks reliably in this Playwright build.
  await page.evaluate(() => document.getElementById('vocabBtn').click());
  await page.waitForSelector('.vocab-item, .vocab-empty', { timeout: 5000 });

  const itemCount = await page.locator('.vocab-item').count();
  const emptyVisible = await page.locator('.vocab-empty').count();
  assert(itemCount >= 1, `expected >=1 .vocab-item, got ${itemCount} (empty visible: ${emptyVisible})`);

  const wordText = await page.locator('.vocab-item .word').first().textContent();
  assert((wordText || '').includes('気持ち'), `vocab card missing word: "${wordText}"`);
}

async function backupRoundtrip(page) {
  await page.goto(`${BASE}/index.html`);
  await waitForBoot(page);
  await page.waitForFunction(
    () => typeof window.__yomikikuanAddVocab === 'function'
       && typeof window.__yomikikuanDumpSrs === 'function'
       && typeof window.__yomikikuanRestoreSrs === 'function',
    { timeout: 8000 },
  );

  // Setup: create a doc + add a vocab entry.
  await page.evaluate(async () => {
    const dm = window.documentManager;
    const docs = dm.getAllDocuments();
    docs.push({
      id: 'e2e-doc-1',
      title: 'E2E Test Doc',
      content: '今日は良い天気だ。\n散歩に行きたい。',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      locked: false,
      folder: null,
      folderId: null,
      favorite: false,
    });
    dm.saveAllDocuments(docs);
    dm.setActiveId('e2e-doc-1');

    await window.__yomikikuanAddVocab({
      word: '散歩',
      reading: 'さんぽ',
      gloss: '散步',
    });
  });

  // Export → snapshot payload via the real backup module.
  const payload = await page.evaluate(async () => {
    const m = await import('/static/js/modules/backup/index.js');
    return m.collectBackupPayload({
      getDocuments: () => window.documentManager.getAllDocuments(),
      getActiveId:  () => window.documentManager.getActiveId(),
      getSettings:  () => ({
        yomikikuan_theme: localStorage.getItem('yomikikuan_theme') || '',
        yomikikuan_lang:  localStorage.getItem('yomikikuan_lang')  || '',
      }),
    });
  });

  assert(payload.version === 3, `expected schema v3, got ${payload.version}`);
  assert(payload.app === 'YomiKiku-an', `unexpected app: ${payload.app}`);
  assert(Array.isArray(payload.data?.documents), 'data.documents not array');
  assert(payload.data.documents.some((d) => d.id === 'e2e-doc-1'), 'seed doc missing from payload');
  assert(payload.data.srs?.vocab?.some((v) => v.word === '散歩'), 'seed vocab missing from payload');
  assert(/^\d{4}-\d{2}-\d{2}T/.test(payload.createdAt), `bad createdAt: ${payload.createdAt}`);

  // Wipe state — clear user-stored documents + SRS IDB. (The app ships
  // a sample-document bundle that auto-loads into dm.getAllDocuments();
  // we test by checking the seed doc specifically, not total count.)
  await page.evaluate(async () => {
    // Force the document store to a known empty state, bypassing
    // sample-bundle hydration that would otherwise re-populate it.
    window.documentManager.saveAllDocuments([]);
    window.documentManager.setActiveId('');
    localStorage.removeItem('yomikikuan_texts');
    localStorage.removeItem('yomikikuan_activeId');
    const dbs = ['yomikikuan-srs'];
    await Promise.all(dbs.map((name) => new Promise((res) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = req.onerror = req.onblocked = () => res();
    })));
  });

  // Verify wipe worked — the seed doc should NOT be present.
  const cleared = await page.evaluate(() => {
    const docs = window.documentManager.getAllDocuments();
    return { hasSeedDoc: docs.some((d) => d.id === 'e2e-doc-1') };
  });
  assert(!cleared.hasSeedDoc, 'seed doc still present after wipe');

  // Restore from snapshot.
  await page.evaluate(async (p) => {
    const m = await import('/static/js/modules/backup/index.js');
    await m.applyBackup(p, { LS: {} });
  }, payload);

  // Verify restoration.
  const restored = await page.evaluate(async () => {
    const docs = JSON.parse(localStorage.getItem('yomikikuan_texts') || '[]');
    const srsModule = await import('/static/js/modules/srs/store.js');
    const vocab = await srsModule.listVocab({ bucket: 'all', sort: 'created' });
    return {
      docCount: docs.length,
      hasSeedDoc: docs.some((d) => d.id === 'e2e-doc-1'),
      vocabCount: vocab.length,
      hasSeedVocab: vocab.some((v) => v.word === '散歩'),
    };
  });
  assert(restored.docCount >= 1, `expected docs restored, got ${restored.docCount}`);
  assert(restored.hasSeedDoc, 'seed doc not restored');
  assert(restored.hasSeedVocab, 'seed vocab not restored');
}

async function youtubePanelOpens(page) {
  // Pin the UI language to zh so the tab-label assertions below are
  // deterministic — without this, a non-CJK Playwright browser locale
  // (e.g. Chromium's default 'en-US') resolves currentLang to 'en' via
  // detectBrowserLanguage(), rendering English tab labels instead.
  await page.addInitScript(() => { try { localStorage.setItem('lang', 'zh'); } catch (_) {} });
  await page.goto(`${BASE}/index.html`);
  await waitForBoot(page);

  // Click the YouTube button — triggers lazy-import of modules/youtube/index.js.
  // Programmatic click to bypass header-visibility actionability quirks
  // (see test ② for context).
  await page.evaluate(() => document.getElementById('youtubeBtn').click());

  // Panel should mount with all three tab buttons (A / B / C).
  await page.waitForSelector('.youtube-overlay, .youtube-panel', { timeout: 6000 });

  const tabs = await page.evaluate(() => {
    const list = Array.from(document.querySelectorAll('.youtube-tab'));
    return list.map((b) => ({
      tab: b.getAttribute('data-tab'),
      label: (b.textContent || '').trim(),
    }));
  });

  const tabsByName = Object.fromEntries(tabs.map((t) => [t.tab, t.label]));
  assert(tabsByName['import']?.includes('字幕'), `tab A label missing 字幕: "${tabsByName['import']}"`);
  assert(tabsByName['companion']?.includes('伴读'), `tab B label missing 伴读: "${tabsByName['companion']}"`);
  assert(tabsByName['listening']?.includes('听力'), `tab C label missing 听力: "${tabsByName['listening']}"`);
}

// ⑤ 「和纸书斋」 desktop redesign guards — 1440×900.
async function desktopRedesign(page, errors) {
  await page.goto(`${BASE}/index.html`);
  await waitForBoot(page);
  // Let deferred modules / the service-worker install settle so any boot
  // console error is captured before we assert on the error list.
  await page.waitForTimeout(400);

  const info = await page.evaluate(() => {
    const rail = document.getElementById('aiRail');
    const dock = document.getElementById('headerPlayControl');
    if (!rail) return { missingRail: true };

    const railRect = rail.getBoundingClientRect();
    const railStyle = getComputedStyle(rail);
    const ids = ['inspectorToggleBtn', 'vocabBtn', 'articleSummaryBtn', 'jlptBtn', 'youtubeBtn'];
    const buttons = ids.map((id) => {
      const el = rail.querySelector(`#${id}`);
      if (!el) return { id, present: false, visible: false };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        id,
        present: true,
        visible: r.width > 0 && r.height > 0
          && cs.display !== 'none' && cs.visibility !== 'hidden',
      };
    });

    const dockStyle = dock ? getComputedStyle(dock) : null;
    const dockRect = dock ? dock.getBoundingClientRect() : null;
    return {
      missingRail: false,
      railVisible: railRect.width > 0 && railRect.height > 0
        && railStyle.display !== 'none' && railStyle.visibility !== 'hidden',
      railPosition: railStyle.position,
      railOnRight: railRect.left > window.innerWidth / 2,
      buttons,
      dockPosition: dockStyle ? dockStyle.position : null,
      dockOnScreen: dockRect
        ? dockRect.width > 0 && dockRect.height > 0
          && dockRect.top >= 0 && dockRect.bottom <= window.innerHeight + 1
        : false,
      bodyBg: getComputedStyle(document.body).backgroundColor,
    };
  });

  assert(!info.missingRail, '#aiRail is missing from the desktop redesign layout');
  assert(info.railVisible, '#aiRail is not visible at 1440×900');
  assert(info.railPosition === 'fixed', `#aiRail should be position:fixed, got "${info.railPosition}"`);
  assert(info.railOnRight, '#aiRail should be anchored on the right-hand side of the viewport');

  const missing = info.buttons.filter((b) => !b.present).map((b) => b.id);
  assert(missing.length === 0, `#aiRail is missing buttons: ${missing.join(', ')}`);
  const hidden = info.buttons.filter((b) => !b.visible).map((b) => b.id);
  assert(hidden.length === 0, `#aiRail buttons not visible: ${hidden.join(', ')}`);

  assert(info.dockPosition === 'fixed',
    `#headerPlayControl computed position should be "fixed", got "${info.dockPosition}"`);
  assert(info.dockOnScreen, '#headerPlayControl player dock is not rendered inside the viewport');

  // Paper canvas #FAF7F2 → rgb(250, 247, 242); allow ±2 per channel for
  // platform color management differences.
  const channels = (info.bodyBg.match(/\d+/g) || []).map(Number);
  const paper = [250, 247, 242];
  assert(channels.length >= 3
    && channels.slice(0, 3).every((v, i) => Math.abs(v - paper[i]) <= 2),
    `body background is not the paper token (expected ≈ rgb(250, 247, 242)): ${info.bodyBg}`);

  assert(errors.length === 0, `desktop boot emitted console/page errors: ${errors[0]}`);
}

// ⑥ 「和纸书斋」 mobile redesign guards — 390×844.
async function mobileRedesign(page) {
  await page.goto(`${BASE}/index.html`);
  await waitForBoot(page);

  const info = await page.evaluate(() => {
    const rail = document.getElementById('aiRail');
    const dock = document.getElementById('headerPlayControl');
    const rr = rail.getBoundingClientRect();
    const dr = dock.getBoundingClientRect();
    return {
      railPosition: getComputedStyle(rail).position,
      railTop: rr.top,
      railBottom: rr.bottom,
      railWidth: rr.width,
      railHeight: rr.height,
      dockPosition: getComputedStyle(dock).position,
      dockTop: dr.top,
      dockBottom: dr.bottom,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
    };
  });

  assert(info.railPosition === 'fixed', `mobile #aiRail should be position:fixed, got "${info.railPosition}"`);
  assert(Math.abs(info.railBottom - info.innerHeight) <= 2,
    `mobile #aiRail should hug the viewport bottom: bottom=${info.railBottom}, innerHeight=${info.innerHeight}`);
  assert(Math.abs(info.railHeight - 60) <= 6,
    `mobile #aiRail should collapse to a ~60px bottom strip, height=${info.railHeight}`);
  assert(info.railWidth >= info.innerWidth - 1,
    `mobile #aiRail should span the viewport width: width=${info.railWidth}, innerWidth=${info.innerWidth}`);

  assert(info.dockPosition === 'fixed', `mobile #headerPlayControl should be position:fixed, got "${info.dockPosition}"`);
  assert(info.dockBottom <= info.railTop + 1,
    `player dock should sit above the bottom rail: dock.bottom=${info.dockBottom}, rail.top=${info.railTop}`);

  // Rail clicks must still open their panel on mobile (DOM position is
  // irrelevant — handlers bind by id). Use vocab: deterministic, no network.
  await page.waitForFunction(
    () => typeof window.__yomikikuanAddVocab === 'function',
    { timeout: 8000 },
  );
  await page.evaluate(() => {
    return window.__yomikikuanAddVocab({
      word: '気持ち',
      reading: 'きもち',
      gloss: '心情',
      source: { docId: '', sentence: '良い気持ちだ。' },
    });
  });
  await page.evaluate(() => document.getElementById('vocabBtn').click());
  await page.waitForSelector('.vocab-overlay', { state: 'visible', timeout: 5000 });

  const panel = await page.evaluate(() => {
    const overlay = document.querySelector('.vocab-overlay');
    return {
      overlayPresent: !!overlay,
      overlayDisplay: overlay ? getComputedStyle(overlay).display : null,
      itemCount: document.querySelectorAll('.vocab-item').length,
    };
  });
  assert(panel.overlayPresent, 'mobile #aiRail vocab click did not mount the vocab overlay');
  assert(panel.overlayDisplay !== 'none', 'mobile vocab overlay is not displayed');
  assert(panel.itemCount >= 1, `mobile vocab panel should show the seeded entry, got ${panel.itemCount} .vocab-item`);
}

// ⑦ Backup schema v2 compatibility — no `data.srs`, so the SRS restore
// hook must never be called and local learning data must be untouched.
async function backupV2Compatibility(page) {
  await page.goto(`${BASE}/index.html`);
  await waitForBoot(page);
  await page.waitForFunction(
    () => typeof window.__yomikikuanAddVocab === 'function'
       && typeof window.__yomikikuanDumpSrs === 'function'
       && typeof window.__yomikikuanRestoreSrs === 'function',
    { timeout: 8000 },
  );

  const result = await page.evaluate(async () => {
    // Seed user-owned SRS data that must survive a v2 import.
    await window.__yomikikuanAddVocab({
      word: '散歩',
      reading: 'さんぽ',
      gloss: '散步',
    });

    // Count restore-hook invocations without changing observable behaviour.
    let restoreCalls = 0;
    const originalRestore = window.__yomikikuanRestoreSrs;
    window.__yomikikuanRestoreSrs = async (payload) => {
      restoreCalls += 1;
      return originalRestore(payload);
    };

    // Realistic v2 payload: app/version/createdAt/data{documents,activeId,
    // settings} — and deliberately NO data.srs.
    const v2 = {
      app: 'YomiKiku-an',
      version: 2,
      createdAt: new Date().toISOString(),
      data: {
        documents: [{
          id: 'e2e-v2-doc',
          title: 'v2 backup doc',
          content: 'こんにちは。\n今日は良い天気だ。',
          createdAt: 1,
          updatedAt: 2,
          locked: false,
          folder: null,
          folderId: null,
          favorite: false,
        }],
        activeId: 'e2e-v2-doc',
        settings: {
          yomikikuan_theme: 'paper',
          yomikikuan_lang: 'ja',
        },
      },
    };

    const mod = await import('/static/js/modules/backup/index.js');
    let threw = null;
    try {
      await mod.applyBackup(v2, { LS: {} });
    } catch (e) {
      threw = `${e && e.message}${e && e.stack ? ` | ${e.stack.split('\n')[0]}` : ''}`;
    } finally {
      window.__yomikikuanRestoreSrs = originalRestore;
    }

    const docs = JSON.parse(localStorage.getItem('yomikikuan_texts') || '[]');
    const srsAfter = await window.__yomikikuanDumpSrs();
    return {
      threw,
      docCount: docs.length,
      hasV2Doc: docs.some((d) => d.id === 'e2e-v2-doc'),
      activeId: localStorage.getItem('yomikikuan_activeId'),
      theme: localStorage.getItem('yomikikuan_theme'),
      lang: localStorage.getItem('yomikikuan_lang'),
      restoreCalls,
      srsAfter: srsAfter.vocab.map((v) => v.word),
    };
  });

  assert(result.threw === null, `applyBackup(v2) threw: ${result.threw}`);
  assert(result.docCount >= 1, `v2 import restored ${result.docCount} documents`);
  assert(result.hasV2Doc, 'v2 backup document not written to localStorage');
  assert(result.activeId === 'e2e-v2-doc', `v2 activeId not applied, got "${result.activeId}"`);
  assert(result.theme === 'paper', `v2 settings not applied (theme="${result.theme}")`);
  assert(result.lang === 'ja', `v2 settings not applied (lang="${result.lang}")`);
  assert(result.restoreCalls === 0,
    `v2 payload without data.srs must not invoke the SRS restore hook (called ${result.restoreCalls}×)`);
  assert(result.srsAfter.includes('散歩'),
    `existing SRS vocab was clobbered by a v2 import: ${JSON.stringify(result.srsAfter)}`);
}

// ⑧ login.html static-shell smoke. Firebase/Firestore live on an external
// CDN — we assert the local page renders, never that the CDN is reachable.
async function loginPageSmoke(page, errors) {
  const response = await page.goto(`${BASE}/login.html`, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() === 200,
    `GET /login.html expected HTTP 200, got ${response ? response.status() : 'no response'}`);

  await page.waitForSelector('.login-container', { state: 'attached', timeout: 8000 });
  await page.waitForTimeout(800); // let the inline Firebase module settle

  const shell = await page.evaluate(() => ({
    hasContainer: !!document.querySelector('.login-container'),
    hasCard: !!document.querySelector('.login-card'),
    hasGoogleBtn: !!document.getElementById('googleLoginBtn'),
    title: document.title,
  }));
  assert(shell.hasContainer, 'login page is missing .login-container');
  assert(shell.hasCard, 'login page is missing .login-card');
  assert(shell.hasGoogleBtn, 'login page is missing #googleLoginBtn');
  assert(shell.title.length > 0, 'login page document.title is empty');

  // CDN/module-load failures are expected to vary by environment (and are
  // explicitly out of scope); any other pageerror is fatal.
  const fatal = errors.filter((entry) =>
    entry.startsWith('pageerror:')
    && !/firebase|gstatic|googleapis|google-analytics|Failed to fetch|dynamically imported module|Importing a module|NetworkError/i.test(entry));
  assert(fatal.length === 0, `fatal pageerror on login.html: ${fatal[0]}`);
}

// --- harness ---

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAIL — ${msg}`);
}

(async () => {
  const browser = await chromium.launch();
  let passed = 0, failed = 0;

  for (const t of TESTS) {
    const { ctx, page, errors } = await newPage(browser, { viewport: t.viewport });
    const start = Date.now();
    try {
      await t.fn(page, errors);
      const ms = Date.now() - start;
      console.log(`✓  ${t.name}  (${ms}ms)`);
      passed++;
    } catch (e) {
      const ms = Date.now() - start;
      console.log(`✗  ${t.name}  (${ms}ms)`);
      console.log(`     ${e.message}`);
      if (errors.length) console.log(`     first console/page error: ${errors[0]}`);
      failed++;
    } finally {
      await ctx.close();
    }
  }
  await browser.close();
  console.log('---');
  console.log(`TOTAL: ${passed}/${TESTS.length} scenarios`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
