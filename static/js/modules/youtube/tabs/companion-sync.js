// Pure helper: binary-searches the active segment by currentTime.
// Returns the segment index whose [start, end) interval contains t,
// or -1 if none. No DOM, no IO — safe to import at module scope.

export function findActiveIndex(segments, t) {
  if (!Array.isArray(segments) || !segments.length) return -1;
  if (typeof t !== 'number' || Number.isNaN(t)) return -1;
  let lo = 0, hi = segments.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = segments[mid];
    if (t < s.start)      hi = mid - 1;
    else if (t >= s.end)  lo = mid + 1;
    else                  return mid;
  }
  return -1;
}
