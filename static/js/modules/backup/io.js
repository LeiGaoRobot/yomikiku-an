// Backup I/O helpers — downloadTextFile + formatNowForFile.
// Extracted from main-js.js (both helpers were duplicated twice there).

// Triggers the browser download flow for a text blob. No direct file-system
// I/O — the browser handles the actual save based on user settings.
export function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch (_) {}
    URL.revokeObjectURL(url);
  }, 0);
}

// Filename-safe local-time stamp: YYYYMMDD-HHMMSS.
export function formatNowForFile() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
