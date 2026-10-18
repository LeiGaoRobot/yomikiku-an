// E2E smoke specs — 12 happy paths covering the major user-visible
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
// - Scenarios ⑨/⑩ cover the lazy EasyMDE mount: normal connections mount it
//   after first paint, data-saver connections only on first interaction.
// - Scenario ⑪ covers the boot-analysis A/B switch in 'manual' mode.
// - Scenario ⑫ covers cloud-sync Option A (explicit Push/Pull + conflict
//   prompt) against an in-memory mock of the documented
//   `window.__yomikikuanCloudBridge` contract. The app ships NO Firebase
//   SDK — the mock is the reference adapter for a future real one.

const PORT = process.env.YK_E2E_PORT || '8002';
const BASE = `http://localhost:${PORT}`;

// ⑨/⑩ support: emulate a data-saver connection. Chromium exposes
// navigator.connection read-only, so define it before any page script runs.
const DATA_SAVER_INIT = `(() => {
  try {
    const conn = { saveData: true, effectiveType: '4g' };
    Object.defineProperty(navigator, 'connection', { get: () => conn, configurable: true });
  } catch (e) {}
})();`;


// Resolve `playwright` via CommonJS require so the NODE_PATH env (set by
// scripts/e2e.sh) takes effect. Node ESM ignores NODE_PATH, hence the
// createRequire bridge — same trick scripts/test.sh uses via inline CJS.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

// ⑪ support: force the boot-analysis A/B switch into 'manual' mode.
const BOOT_MANUAL_INIT = `(() => {
  try { localStorage.setItem('yomikikuan_boot_analysis', 'manual'); } catch (e) {}
})();`;

// ⑫ support: in-memory mock of the documented cloud bridge contract.
//   window.__yomikikuanCloudBridge = { get(): {payload, updatedAt}|null; set(payload, updatedAt) }
// The mock state is exposed so the scenario can simulate a changed cloud copy
// (conflict branch) without any network / Firebase SDK.
const CLOUD_SYNC_MOCK_INIT = `(() => {
  try { localStorage.setItem('lang', 'ja'); } catch (e) {}
  window.__yomikikuanCloudMockState = { payload: null, updatedAt: 0 };
  window.__yomikikuanCloudBridge = {
    async get() {
      const state = window.__yomikikuanCloudMockState;
      return state.payload ? { payload: state.payload, updatedAt: state.updatedAt } : null;
    },
    async set(payload, updatedAt) {
      const state = window.__yomikikuanCloudMockState;
      state.payload = payload;
      state.updatedAt = updatedAt;
    },
  };
})();`;

const TESTS = [
  { name: '①  app boots — title + #textInput + 4 panel buttons present',          fn: bootSmoke },
  { name: '②  analyze → vocab — addVocab via window hook renders in vocabPanel', fn: analyzeToVocab },
  { name: '③  backup roundtrip — docs + vocab survive export → clear → import', fn: backupRoundtrip },
  { name: '④  YouTube panel opens with 3 tabs (A 字幕导入 / B 伴读 / C 听力题)', fn: youtubePanelOpens },
  { name: '⑤  desktop 1440×900 — AI rail (5 btns) + fixed dock + paper bg, 0 console errors', fn: desktopRedesign, viewport: { width: 1440, height: 900 } },
  { name: '⑥  mobile 390×844 — AI rail bottom strip, dock above it, rail click opens panel', fn: mobileRedesign, viewport: { width: 390, height: 844 } },
  { name: '⑦  backup v2 import — docs/settings restored, SRS section silently skipped', fn: backupV2Compatibility },
  { name: '⑧  login.html smoke — HTTP 200 + login card, no fatal pageerror',    fn: loginPageSmoke },
  { name: '⑨  lazy EasyMDE — mounts after boot, typing syncs, blur analyzes',    fn: markdownEditorLazyMount, viewport: { width: 1440, height: 900 } },
  { name: '⑩  data-saver — EasyMDE stays unloaded until first interaction',      fn: markdownEditorDataSaver, viewport: { width: 1440, height: 900 }, init: DATA_SAVER_INIT },
  { name: '⑪  boot-analysis switch — manual mode waits for the Analyze button',  fn: bootAnalysisManual, init: BOOT_MANUAL_INIT },
  { name: '⑫  cloud sync Option A — mock bridge: push, pull, conflict prompt, missing bridge', fn: cloudSyncOptionA, init: CLOUD_SYNC_MOCK_INIT },
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
  if (opts.init) await ctx.addInitScript(opts.init);
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

// ⑨ EasyMDE is lazy-loaded: after boot it should mount (normal connection),
// the shimmed textarea value must reflect CodeMirror edits, and blurring the
// editor must still run the analysis path that reads textInput.value.
async function markdownEditorLazyMount(page, errors) {
  await page.goto(`${BASE}/index.html`);
  await waitForBoot(page);

  const mounted = await page.waitForFunction(
    () => !!window._markdownEditor && !!document.querySelector('.CodeMirror'),
    { timeout: 12000 },
  ).then(() => true).catch(() => false);
  assert(mounted, 'EasyMDE did not lazy-mount within 12s on a normal connection');

  const toolbar = await page.locator('.editor-toolbar').count();
  assert(toolbar >= 1, `EasyMDE toolbar missing after mount (count=${toolbar})`);

  await page.click('.CodeMirror');
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nE2E 編集テストの一文です。');
  const value = await page.evaluate(() => document.getElementById('textInput').value);
  assert(value.includes('E2E 編集テスト'), 'shimmed textInput.value did not reflect CodeMirror typing');

  // Blur the editor (EasyMDE emits codemirror blur) and wait for analysis.
  await page.evaluate(() => {
    const cm = document.querySelector('.CodeMirror');
    if (cm) cm.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    const header = document.querySelector('.main-header');
    if (header) header.click();
  });
  const analyzed = await page.waitForFunction(() => {
    const content = document.getElementById('content');
    return content && (content.querySelectorAll('.line-container').length > 0
      || content.querySelectorAll('.token-pill').length > 0);
  }, { timeout: 15000 }).then(() => true).catch(() => false);
  assert(analyzed, 'analysis did not render after editing/blurring the lazy-mounted editor');
  assert(errors.length === 0, `lazy editor emitted console/page errors: ${errors[0]}`);
}

// ⑩ Data-saver users opt out of the automatic 345 KB editor bundle: it must
// not be requested until they interact with the textarea, then mount promptly.
async function markdownEditorDataSaver(page, errors) {
  await page.goto(`${BASE}/index.html`);
  await waitForBoot(page);
  await page.waitForTimeout(2800); // past the idle/timeout load window

  const before = await page.evaluate(() => ({
    mounted: !!window._markdownEditor,
    script: !!document.querySelector('script[src*="easymde"]'),
    css: !!document.querySelector('link[href*="easymde"]'),
    textareaVisible: (() => {
      const el = document.getElementById('textInput');
      return !!el && getComputedStyle(el).display !== 'none';
    })(),
  }));
  assert(!before.mounted, 'EasyMDE auto-mounted on a data-saver connection');
  assert(!before.script && !before.css, 'EasyMDE assets were fetched on a data-saver connection');
  assert(before.textareaVisible, 'plain textarea is not usable before the editor mounts');

  await page.click('#textInput');
  const mounted = await page.waitForFunction(
    () => !!window._markdownEditor && !!document.querySelector('.CodeMirror'),
    { timeout: 12000 },
  ).then(() => true).catch(() => false);
  assert(mounted, 'EasyMDE did not mount after the first data-saver interaction');
  assert(errors.length === 0, `data-saver editor emitted console/page errors: ${errors[0]}`);
}

// ⑪ Boot-analysis A/B switch: 'manual' must not auto-analyze; it shows a
// prompt whose button runs the same analyzeText() path.
async function bootAnalysisManual(page, errors) {
  await page.goto(`${BASE}/index.html`);
  await waitForBoot(page);

  await page.waitForSelector('.boot-analysis-prompt', { timeout: 8000 });
  const pre = await page.evaluate(() => ({
    tokens: document.querySelectorAll('#content .token-pill').length,
    hasBtn: !!document.getElementById('bootAnalysisRunBtn'),
    hint: (document.querySelector('.boot-analysis-prompt p') || {}).textContent || '',
  }));
  assert(pre.tokens === 0, `manual mode auto-analyzed (${pre.tokens} token pills rendered)`);
  assert(pre.hasBtn, 'manual-mode prompt is missing #bootAnalysisRunBtn');
  assert(pre.hint.trim().length > 0, 'manual-mode prompt hint is empty');

  await page.click('#bootAnalysisRunBtn');
  const rendered = await page.waitForFunction(
    () => document.querySelectorAll('#content .line-container').length > 0,
    { timeout: 20000 },
  ).then(() => true).catch(() => false);
  assert(rendered, 'analysis did not run after clicking the manual-mode Analyze button');
  assert(errors.length === 0, `manual boot-analysis emitted console/page errors: ${errors[0]}`);
}

// ⑫ Cloud sync Option A — explicit Push / Pull against the in-memory mock
// bridge installed by CLOUD_SYNC_MOCK_INIT. Covers:
//   1. push  → local backup v3 payload reaches bridge.set, meta recorded
//   2. pull  → cloud payload applied through applyBackup, meta recorded
//   3. conflict → window.confirm; accept = local wins (push overwrites cloud)
//      (Playwright dialog API)
//   4. conflict → dismiss = cancel = pull the cloud copy instead
//   5. missing bridge → graceful error toast, no pageerror, state untouched
//   6. legacy #syncDataBtn delegates to the new push entry point while the
//      old (dead) window.performDataSync Firestore path is left intact.
async function cloudSyncOptionA(page, errors) {
  await page.goto(`${BASE}/index.html`);
  await waitForBoot(page);

  // The user menu is the guest-profile UI seeded by index.html; initUserProfile
  // wires the buttons even without Firebase. #showSuccessToast is assigned at
  // the end of that wiring function, so it doubles as a "wired" signal.
  await page.waitForFunction(
    () => !!document.getElementById('cloudPushBtn')
       && !!document.getElementById('cloudPullBtn')
       && typeof window.showSuccessToast === 'function',
    { timeout: 8000 },
  );

  const getText = (key) => page.evaluate((k) => window.YomikikuanGetText(k), key);
  const toastText = (selector) => page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent : '';
  }, selector);
  const waitForToast = (selector, expected, timeout = 6000) => page.waitForFunction(
    ({ sel, msg }) => {
      const el = document.querySelector(sel);
      return !!el && el.textContent === msg;
    },
    { sel: selector, msg: expected },
    { timeout },
  );

  // ---- 1. Push: local documents → mock cloud ----
  await page.evaluate(() => {
    const dm = window.documentManager;
    const docs = dm.getAllDocuments();
    docs.push({
      id: 'e2e-cloud-local',
      title: 'Cloud sync local doc',
      content: 'クラウド同期のローカル文書。',
      createdAt: 1000,
      updatedAt: 1000,
      locked: false,
      folder: null,
      folderId: null,
      favorite: false,
    });
    dm.saveAllDocuments(docs);
    dm.setActiveId('e2e-cloud-local');
  });

  const pushOkText = await getText('cloudSyncPushSuccess');
  await page.evaluate(() => document.getElementById('cloudPushBtn').click());
  await page.waitForFunction(() => {
    const state = window.__yomikikuanCloudMockState;
    const meta = JSON.parse(localStorage.getItem('yomikikuan_cloud_sync_meta') || 'null');
    return !!state.payload && !!meta && meta.lastSyncedAt === state.updatedAt;
  }, { timeout: 8000 });
  await waitForToast('#syncProgressText', pushOkText);

  const pushed = await page.evaluate(() => {
    const state = window.__yomikikuanCloudMockState;
    const meta = JSON.parse(localStorage.getItem('yomikikuan_cloud_sync_meta') || 'null');
    return {
      version: state.payload.version,
      app: state.payload.app,
      hasLocalDoc: state.payload.data.documents.some((d) => d.id === 'e2e-cloud-local'),
      updatedAt: state.updatedAt,
      meta: meta && meta.lastSyncedAt,
    };
  });
  assert(pushed.version === 3, `push wrote schema v${pushed.version}, expected v3`);
  assert(pushed.app === 'YomiKiku-an', `push payload app="${pushed.app}"`);
  assert(pushed.hasLocalDoc, 'push payload is missing the local document');
  assert(pushed.updatedAt > 0, `bridge.set received updatedAt=${pushed.updatedAt}`);
  assert(pushed.meta === pushed.updatedAt,
    `meta.lastSyncedAt (${pushed.meta}) != bridge updatedAt (${pushed.updatedAt})`);

  // ---- 2. Pull: mock cloud → local documents ----
  const pullOkText = await getText('cloudSyncPullSuccess');
  await page.evaluate(() => {
    const state = window.__yomikikuanCloudMockState;
    const base = JSON.parse(JSON.stringify(state.payload));
    base.data.documents = [{
      id: 'e2e-cloud-pull',
      title: 'Cloud pull doc',
      content: 'クラウドから復元した文書。',
      createdAt: 2000,
      updatedAt: 2000,
      locked: false,
      folder: null,
      folderId: null,
      favorite: false,
    }];
    base.data.activeId = 'e2e-cloud-pull';
    base.data.settings = {};
    base.data.srs = { vocab: [], mistakes: [] };
    state.payload = base;
    // Cloud-only change since the push → no conflict (local docs are older).
    state.updatedAt += 1;
  });
  await page.evaluate(() => document.getElementById('cloudPullBtn').click());
  await page.waitForFunction(() => {
    const docs = JSON.parse(localStorage.getItem('texts') || '[]');
    return docs.some((d) => d.id === 'e2e-cloud-pull');
  }, { timeout: 8000 });
  await waitForToast('#syncProgressText', pullOkText);

  const pulled = await page.evaluate(() => {
    const state = window.__yomikikuanCloudMockState;
    const meta = JSON.parse(localStorage.getItem('yomikikuan_cloud_sync_meta') || 'null');
    const docs = window.documentManager.getAllDocuments();
    return {
      hasPullDoc: docs.some((d) => d.id === 'e2e-cloud-pull'),
      activeId: localStorage.getItem('activeId'),
      meta: meta && meta.lastSyncedAt,
      cloudUpdatedAt: state.updatedAt,
    };
  });
  assert(pulled.hasPullDoc, 'pull did not apply the cloud payload to documentManager');
  assert(pulled.activeId === 'e2e-cloud-pull',
    `pull activeId="${pulled.activeId}", expected "e2e-cloud-pull"`);
  assert(pulled.meta === pulled.cloudUpdatedAt,
    `pull meta.lastSyncedAt (${pulled.meta}) != cloud.updatedAt (${pulled.cloudUpdatedAt})`);

  // Helper: make BOTH sides change since lastSyncedAt (→ conflict prompt).
  const setupConflict = () => page.evaluate(() => {
    const state = window.__yomikikuanCloudMockState;
    const meta = JSON.parse(localStorage.getItem('yomikikuan_cloud_sync_meta'));
    const dm = window.documentManager;
    const docs = dm.getAllDocuments();
    docs.forEach((d) => { d.updatedAt = meta.lastSyncedAt + 2000; });
    dm.saveAllDocuments(docs);
    const base = JSON.parse(JSON.stringify(state.payload));
    base.data.documents = [{
      id: 'e2e-cloud-conflict',
      title: 'Conflicting cloud doc',
      content: '雲側の衝突文書。',
      createdAt: 3000,
      updatedAt: meta.lastSyncedAt + 5000,
      locked: false,
      folder: null,
      folderId: null,
      favorite: false,
    }];
    base.data.activeId = 'e2e-cloud-conflict';
    state.payload = base;
    state.updatedAt = meta.lastSyncedAt + 3000;
    return { baseline: meta.lastSyncedAt };
  });

  // ---- 3. Conflict → confirm = local wins (push overwrites the cloud) ----
  const pushConflictText = await getText('cloudSyncPushConflictConfirm');
  const conflict1 = await setupConflict();
  let dialogMessage1 = null;
  page.once('dialog', async (dialog) => {
    dialogMessage1 = dialog.message();
    await dialog.accept();
  });
  await page.evaluate(() => document.getElementById('cloudPushBtn').click());
  await page.waitForFunction(() => {
    const state = window.__yomikikuanCloudMockState;
    const payload = state.payload;
    return !!payload
      && payload.data.documents.some((d) => d.id === 'e2e-cloud-pull')
      && !payload.data.documents.some((d) => d.id === 'e2e-cloud-conflict');
  }, { timeout: 8000 });

  const afterConflict1 = await page.evaluate(() => {
    const state = window.__yomikikuanCloudMockState;
    const meta = JSON.parse(localStorage.getItem('yomikikuan_cloud_sync_meta'));
    const docs = JSON.parse(localStorage.getItem('texts') || '[]');
    return {
      meta: meta.lastSyncedAt,
      mockUpdatedAt: state.updatedAt,
      localDocs: docs.map((d) => d.id),
    };
  });
  assert(dialogMessage1 === pushConflictText,
    `push-conflict prompt mismatch: "${dialogMessage1}" vs "${pushConflictText}"`);
  assert(afterConflict1.meta === afterConflict1.mockUpdatedAt
    && afterConflict1.meta !== conflict1.baseline,
    `push-conflict accept did not record a new sync time (meta=${afterConflict1.meta})`);
  assert(afterConflict1.localDocs.includes('e2e-cloud-pull'),
    `push-conflict accept disturbed local docs: ${JSON.stringify(afterConflict1.localDocs)}`);

  // ---- 4. Conflict → dismiss = cancel = pull the cloud copy ----
  const conflict2 = await setupConflict();
  let dialogMessage2 = null;
  page.once('dialog', async (dialog) => {
    dialogMessage2 = dialog.message();
    await dialog.dismiss();
  });
  await page.evaluate(() => document.getElementById('cloudPushBtn').click());
  await page.waitForFunction(() => {
    const docs = JSON.parse(localStorage.getItem('texts') || '[]');
    return docs.some((d) => d.id === 'e2e-cloud-conflict');
  }, { timeout: 8000 });

  const afterConflict2 = await page.evaluate(() => {
    const state = window.__yomikikuanCloudMockState;
    const meta = JSON.parse(localStorage.getItem('yomikikuan_cloud_sync_meta'));
    const docs = JSON.parse(localStorage.getItem('texts') || '[]');
    return {
      meta: meta.lastSyncedAt,
      mockUpdatedAt: state.updatedAt,
      cloudDocStill: state.payload.data.documents.some((d) => d.id === 'e2e-cloud-conflict'),
      localPulled: docs.some((d) => d.id === 'e2e-cloud-conflict'),
    };
  });
  assert(dialogMessage2 === pushConflictText,
    `push-conflict dismiss prompt mismatch: "${dialogMessage2}"`);
  assert(afterConflict2.cloudDocStill,
    'cancel path overwrote the cloud copy — it must pull from the cloud instead');
  assert(afterConflict2.meta === afterConflict2.mockUpdatedAt
    && afterConflict2.meta !== conflict2.baseline,
    `push-conflict cancel did not record the pulled sync time (meta=${afterConflict2.meta})`);
  assert(afterConflict2.localPulled, 'cancel path did not restore the cloud copy locally');

  // ---- 5. Missing bridge → graceful toast, no throw, state untouched ----
  const beforeMissing = await page.evaluate(() => ({
    meta: localStorage.getItem('yomikikuan_cloud_sync_meta'),
    docs: localStorage.getItem('texts'),
  }));
  await page.evaluate(() => { delete window.__yomikikuanCloudBridge; });
  const notConfiguredText = await getText('cloudSyncNotConfigured');

  await page.evaluate(() => document.getElementById('cloudPullBtn').click());
  await waitForToast('#errorText', notConfiguredText);
  await page.evaluate(() => document.getElementById('cloudPushBtn').click());
  await page.waitForTimeout(200);
  await waitForToast('#errorText', notConfiguredText);

  const afterMissing = await page.evaluate(() => ({
    bridge: typeof window.__yomikikuanCloudBridge,
    meta: localStorage.getItem('yomikikuan_cloud_sync_meta'),
    docs: localStorage.getItem('texts'),
    pushDisabled: document.getElementById('cloudPushBtn').disabled,
    pullDisabled: document.getElementById('cloudPullBtn').disabled,
  }));
  assert(afterMissing.bridge === 'undefined',
    `mock bridge was not removed (typeof = "${afterMissing.bridge}")`);
  assert(afterMissing.meta === beforeMissing.meta,
    'missing-bridge push/pull modified the sync meta');
  assert(afterMissing.docs === beforeMissing.docs,
    'missing-bridge push/pull modified the documents');
  assert(!afterMissing.pushDisabled && !afterMissing.pullDisabled,
    'cloud buttons stayed disabled after the graceful failure');

  // ---- 6. Legacy #syncDataBtn delegates to push; Firestore path retained ----
  await page.evaluate(() => {
    window.__yomikikuanCloudBridge = {
      async get() {
        const state = window.__yomikikuanCloudMockState;
        return state.payload ? { payload: state.payload, updatedAt: state.updatedAt } : null;
      },
      async set(payload, updatedAt) {
        const state = window.__yomikikuanCloudMockState;
        state.payload = payload;
        state.updatedAt = updatedAt;
      },
    };
    // A fresh local doc proves the legacy button really ran the push path
    // (the dismiss branch above left the mock cloud copy unchanged).
    const dm = window.documentManager;
    const docs = dm.getAllDocuments();
    docs.push({
      id: 'e2e-cloud-legacy',
      title: 'Legacy sync button doc',
      content: '旧同期ボタンのテスト。',
      createdAt: 4000,
      updatedAt: 4000,
      locked: false,
      folder: null,
      folderId: null,
      favorite: false,
    });
    dm.saveAllDocuments(docs);
  });
  const beforeLegacy = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('yomikikuan_cloud_sync_meta')).lastSyncedAt);
  await page.evaluate(() => document.getElementById('syncDataBtn').click());
  await page.waitForFunction(() => {
    const state = window.__yomikikuanCloudMockState;
    const meta = JSON.parse(localStorage.getItem('yomikikuan_cloud_sync_meta') || 'null');
    return !!meta
      && meta.lastSyncedAt === state.updatedAt
      && !!state.payload
      && state.payload.data.documents.some((d) => d.id === 'e2e-cloud-legacy');
  }, { timeout: 8000 });

  const legacy = await page.evaluate(() => ({
    meta: JSON.parse(localStorage.getItem('yomikikuan_cloud_sync_meta')).lastSyncedAt,
    mockUpdatedAt: window.__yomikikuanCloudMockState.updatedAt,
    hasLegacyDoc: window.__yomikikuanCloudMockState.payload.data.documents
      .some((d) => d.id === 'e2e-cloud-legacy'),
    performDataSync: typeof window.performDataSync,
  }));
  assert(legacy.meta === legacy.mockUpdatedAt && legacy.meta !== beforeLegacy,
    '#syncDataBtn did not delegate to the cloud-sync push entry point');
  assert(legacy.hasLegacyDoc,
    '#syncDataBtn push did not write the local backup payload to the bridge');
  assert(legacy.performDataSync === 'function',
    'the old (dead) window.performDataSync Firestore path must be retained this round');

  const fatal = errors.filter((entry) => entry.startsWith('pageerror:'));
  assert(fatal.length === 0, `cloud sync emitted page errors: ${fatal[0]}`);
}

// --- harness ---

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAIL — ${msg}`);
}

(async () => {
  const browser = await chromium.launch();
  let passed = 0, failed = 0;

  for (const t of TESTS) {
    let lastErr = null;
    let lastErrors = [];
    let ms = 0;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { ctx, page, errors } = await newPage(browser, { viewport: t.viewport, init: t.init });
      const start = Date.now();
      try {
        await t.fn(page, errors);
        lastErr = null;
        ms = Date.now() - start;
        await ctx.close();
        break;
      } catch (e) {
        lastErr = e;
        lastErrors = errors;
        ms = Date.now() - start;
        await ctx.close();
        // Python's http.server occasionally drops a connection under load;
        // retry once before treating the scenario as a real failure.
        if (attempt === 1) {
          console.log(`↻  ${t.name}  (retry after: ${e.message})`);
          await new Promise((r) => setTimeout(r, 250));
        }
      }
    }
    if (!lastErr) {
      console.log(`✓  ${t.name}  (${ms}ms)`);
      passed++;
    } else {
      console.log(`✗  ${t.name}  (${ms}ms)`);
      console.log(`     ${lastErr.message}`);
      if (lastErrors.length) console.log(`     first console/page error: ${lastErrors[0]}`);
      failed++;
    }
  }
  await browser.close();
  console.log('---');
  console.log(`TOTAL: ${passed}/${TESTS.length} scenarios`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
