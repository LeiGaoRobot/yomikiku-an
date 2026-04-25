<!--
Thanks for the PR! Please tick the checklist below before requesting review.
Full conventions live in CONTRIBUTING.md and CLAUDE.md.
-->

## Summary

<!-- 1-3 sentences. What changed and why. -->

## Test plan

<!-- How did you verify this? Reference *.test.html pages or in-browser steps. -->

## Checklist

- [ ] `npm test` is green locally (or note expected failures + reason).
- [ ] Every new module has a sibling `*.test.html`.
- [ ] If a cached asset changed, `CACHE_VERSION` is bumped in `service-worker.js`.
- [ ] If a new module was added, it's listed in `static/pwa-assets.json`
      AND the runner in `scripts/test.sh`.
- [ ] No secrets / API keys / `.env` / `config.js` in the diff.
- [ ] If `main-js.js` or `tts.js` was touched, the "Playback pipeline
      boundary" section of `CLAUDE.md` was re-read.
