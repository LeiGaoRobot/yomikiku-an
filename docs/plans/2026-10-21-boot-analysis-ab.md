# Boot-analysis A/B — measured results

Date: 2026-10-21 · Branch: master (`c1244a9` + this pass) · Script:
`scripts/bench-boot-analysis.mjs` (`npm run bench:boot`)

Protocol: headless Chromium 1440×900, service workers blocked, fresh context
per run, `python3 -m http.server` on localhost, 3 runs per mode, medians.
Localhost has no network latency — **compare modes against each other, not as
real-user latency**. Resource sizes are the network-independent part.

Mode is selected by writing `localStorage['yomikikuan_boot_analysis']` before
load (production users get it from `config.js → bootAnalysisMode`).

| Mode | FCP | DOMContentLoaded | load | Shell/analysis ready | Transfer @ ready | kuromoji dict files @ ready |
|---|---|---|---|---|---|---|
| `immediate` | 56 ms | 98 ms | 103 ms | 2037 ms | **19,183 KiB** | 24 |
| `idle` (default) | 52 ms | 90 ms | 94 ms | 1973 ms | **19,183 KiB** | 24 |
| `manual` | 56 ms | 86 ms | 91 ms | 106 ms (prompt) | **1,466 KiB** | 0 |

- `manual` → click "解析" → analysis ready: **1933 ms median** (same work, just
  deferred).
- No console/page errors in any run.

## Reading the numbers

1. **Where the bytes are.** `immediate` and `idle` both reach ~18.7 MiB by the
   time analysis renders. Most of it is the kuromoji dictionary (24 `.dat.gz`
   files) plus the JMdict chunk requested during dictionary initialisation.
   The earlier "2.9 MiB at 625 ms" figure measured a different point (first
   paint/pipeline start, before the dictionary finished loading).
2. **`idle` vs `immediate` is a wash on localhost.** FCP/DCL differ by a few
   ms; both finish analysis around 2.0 s because dictionary decode dominates.
   The idle scheduling still matters on slow GPUs/networks (first paint is no
   longer competing with the dictionary request), but localhost cannot
   demonstrate it — re-measure with CPU/network throttling for that.
3. **`manual` is the real first-load win.** 1.47 MiB vs 19.2 MiB at the prompt
   (**−92%**, 0 dictionary files), at the cost of an unsegmented reading pane
   until the user presses 解析. The deferred analysis cost (~1.9 s localhost)
   is unchanged — it is paid later instead of during boot.

## Decision

- Keep **`idle` as the default** (current behavior; no first-paint regression
  and the "instant demo" experience is preserved).
- Keep **data-saver/2G → skip auto-analysis** (already implemented), which now
  also covers the `manual`-like data saving for users who opted in.
- Expose **`manual` as the A/B cohort** via `config.js: bootAnalysisMode`
  (already wired). Suggested cohort split once real analytics exist: 90%
  `idle` / 10% `manual`, measuring time-to-first-analysis and bounce rate
  rather than transfer bytes alone.
- **Next measurement** (not done here): same script with Chrome DevTools
  network throttling (Fast 3G) + 4× CPU throttling; that is where `idle` vs
  `immediate` and the 19 MiB dictionary cost should show up clearly.

## Reproduce

```bash
npm install --no-save playwright   # if not already available
npm run bench:boot                 # 3 runs/mode, port 8040
# or: node scripts/bench-boot-analysis.mjs --runs=5 --port=8050
```
