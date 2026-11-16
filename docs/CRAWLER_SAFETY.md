# SOLODESK AI — Controlled URL Importer & Crawler Safety

SOLODESK AI does **not** perform automated crawling, recursive spidering, or background scraping.

## Safe Single-URL Knowledge Importer (`src/integrations/crawler/urlImporter.ts`)
Only triggered manually by the user inside **Knowledge Hub -> Import Public URL**:
1. **Scheme & Length Policy (`src/security/urlPolicy.ts`):** Accepts only `http:`/`https:` URLs up to 1,000 characters; blocks `javascript:`, `data:`, `file:`, and URLs embedding `username:password`.
2. **SSRF Host Blocking:** Rejects `localhost`, `*.local`, `*.internal`, IPv6 loopback/unique-local/link-local (`::1`, `fc00::/7`, `fe80::/10`), private IPv4 (`10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16` including cloud metadata `169.254.169.254`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` CGNAT), and numeric/hex-encoded obfuscated IPs.
3. **Post-Redirect Revalidation:** Validates `response.url` again after redirects against `validatePublicHttpUrl`.
4. **Robots Check:** Requests `/robots.txt` with 4s timeout and obeys `User-agent: *` `Disallow`/`Allow` prefix matching before fetching the page (`isPathAllowedByRobotsTxt`).
5. **Resource Caps & Privacy:** `credentials: 'omit'`, `cache: 'no-store'`, 10s request timeout, 512 KB response byte limit, and strict content-type allowlist (`text/plain`, `text/markdown`, `text/html`, `text/csv`, `application/json`, `application/xhtml+xml`).
6. **HTML Sanitization & User Approval Gate:** Strips `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<noscript>`, `<svg>`, and `<template>` (`stripHtmlToSafeText`), renders a text preview dialog, and writes to IndexedDB only after explicit user approval.
7. **Browser CORS Transparency:** Cross-origin sites without permissive CORS headers cannot be read from client JS; the UI catches this cleanly and instructs the user to save `.md`/`.txt` and upload locally.
