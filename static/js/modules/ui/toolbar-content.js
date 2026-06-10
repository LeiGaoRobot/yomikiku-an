// Pure HTML template builder extracted from main-js.js (Phase-1).
//
// createToolbarContentHTML(context, t) renders the shared "voice + display"
// settings markup used by three surfaces:
//   - 'sidebar' -> element ids prefixed with `sidebar...` (capitalized first letter)
//   - 'modal'   -> no prefix (used inside the settings modal body)
//   - other     -> no prefix (legacy / fallback)
//
// `t(key)` is the i18n translation function — injected as a parameter so the
// module stays pure (no closure over main-js.js's `t`).

function makeIdFn(context) {
  const isSidebar = context === 'sidebar';
  return (base) => isSidebar
    ? `sidebar${base.charAt(0).toUpperCase()}${base.slice(1)}`
    : base;
}

export function createToolbarContentHTML(context, t) {
  const id = makeIdFn(context);

  return `
      <!-- 语音设置 -->
      <div class="settings-section">
        <div class="sidebar-title" id="${id('voiceSettingsTitle')}">${t('voiceTitle')}</div>
        <div class="voice-controls">
          <div class="control-group select-group">
            <label class="control-label" id="${id('voiceSelectLabel')}"><span class="label-text">${t('voiceSelectLabel')}</span></label>
            <select id="${id('voiceSelect')}">
              <option value="">${t('selectVoice')}</option>
            </select>
          </div>

          <div class="control-group full-width">
            <label class="control-label" id="${id('speedLabel')}"><span class="label-text">${t('speedLabel')}</span></label>
            <input type="range" id="${id('speedRange')}" min="0.25" max="4" step="0.05" value="1">
            <div class="speed-display" id="${id('speedValue')}">1.0x</div>
          </div>
        </div>
      </div>

      <!-- 显示设置 -->
      <div class="settings-section">
        <div class="sidebar-title" id="${id('displayTitle')}">${t('displayTitle')}</div>
        <div class="display-controls">
          <div class="control-group checkbox-group">
            <label class="control-label" id="${id('showKanaLabel')}">
              <input type="checkbox" id="${id('showKana')}" checked>
              <span class="label-text">${t('showKana')}</span>
            </label>
          </div>

          <div class="control-group select-group">
            <label class="control-label" id="${id('readingScriptLabel')}"><span class="label-text">${t('readingScript')}</span></label>
            <select id="${id('readingScriptSelect')}">
              <option id="${id('readingScriptOptionKatakana')}" value="katakana">${t('katakanaLabel')}</option>
              <option id="${id('readingScriptOptionHiragana')}" value="hiragana">${t('hiraganaLabel')}</option>
            </select>
          </div>

          <div class="control-group checkbox-group">
            <label class="control-label" id="${id('showRomajiLabel')}">
              <input type="checkbox" id="${id('showRomaji')}" checked>
              <span class="label-text">${t('showRomaji')}</span>
            </label>
          </div>

          <div class="control-group checkbox-group">
            <label class="control-label" id="${id('showPosLabel')}">
              <input type="checkbox" id="${id('showPos')}" checked>
              <span class="label-text">${t('showPos')}</span>
            </label>
          </div>

          <div class="control-group checkbox-group">
            <label class="control-label" id="${id('tokenAlignLeftLabel')}">
              <input type="checkbox" id="${id('tokenAlignLeft')}">
              <span class="label-text">${t('tokenAlignLeft')}</span>
            </label>
          </div>

          <div class="control-group checkbox-group">
            <label class="control-label" id="${id('showDetailsLabel')}">
              <input type="checkbox" id="${id('showDetails')}" checked>
              <span class="label-text">${t('showDetails')}</span>
            </label>
          </div>

          <div class="control-group checkbox-group">
            <label class="control-label" id="${id('showUnderlineLabel')}">
              <input type="checkbox" id="${id('showUnderline')}" checked>
              <span class="label-text">${t('showUnderline')}</span>
            </label>
          </div>

          <div class="control-group checkbox-group">
            <label class="control-label" id="${id('autoReadLabel')}">
              <input type="checkbox" id="${id('autoRead')}">
              <span class="label-text">${t('autoRead')}</span>
            </label>
          </div>

          <div class="control-group checkbox-group">
            <label class="control-label" id="${id('haAsWaLabel')}">
              <input type="checkbox" id="${id('haAsWa')}" checked>
              <span class="label-text">${t('haAsWaLabel')}</span>
            </label>
          </div>

          <div class="control-group checkbox-group">
            <label class="control-label" id="${id('repeatPlayLabel')}">
              <input type="checkbox" id="${id('repeatPlay')}">
              <span class="label-text">${t('repeatPlay')}</span>
            </label>
          </div>
          <div class="control-group full-width">
            <label class="control-label" id="${id('fontSizeLabel')}"><span class="label-text">${t('fontSizeLabel')}</span></label>
            <input type="range" id="${id('fontSizeRange')}" min="0.8" max="1.5" step="0.05" value="1">
            <div class="speed-display" id="${id('fontSizeValue')}">100%</div>
          </div>
        </div>
      </div>

    `;
}

if (typeof window !== 'undefined') {
  window.YomikikuanToolbarContent = { createToolbarContentHTML };
}
