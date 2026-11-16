# Known Limitations (Local-First MVP)

- **Single-Browser Storage:** Because SOLODESK AI runs without a backend server, IndexedDB records do not automatically sync across devices. Use **Backup & Restore** JSON exports to move workspaces manually.
- **Browser Eviction Risk:** Incognito/private sessions or manual site-data clearing deletes IndexedDB data. Always keep external JSON backups.
- **Multi-Currency Aggregation:** Invoices store their own currency code; aggregate dashboard totals do not perform live FX conversions.
- **Browser-Side BYOK AI:** Session Gemini API keys clear whenever a browser tab closes or refreshes; do not enter API keys on shared public devices.
- **Knowledge Hub File Types:** Local document ingestion supports `.txt`, `.md`, `.markdown`, `.json`, and `.csv` up to 2 MB (binary `.pdf`/`.docx` parsing is not bundled to keep client bundle weight low).
- **Non-Advisory Outputs:** Financial reports and contract templates are convenience tools—not certified accounting, tax advice, or legal counsel.
