// Whole-document export — generates a self-contained HTML file with:
//   - article title / meta
//   - the currently-rendered reading content (ruby tokens, translations)
//   - inline CSS so the file renders nicely when opened in any browser
//
// The user can then print to PDF via browser, or share the .html file.
//
// This is different from modules/backup/index.js (full app JSON backup):
// single-document HTML export for sharing/archiving a single reading.

const EXPORT_STYLE = `
  body { max-width: 720px; margin: 40px auto; padding: 0 24px;
    font-family: -apple-system, "SF Pro Display", "Hiragino Mincho Pro", "Yu Mincho", serif;
    font-size: 16px; line-height: 1.9; color: #1d1d1f; background: #fff;
    letter-spacing: 0.012em; }
  h1 { font-size: 28px; font-weight: 600; letter-spacing: -0.018em; margin: 0 0 6px; }
  .meta { color: #86868b; font-size: 12px; margin-bottom: 24px;
    border-bottom: 1px solid rgba(0,0,0,.08); padding-bottom: 14px; }
  .line-container, .ruby-line { padding: 8px 0; }
  ruby rt { font-size: 0.52em; color: #6e6e73; font-weight: 400; }
  .token-pill { display: inline-block; padding: 2px 6px; margin: 2px;
    border-radius: 6px; background: rgba(0,0,0,.04); }
  .token-kanji { font-weight: 500; }
  .token-kana, .token-romaji { font-size: 0.7em; color: #86868b; margin-left: 2px; }
  .token-pos { display: none; }
  button, .analyze-line-btn, .play-line-btn, .play-token { display: none !important; }
  .bilingual-translation, .bilingual-line-zh {
    color: #0071e3; font-size: 14px; font-style: italic;
    margin-top: 4px; padding-left: 14px; border-left: 2px solid rgba(0,113,227,.3);
  }
  footer { margin-top: 48px; padding-top: 14px;
    border-top: 1px solid rgba(0,0,0,.08);
    font-size: 11px; color: #86868b; text-align: center; }
  @media print { body { margin: 0; padding: 0; } footer { display: none; } }
`;

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s || '').replace(/[<>&"]/g, (c) => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
}

function buildHtml(doc) {
  const src = document.getElementById('content');
  const bodyContent = src ? src.innerHTML : '<p><i>没有可导出的内容</i></p>';
  const title = escapeHtml(doc?.title || 'document');
  const date = fmtDate(new Date());
  const createdAt = doc?.createdAt ? new Date(doc.createdAt) : null;
  const createdStr = createdAt && !isNaN(createdAt.getTime()) ? fmtDate(createdAt) : '';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>${EXPORT_STYLE}</style>
</head>
<body>
<h1>${title}</h1>
<div class="meta">
  ${createdStr ? `作成: ${createdStr} · ` : ''}Exported from YomiKiku-an · ${date}
</div>
<main>
${bodyContent}
</main>
<footer>読み聞く庵 · YomiKiku-an · ${date}</footer>
</body>
</html>`;
}

export function exportDocAsHtml(doc) {
  if (!doc) {
    try {
      const dm = window.documentManager;
      const activeId = dm?.getActiveId?.();
      doc = dm?.getAllDocuments?.().find(d => d && d.id === activeId);
    } catch (_) {}
  }
  if (!doc) { alert('请先选择一个文档'); return; }

  const html = buildHtml(doc);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeTitle = (doc.title || 'document').replace(/[^\w一-龥぀-ヿ-]+/g, '_').slice(0, 60);
  a.href = url;
  a.download = `${safeTitle}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 200);
}

if (typeof window !== 'undefined') {
  window.__yomikikuanExportDocAsHtml = exportDocAsHtml;
}
