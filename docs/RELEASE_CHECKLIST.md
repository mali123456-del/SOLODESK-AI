# Release Checklist

- [ ] `npm run lint` (`tsc --noEmit`) passes with zero errors
- [ ] `npm test` passes across all 9 test suites
- [ ] `npm run build` succeeds and emits `dist/sw.js` and `dist/manifest.webmanifest`
- [ ] Zero Gemini or secret API keys persisted in source, IndexedDB, localStorage, or JSON backups
- [ ] Desktop (1280px+) and mobile (375px) layouts verified without horizontal overflow or console errors
- [ ] Offline fallback / deterministic draft behavior verified without network calls
