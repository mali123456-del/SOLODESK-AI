# SOLODESK AI — Risk Register

| ID | Risk | Impact | Likelihood | Mitigation Strategy | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **R-01** | **Template Mismatch (XR Blocks vs. React PWA)** | High | Confirmed | Replace `src/index.ts`/`src/index.css` starter boilerplate in Phase 1; avoid importing XR/3D libs; prune unused XR dependencies after owner confirmation. | Mitigated in plan |
| **R-02** | **Browser Storage Loss (IndexedDB Eviction / Private Mode)** | Critical | Medium | Request `navigator.storage.persist()`; display storage health & backup reminder; warn users browser storage is not a backup; provide one-click JSON export. | Planned (Phase 2 & 8) |
| **R-03** | **Floating-Point Financial Drift** | Critical | High if naive | Use `big.js` + integer minor-unit rounding (`ROUND_HALF_UP`); snapshot totals & currency on saved invoices; write thorough decimal/tax/partial-payment unit tests. | Planned (Phase 2 & 5) |
| **R-04** | **Timezone / DST Date Shift Bugs** | High | Medium | Store calendar dates as `YYYY-MM-DD` strings and timestamps as UTC ISO strings; test DST transition edge cases. | Planned (Phase 2) |
| **R-05** | **Failed Backup Restore Corrupting Existing Data** | Critical | Medium | Strict Zod schema validation, preview diff, automatic safety backup before import, atomic Dexie transaction, rollback on failure. | Planned (Phase 8) |
| **R-06** | **Encrypted Backup Passphrase Forgotten** | High | Medium | Clearly warn users passphrases cannot be recovered; keep plain JSON as default; use standard Web Crypto PBKDF2 + AES-GCM. | Planned (Phase 8) |
| **R-07** | **Browser-Side BYOK Gemini Key Exposure** | High | Medium | Never persist key in IndexedDB/`localStorage`/backups/logs; keep in memory only; clear-key button; explicit DevTools/network security disclosure. | Planned (Phase 9) |
| **R-08** | **Gemini Hydrogen Quota / Availability Limits** | Medium | High | `GEMINI_API_KEY` not present in container; all core features work 100% without AI; `AIProvider` handles 400/403/429/timeouts cleanly; `MockProvider` enables full CI/unit testing. | Planned (Phase 9) |
| **R-09** | **Low-Spec Dev Machine Bottlenecks (i5-4200U / 8 GB RAM)** | Medium | High | Prune unused 3D/ML packages, lazy-load feature routes & `jspdf`/`recharts`, paginate tables, monitor Vite chunk sizes. | Planned (Phase 1+) |
| **R-10** | **iFrame / PWA Preview Restrictions** | Medium | Medium | Avoid `window.alert`/`window.open`; prefer `jsPDF.save` blob download with print fallback; verify SW behavior under `vite-plugin-pwa` in Phase 10. | Planned (Phase 5 & 10) |
| **R-11** | **Legal / Accounting Liability Claims** | Medium | Low | Include explicit informational/non-certified disclaimers on Finance Tracker, Reports, and Contract Templates; never claim legal/tax compliance. | Planned (Phase 5 & 6) |
| **R-12** | **TypeScript 7.0 / Vite 8 Plugin Edge Cases** | Medium | Medium | Checked npm peer dependencies: `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-plugin-pwa`, `vitest` all declare Vite 8 support; validate with actual `tsc` + `vite build` at each phase. | Checked / Monitor |
