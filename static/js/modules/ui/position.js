// Token-details panel positioning — extracted from main-js.js (Phase 1).
// Pure geometry: given the anchor element's bounding rect, the viewport
// dimensions, and the panel's intrinsic size, returns the top/left where
// the panel should be placed.
//
// Edge inset is 10px (matches the historical clamp). Vertical gap to the
// anchor is 8px above/below.

const EDGE_INSET = 10;
const ANCHOR_GAP = 8;
const PANEL_MAX_WIDTH = 320;

export function computeTokenDetailsPosition({ rect, viewport, panel }) {
  const r = rect || { top: 0, bottom: 0, left: 0 };
  const vw = (viewport && viewport.width) || 0;
  const vh = (viewport && viewport.height) || 0;
  const panelW = Math.min(
    (panel && panel.width) || 300, PANEL_MAX_WIDTH
  );
  const panelH = (panel && panel.height) || 220;

  // Vertical: prefer below if there's enough room, otherwise above
  const spaceBelow = vh - r.bottom - ANCHOR_GAP;
  const spaceAbove = r.top - ANCHOR_GAP;
  let top;
  if (spaceBelow >= panelH || spaceBelow >= spaceAbove) {
    top = r.bottom + ANCHOR_GAP;
  } else {
    top = r.top - panelH - ANCHOR_GAP;
  }

  // Horizontal: align to anchor's left, clamp to viewport with edge inset
  let left = r.left;
  if (left + panelW + EDGE_INSET > vw) {
    left = vw - panelW - EDGE_INSET;
  }
  if (left < EDGE_INSET) left = EDGE_INSET;

  // Final clamp (the historical impl re-clamps both axes after the choice)
  left = Math.max(EDGE_INSET, Math.min(left, vw - panelW - EDGE_INSET));
  top = Math.max(EDGE_INSET, Math.min(top, vh - EDGE_INSET));

  return { left, top };
}

if (typeof window !== 'undefined') {
  window.YomikikuanPosition = { computeTokenDetailsPosition };
}
