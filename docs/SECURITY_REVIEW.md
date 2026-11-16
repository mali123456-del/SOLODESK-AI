# SOLODESK AI — Security Review

**Review Date:** 2026-11-16  
**Scope:** Client storage, BYOK API keys, encryption, CSV/file/URL ingestion, XSS/prompt-injection defenses, and Content Security Policy.

## Controls Verified
1. **No Bundled Secrets or Stored API Keys:** Zero API keys exist in source, `.env*`, `localStorage`, `sessionStorage`, IndexedDB, or JSON backups. Optional Gemini BYOK keys live solely in volatile module memory (`src/ai/providers/providerFactory.ts`).
2. **Content Security Policy (`index.html`):**
   `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https:; worker-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'`
   - **Trade-off note:** `'unsafe-inline'` in `style-src` is retained so Tailwind CSS utility/custom styles, Recharts inline SVG styles, and dynamic theme styling function without runtime breakage; `script-src 'self'` strictly disallows inline scripts and `eval`.
   - `connect-src 'self' https:` permits Gemini API (`generativelanguage.googleapis.com`), Workbox Google Fonts caching, and the HTTPS public URL importer while blocking insecure `http:` connections when served over HTTPS.
3. **XSS & Injection Hygiene:** React JSX escapes interpolated strings cleanly; no `dangerouslySetInnerHTML` or `eval()` is used on user data; HTML imports strip executable tags (`script`, `iframe`, `svg`, `object`, `embed`) before plain-text extraction.
4. **Backup Cryptography (`src/services/backupService.ts`):** `PBKDF2-SHA256` with **210,000** iterations (supporting decryption of older v1 `100k`/`150k` archives via stored metadata), 16-byte random salt validation, 12-byte random IV validation, and `AES-GCM-256` authenticated encryption.
5. **NPM Audit Status:** Not available in-container via `npm audit --omit=dev` because workspace lockfile is `bun.lock` (`ENOLOCK`). Recommend running `bun pm audit` or generating a `package-lock.json` on the release workstation prior to tagging.
