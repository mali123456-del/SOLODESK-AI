# SOLODESK AI — Crawler & URL Importer Security Controls

## Mandatory Protections Implemented
- **Scheme Restriction:** Rejects non-HTTP(S) schemes (`javascript:`, `file:`, `data:`, `ftp:`) and embedded URL credentials (`user:pass@`).
- **Private & Metadata Destination Blocking (`src/security/urlPolicy.ts`):** Rejects `localhost`, `*.local`, `*.internal`, IPv4 loopback (`127.0.0.0/8`), RFC 1918 private networks (`10/8`, `172.16/12`, `192.168/16`), link-local / cloud metadata (`169.254.169.254`), decimal integer IPv4 (`2130706433`), IPv6 loopback (`[::1]`), and IPv6 ULA (`fc00::/7`).
- **Post-Redirect Revalidation:** Inspects `response.url` after redirects and aborts with `Redirect destination rejected` if redirected onto an internal/private host.
- **Credential & Script Hygiene:** Sends `credentials: 'omit'` and `cache: 'no-store'`; strips `<script>`, `<iframe>`, `<svg>`, `<object>`, and `<embed>` elements via `stripHtmlToSafeText()` — zero imported code is ever executed.
- **Resource & Rate Bounding:** Single active request lock (`MAX_CONCURRENT_IMPORTS = 1`), `10,000 ms` timeout, and strict `512 KB` response ceiling checked on both `content-length` and decoded payload bytes.
- **Prompt Injection Defense:** Imported documents are marked as reference sources and wrapped inside `wrapUntrustedContextSnippet()` warning boundaries when passed into Copilot context.
