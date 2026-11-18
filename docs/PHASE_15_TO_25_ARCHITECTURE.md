# SOLODESK AI — Architecture (Phases 15–25)

**Updated:** 2026-11-17  
**Runtime Model:** Offline-first static React 19 + TypeScript 7 + Vite 8 + Tailwind CSS v4 Progressive Web Application backed by Dexie 4 IndexedDB (`solodesk_ai_workspace`, schema `v5`).

## 1. Architectural Principles

1. **Zero Mandatory Paid Server:** All core business operations (CRM, Focus Mode, Daily Digest, Gantt planning, invoicing, `Big.js` FX conversion, Document Vault, Hybrid RAG v2, and AES-GCM encrypted backups) run client-side inside the browser with no backend required.
2. **Repository & Service Abstraction:** UI views never call `db.*` tables directly for domain mutations. All writes traverse typed repositories in `/src/database/repositories/dexieRepositories.ts` and `/src/database/repositories/interfaces.ts`, keeping persistence swappable without rewriting feature modules.
3. **Resilient Sync & Status Telemetry:** Every repository write emits `syncEvents` consumed by `WorkspaceProvider` (`src/features/workspace/WorkspaceProvider.tsx`), updating live `syncStatus`, `pendingSyncCount`, `lastSyncedAt`, and `online` state in `AppShell` and `SettingsView`.

## 2. Schema Evolution (`v4` -> `v5`)

`/src/database/db.ts` defines a non-destructive `this.version(5)` migration preserving all `v1–v4` stores and expanding the database to **28 indexed object stores**:

- **Existing stores extended in `v5`:**
  - `projects`: indexed `isTemplate`, upgrades backfill `risks = []`, `okrs = []`, `isTemplate = false`.
  - `tasks`: upgrades backfill `dependsOnIds = []`, `estimatedHours = 0`, `recurrenceRule = 'none'`.
  - `invoices`: indexed `recurrenceRule` alongside unique `&number`.
  - `knowledgeDocs`: indexed `accessScope`.
  - `notifications`: indexed `snoozedUntil`.
- **New `v5` stores:**
  - `vaultFiles` (`id, folder, projectId, clientId, classification, shareToken, updatedAt`)
  - `clientPortalLinks` (`id, clientId, projectId, &token, status, expiresAt`)
  - `retainers` (`id, clientId, projectId, status, updatedAt`)
  - `customWorkflows` (`id, triggerType, enabled, updatedAt`)
  - `webhooks` (`id, eventType, enabled, updatedAt`)
  - `syncQueue` (`id, entityType, entityId, status, updatedAt`)
  - `securityAuditLogs` (`id, eventType, severity, createdAt`)
  - `savedViews` (`id, route, name, updatedAt`)

## 3. Navigation & Module Boundaries

- **36 Lazy-Loaded Views (`src/app/App.tsx`, `src/types/navigation.ts`):**
  - Core & Productivity: `dashboard`, `focus-mode`, `activity`, `notifications`, `search`, `import-export`, `workflows`, `cloud-sync`.
  - Client & Delivery: `clients`, `client-portal`, `projects`, `tasks`, `time-tracker`, `communication`.
  - Documents & Vault: `proposals`, `quotations`, `contracts`, `invoices`, `payments`, `vault`.
  - Finance: `income`, `expenses`, `profitability`, `reports`.
  - Intelligence: `ai-copilot`, `knowledge`, `templates`.
  - Settings & Governance: `settings-profile`, `settings-appearance`, `settings-localization`, `settings-ai`, `settings-backup`, `settings-privacy`, `security-center`, `help-plans`, `about`, `marketing`.
- **Standalone Client Portal Hash Routing:** `#/client-portal?token=...` renders a minimal scoped client portal layout via `buildScopedPortalSnapshot`, omitting internal workspaces, private notes, internal costs, and security settings.
- **PWA Precaching:** Configured via `vite-plugin-pwa` v2.0.0 (`dist/sw.js` + `dist/workbox-afac4cd2.js`, 83 precached entries totaling `3,083.75 KiB`).
