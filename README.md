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
- **Knowledge Hub & Optional AI Copilot:** Index `.txt`, `.md`, `.json`, `.csv`, manual notes, or user-approved single public URL previews (`src/integrations/crawler/urlImporter.ts`) with SHA-256 deduplication, collections, and offline RAG citations. Works 100% offline with deterministic draft templates, read-only workspace analytical tools, or optionally connects a session-only BYOK **Gemini 4 Hydrogen** (`gemini-4-hydrogen`) key held strictly in JS memory.
- **Approval-Gated Workflows:** Convert accepted Proposals into draft Projects & deliverable Tasks cleanly (`src/workflows/workflowEngine.ts`) with preview and duplicate-execution blocking (`workflowRuns`).
- **Portable Encrypted Backups & Diagnostics:** Export full versioned JSON backups, inspect conflicts across all tables, reconcile invoice number collisions on merge, inspect pre-restore safety snapshots, optionally encrypt backups using Web Crypto (`PBKDF2-SHA256` 210k iterations + `AES-256-GCM`), and run live **Database Integrity & Diagnostics** in Settings.
- **Installable PWA:** Ships a Web App Manifest, PNG icons (`192x192`, `512x512`, maskable `512x512`, and `apple-touch-icon.png`), Workbox service worker, Content Security Policy, and in-app install button.

---

## Tech Stack

- **UI:** React 19, TypeScript 7, Tailwind CSS 4, Lucide Icons, Recharts
- **Local Database & Validation:** Dexie (IndexedDB schema v3), Zod
- **Monetary Precision & Exports:** `big.js`, `jsPDF`, CSV UTF-8 generator
- **AI (Optional BYOK):** `@google/genai` targeting `gemini-4-hydrogen` (zero stored keys)
- **Build, PWA & Testing:** Vite 8, `vite-plugin-pwa`, Vitest, React Testing Library, Playwright (Chromium E2E)

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
| `npm run test:e2e` | Run Playwright Chromium end-to-end verification against built preview |

---

## Privacy & Security Summary

- **No Mandatory Backend:** Application records live locally inside your browser's IndexedDB.
- **Zero Persisted API Keys:** Gemini BYOK keys live only in volatile JavaScript memory and are never written to `localStorage`, `sessionStorage`, IndexedDB, backups, or logs.
- **Informational Estimates Disclaimer:** Financial summaries and tax figures are workspace estimates, not certified accounting. Contract templates are convenience drafts, not legal advice.

See `/docs/` for detailed guides (`ARCHITECTURE.md`, `DATABASE.md`, `DATA_MODEL.md`, `AI_ARCHITECTURE.md`, `RAG_ARCHITECTURE.md`, `SECURITY_REVIEW.md`, `PRIVACY_MODEL.md`, `THREAT_MODEL.md`, `CRAWLER_SAFETY.md`, `BACKUP_RESTORE.md`, `PWA.md`, `TESTING.md`, `KNOWN_LIMITATIONS.md`, and `USER_GUIDE.md`).
