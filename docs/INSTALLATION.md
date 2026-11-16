# Installation & Deployment Guide

## Local Development (Node.js 20+)
```bash
npm install
npm run dev
```
The app runs at `http://localhost:3000`.

## Static Production Build (Zero Backend Required)
```bash
npm run build
```
Deploy the contents of `/dist` to any static host (GitHub Pages, Cloudflare Pages, Netlify, Vercel static export, or local nginx/caddy) over HTTPS so Service Worker registration and Web Crypto operate properly.

## Installing as a PWA
- **Desktop Chrome / Edge:** Click the **Install App** button in the SOLODESK AI top header (or use the browser address bar install icon).
- **iPhone / iPad Safari:** Tap **Install on iOS** in the top header or **Share -> Add to Home Screen**.

## Manual GitHub Repository Sync
If syncing your local workspace to `https://github.com/mali123456-del/SOLODESK-AI`:
```bash
git status
git add .
git commit -m "Build SOLODESK AI local-first workspace"
git push origin main
```
