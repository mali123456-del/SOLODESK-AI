# SOLODESK AI — Progressive Web App (PWA) Architecture

## Manifest & Icons (`vite.config.ts`, `public/`)
- **Plugin:** `vite-plugin-pwa` `2.0.0` (`generateSW`, `registerType: 'autoUpdate'`).
- **Manifest (`dist/manifest.webmanifest`):** Name `SOLODESK AI`, `display: 'standalone'`, `start_url: '/'`, `theme_color: '#101827'`, `background_color: '#101827'`.
- **Icons:** `/pwa-192x192.png`, `/pwa-512x512.png`, `/pwa-maskable-512x512.png` (`maskable`), `/apple-touch-icon.png`, `/icon.svg`.

## Service Worker & Offline Strategy (`dist/sw.js`)
- **Precache:** 59 static build assets (`js`, `css`, `html`, `png`, `svg`, `woff`, `woff2`, ~2.73 MB total) cached for immediate offline app shell boot.
- **Runtime Font Caching:** Google Fonts stylesheets and font files (`fonts.googleapis.com`, `fonts.gstatic.com`) use `CacheFirst` with 365-day expiration.
- **User Data Separation:** Application records remain inside IndexedDB (`solodesk_ai_workspace`)—never inside Cache Storage—so `Clear SW Cache` or app updates never touch user workspace data.

## Installability (`src/pwa/installPrompt.ts`)
- Captures `beforeinstallprompt` cleanly for an in-app **Install App** button on Chromium browsers and provides Safari iOS guidance when applicable.
- **CSP Compatibility:** `worker-src 'self'` allows Service Worker registration from same-origin `/sw.js`.
