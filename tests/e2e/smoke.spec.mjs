// E2E smoke specs — 4 happy paths covering the major user-visible
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

async function newPage(browser) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(INIT_SCRIPT);
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

// --- harness ---

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT FAIL — ${msg}`);
}

(async () => {
  const browser = await chromium.launch();
  let passed = 0, failed = 0;

  for (const t of TESTS) {
    const { ctx, page, errors } = await newPage(browser);
    const start = Date.now();
    try {
      await t.fn(page);
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
