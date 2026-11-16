# Release Checklist

- [x] `npm run lint` (`tsc --noEmit`) passes with zero errors
- [x] `npm test` passes across all 10 test files (45/45 tests passing)
- [x] `npm run build` succeeds and emits `dist/sw.js` and `dist/manifest.webmanifest`
- [x] `npm run test:e2e` passes in headless Chromium against the built `dist/` preview server
- [x] Zero Gemini or secret API keys persisted in source, IndexedDB, localStorage, sessionStorage, or JSON backups
- [x] Strict `Content-Security-Policy` meta tag verified in `index.html` and built `dist/index.html` (`script-src 'self'`, `object-src 'none'`)
- [x] Desktop (`1280x800`) and mobile (`375x812`) layouts verified in Chromium with zero horizontal overflow or console/page errors
- [x] Offline fallback, service worker asset serving, and deterministic offline Copilot draft behavior verified without network calls
- [ ] Run `bun pm audit` or `npm i --package-lock-only && npm audit --omit=dev` prior to external deployment (`npm audit` returned `ENOLOCK` under `bun.lock`)

