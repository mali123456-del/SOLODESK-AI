# SOLODESK AI

**Your Work. Your Clients. All in One Place.**

SOLODESK AI is a local-first, offline-capable Freelancer Business Management Workspace and Progressive Web App (PWA) designed for independent developers, designers, writers, consultants, and solo agencies.

---

## Core Capabilities

- **Dashboard & Activity:** Live revenue, expenses, pending receivables, upcoming deadlines, cashflow charts, recent activity feed, and notifications.
- **Client CRM:** Create, edit, search, tag, and archive clients with duplicate detection and CSV import/export.
- **Projects & Tasks:** Manage project scope, budgets, milestones, progress, and track work across List and Kanban task views with subtasks and overdue indicators.
- **Business Document Studio:** Create **Proposals**, **Quotations** (with atomic one-click conversion to Invoice), **Contracts** (editable templates with non-legal-advice notice), and **Invoices** (unique numbering, decimal-safe pricing via `big.js`, discounts, optional inclusive/exclusive taxes, print preview, and client-side PDF export via `jsPDF`).
- **Payments, Finance & Time Tracking:** Record manual and partial payments, track income and expenses by category, review project profitability, log time manually, or run a persistent timer recovered from IndexedDB across reloads.
- **Knowledge Hub & Optional AI Copilot:** Index `.txt`, `.md`, `.json`, `.csv`, and notes locally for offline search and citation-backed drafting. Works 100% offline with deterministic draft templates, or optionally connect a session-only BYOK **Gemini 4 Hydrogen** (`gemini-4-hydrogen`) key held strictly in JS memory.
- **Portable Encrypted Backups:** Export full versioned JSON backups, preview conflicts on restore, inspect pre-restore safety snapshots, and optionally encrypt backups using Web Crypto (`PBKDF2` + `AES-256-GCM`).
- **Installable PWA:** Ships a Web App Manifest, PNG icons (`192x192`, `512x512`, maskable `512x512`, and `apple-touch-icon.png`), Workbox service worker, and in-app install button.

---

## Tech Stack

- **UI:** React 19, TypeScript 7, Tailwind CSS 4, Lucide Icons, Recharts
- **Local Database & Validation:** Dexie (IndexedDB schema v2), Zod
- **Monetary Precision & Exports:** `big.js`, `jsPDF`, CSV UTF-8 generator
- **AI (Optional BYOK):** `@google/genai` targeting `gemini-4-hydrogen` (zero stored keys)
- **Build, PWA & Testing:** Vite 8, `vite-plugin-pwa`, Vitest, React Testing Library

---

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite development server on port 3000 |
| `npm run lint` | Run TypeScript typechecking (`tsc --noEmit`) |
| `npm test` | Run automated Vitest + React Testing Library test suite |
| `npm run build` | Build production static bundle and PWA assets into `dist/` |
| `npm run preview` | Preview built production bundle locally |

---

## Privacy & Security Summary

- **No Mandatory Backend:** Application records live locally inside your browser's IndexedDB.
- **Zero Persisted API Keys:** Gemini BYOK keys live only in volatile JavaScript memory and are never written to `localStorage`, `sessionStorage`, IndexedDB, backups, or logs.
- **Informational Estimates Disclaimer:** Financial summaries and tax figures are workspace estimates, not certified accounting. Contract templates are convenience drafts, not legal advice.

See `/docs/` for detailed guides (`USER_GUIDE.md`, `ARCHITECTURE.md`, `SECURITY_AND_PRIVACY.md`, `BACKUP_RESTORE.md`, `AI_GUIDE.md`, `INSTALLATION.md`, `KNOWN_LIMITATIONS.md`, `TESTING.md`, and more).
