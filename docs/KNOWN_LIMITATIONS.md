# Known Limitations (Local-First MVP)

- **Single-Browser Storage:** Because SOLODESK AI runs without a backend server, IndexedDB records do not automatically sync across devices. Use **Backup & Restore** JSON exports to move workspaces manually.
- **Browser Eviction Risk:** Incognito/private sessions or manual site-data clearing deletes IndexedDB data. Always keep external JSON backups.
- **Multi-Currency Aggregation:** Invoices store their own currency code; aggregate dashboard totals do not perform live FX conversions.
- **Browser-Side BYOK AI:** Session Gemini API keys clear whenever a browser tab closes or refreshes; do not enter API keys on shared public devices.
- **Knowledge Hub File & URL Limits:** Local file ingestion supports `.txt`, `.md`, `.markdown`, `.json`, and `.csv` up to 2 MB. Single-URL import runs client-side (`fetch`), so websites that do not return permissive `Access-Control-Allow-Origin` headers are blocked by browser CORS policy; save such pages locally as `.md`/`.txt` and upload.
- **CSP Style Allowance:** `style-src` permits `'unsafe-inline'` in `index.html` to support Recharts SVG inline attributes and dynamic styling while keeping `script-src 'self'` strict.
- **Dependency Audit Lockfile:** Workspace uses `bun.lock` rather than `package-lock.json`; `npm audit` requires generating a `package-lock.json` (`npm i --package-lock-only`) or using `bun pm audit`.
- **Non-Advisory Outputs:** Financial reports and contract templates are convenience tools—not certified accounting, tax advice, or legal counsel.
