# Phase 54 — Scoped & Isolated Client Experience Portal

- **Modules:** `src/features/portal/ClientPortalView.tsx`, `src/app/App.tsx` (`isIsolatedPortalTokenSession`).
- **Security & Isolation:**
  - Visiting `#/client-portal?token=<token>` enters an isolated view stripping all workspace sidebar navigation, internal notes, financial ledger totals, and admin routes.
  - Client portal records (`clientPortalLinks`) strictly scope shared deliverables, milestones, invoice summaries, and comment threads per link token.
  - Verified in Playwright E2E Step 13 (`SOLODESK AI · Scoped Client Portal` visible, `Primary Workspace Navigation` hidden).
