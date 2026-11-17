# SOLODESK AI — Modular Crawler & URL Importer Architecture

**Directory:** `src/integrations/crawler/`

## 1. Module Separation
1. `urlValidation.ts`: Exports public URL validation (`validatePublicHttpUrl`) and single-concurrency slot lock (`acquireCrawlerSlot()` enforcing `MAX_CONCURRENT_IMPORTS = 1`).
2. `robotsPolicy.ts`: Fetches `<origin>/robots.txt` (`3s` timeout, `robots` `Disallow`/`Allow` prefix matching) before fetching target content (`checkRobotsTxt`, `isPathAllowedByRobotsTxt`).
3. `htmlExtractor.ts`: Sanitizes HTML/XHTML (`stripHtmlToSafeText`), normalizes text (`normalizeDocumentContent`), extracts titles, classifies `sourceType` (`markdown`, `json`, `text`, `url`), and computes SHA-256 content hashes.
4. `urlImporter.ts`: Coordinates concurrency lock, robots check, `10s` `AbortController` fetch timeout, `credentials: 'omit'`, redirect destination validation, `512 KB` byte ceiling, MIME allowlist, duplicate detection against IndexedDB (`findKnowledgeDocByHash`), and preview return prior to explicit user approval.

## 2. Human-in-the-Loop Approval Flow
Fetched content is **never** auto-indexed into Knowledge Hub. Users inspect the sanitized title, final resolved URL, MIME type, byte size, `robots.txt` status, and duplicate SHA-256 warning before clicking **Approve & Save to Knowledge Hub**.
