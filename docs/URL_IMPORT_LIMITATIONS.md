# SOLODESK AI — Browser URL Importer Limitations

## Browser Execution Boundary (Honest Assessment)
SOLODESK AI operates as a 100% static client-side PWA with zero mandatory backend proxy server. Consequently, direct URL fetching from the Knowledge Hub runs via `window.fetch()` inside the user's browser and is subject to standard browser security limits:

1. **Cross-Origin Resource Sharing (CORS):** Websites that omit permissive `Access-Control-Allow-Origin` headers block browser-origin `fetch()` calls. The UI and `urlImporter.ts` catch this cleanly and instruct the user to save or copy the page as `.md`/`.txt` and use **Import Local File** (which works offline without CORS limits).
2. **DNS Rebinding / OS-Level Socket Inspection:** Browser `fetch()` does not expose raw resolved TCP peer IP addresses to JavaScript prior to connection; therefore, client-side URL policy prevents explicit private/metadata IPs, hostnames, integer IPs, and redirect URLs, while relying on the browser's own origin/network sandbox. Full server-side socket/DNS pinning would only apply if an optional server-side fetch adapter were added later.
3. **Authenticated / Paywalled Pages:** Intentionally unsupported (`credentials: 'omit'`). The importer only reads unauthenticated public text/Markdown/HTML/CSV/JSON resources permitted by `robots.txt`.
