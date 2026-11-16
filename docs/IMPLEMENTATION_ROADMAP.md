# SOLODESK AI — Implementation Roadmap (Phase 0–12+)

> **Execution Rule:** Each phase must pass TypeScript (`tsc --noEmit`), build (`vite build`), automated unit/integration tests (`vitest run`), and UI/error-state inspection before advancing to the next dependent phase.

---

### Phase 0 — Inspection & Architecture Approval (Current)
- **Deliverables:** `docs/INITIAL_AUDIT.md`, `docs/DEPENDENCY_AUDIT.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/IMPLEMENTATION_ROADMAP.md`, `docs/RISK_REGISTER.md`.
- **Gate:** Owner approves architecture, dependency cleanup, and Phase 1 scope.

### Phase 1 — Foundation & Design System
- Install React 19, `@vitejs/plugin-react`, Tailwind CSS v4 (`@tailwindcss/vite`), `lucide-react`, `vitest`, `@testing-library/react`, `jsdom`.
- Configure `vite.config.ts`, `tsconfig.json` (`react-jsx`, strict TS 7), `index.html`, `metadata.json`.
- Implement design tokens (`#2563EB` primary, `#20C7D9` accent, `#101827` / `#172338` dark, `#F5F7FB` light), Inter font, original SOLODESK SVG logo/monogram.
- Build reusable UI primitives (Button, Input, Select, Dialog, ConfirmDialog, Card, DataTable, Badge, Tooltip, Toast, EmptyState, ErrorBoundary, Skeleton).
- Build responsive AppShell (desktop sidebar, tablet collapsible nav, mobile drawer/bottom nav), light/dark theme toggle, and route registry matching Section 7 navigation (non-implemented future screens clearly gated/stubbed only until their phase, or incrementally wired per phase).

### Phase 2 — Data Architecture & Core Utilities
- Install `dexie`, `zod`, `big.js`, `@types/big.js`, `fake-indexeddb`.
- Define all domain models & Zod schemas (`Client`, `Project`, `Milestone`, `Task`, `Subtask`, `Proposal`, `Quotation`, `Contract`, `Invoice`, `Payment`, `IncomeEntry`, `Expense`, `TimeEntry`, `Category`, `ActivityEvent`, `BusinessSettings`, `KnowledgeDocument`, `DocumentChunk`).
- Implement `db/database.ts` with versioned Dexie schema & migrations + `navigator.storage.persist()` helper.
- Implement typed repository interfaces & Dexie repository implementations.
- Implement `big.js` money utilities & timezone-safe date utilities + comprehensive Vitest unit tests.

### Phase 3 — Client CRM & First-Run Experience
- First-run onboarding wizard (Business profile, currency selection, optional clearly-labelled demo workspace seed).
- Client CRUD, archive/restore, tags, notes, search/filters, email/name duplicate detection, activity history, and linked records summary.
- Automated repository & UI tests for Client CRM.

### Phase 4 — Projects, Milestones & Tasks
- Project CRUD, client linking, budget tracking, milestones, progress calculation, status workflows, activity log.
- Task CRUD, subtasks, priority, `YYYY-MM-DD` due dates, overdue indicators, filters, completion history.
- Automated tests for project progress, task completion, and overdue boundary dates.

### Phase 5 — Business Documents (Proposals, Quotations, Contracts, Invoices)
- Install `jspdf` (lazy-loaded).
- Proposal Builder (templates, scope, deliverables, milestones, timeline, pricing, PDF export, status tracking).
- Quotation Studio (line items, discounts, tax-inclusive/exclusive, PDF export, atomic non-duplicating Convert-to-Invoice).
- Contract Templates (editable templates, client/project bindings, PDF export, acceptance tracking, non-legal disclaimer).
- Invoice Studio (unique configurable numbering, live preview, branding, PDF + print fallback, statuses: draft/sent/paid/partially_paid/overdue/cancelled).
- Automated tests for invoice numbering uniqueness, conversion atomicity, decimal precision, and PDF builder helpers.

### Phase 6 — Financial Operations & Time Tracking
- Payment Tracker (manual payments, partial payments, duplicate payment guard, balance calculation).
- Finance Tracker (income, expenses, categories, monthly summaries, accounting disclaimer).
- Time Tracker (start/stop timer, duplicate running timer prevention, reload recovery from IndexedDB, manual entries, billable/non-billable timesheets).
- Profitability calculations (project budget vs. tracked time/expenses/payments).

### Phase 7 — Reporting, Dashboard, Search & Command Palette
- Install `recharts` (lazy-loaded).
- Real-data Dashboard (revenue/expense summaries, active projects, pending/overdue invoices, upcoming deadlines, recent activity, quick actions, date-range filter).
- Reports module (revenue trends, expenses, outstanding balances, project profitability, client performance, billable hours, CSV & PDF exports with RFC 4180 CSV escaping).
- Global Search (`Ctrl/Cmd+K` Command Palette) & Notifications/Activity center.

### Phase 8 — Backup, Restore & Data Portability
- Versioned JSON export with record counts and optional Web Crypto (`PBKDF2` + `AES-GCM`) passphrase encryption.
- Multi-step Restore flow: file check -> schema validation -> import preview -> duplicate/conflict summary -> automatic safety backup -> explicit confirmation -> transactional restore -> verification & rollback on failure.
- Storage persistence status & backup reminders.

### Phase 9 — AI Copilot, Agent & Knowledge Hub (Local RAG)
- `AIProvider` abstraction (`GeminiProvider` for `gemini-4-hydrogen` only + `MockProvider`).
- In-memory BYOK configuration UI with security notice and Clear Key button.
- Allowlisted Zod-validated agent tools with structured action approval modal.
- Knowledge Hub (text/markdown/JSON ingestion, size/type limits, chunking, local keyword indexing & citation retrieval — fully functional without Gemini).
- Dataset research manifests (`datasets/manifests/`, `LICENSES.md`) & repeatable evaluation runner (`evaluation/`).

### Phase 10 — PWA & Offline Support
- Verify `vite-plugin-pwa` with Vite 8.3.8.
- Configure Web App Manifest, SVG/PNG icons, offline app shell caching (never caching private business records in public SW caches), safe update prompt, offline status banner, and offline reload verification.

### Phase 11 — Quality Hardening & Documentation Sync
- Accessibility audit (keyboard navigation, focus rings, ARIA labels, contrast, reduced motion).
- Security & privacy audit (XSS/HTML sanitization, MIME/size validation, no leaked keys).
- Mobile/tablet/desktop responsive audit + bundle size audit + Playwright E2E smoke tests (if supported in container).
- Complete remaining docs (`USER_GUIDE.md`, `PRIVACY.md`, `BACKUP_RESTORE.md`, `AI_ARCHITECTURE.md`, `DATASET_POLICY.md`, `TESTING.md`, `CHANGELOG.md`).

### Phase 12 — Commercial Presentation & Release Readiness
- Separate marketing/product landing view (overview, real UI previews, transparent free/local vs. optional Pro explanation, FAQ, privacy summary, install & backup guides — zero invented reviews or metrics).
- Production build verification & release checklist.

### Phase 13+ — Optional Future Expansion (Out of MVP Scope)
- Cloud sync adapter, client portal, team collaboration, desktop packaging.
