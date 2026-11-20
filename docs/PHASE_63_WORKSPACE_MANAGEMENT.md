# Phase 63 — Workspace Lifecycle & Switching

## Overview
Implemented true multi-workspace lifecycle management and physical IndexedDB database isolation while preserving the `'local-workspace'` default and backward compatibility with existing single-workspace data.

## Physical Isolation & Registry Architecture
- **Workspace Metadata Registry (`src/database/workspaceManager.ts`):**
  - Uses a dedicated lightweight Dexie metadata database (`solodesk_ai_workspaces_meta`, schema v1) with `workspaces` and `meta` stores.
  - Preserves `'local-workspace'` (display name `Local Workspace`) as the default workspace mapped to the pre-existing primary IndexedDB database name `'solodesk_ai_workspace'`.
  - Secondary workspaces (`ws_<uuid>`) receive their own isolated Dexie database named `'solodesk_ai_ws_' + id` across all 29 domain tables (clients, projects, tasks, proposals, quotations, contracts, invoices, payments, time entries, sync queue, notes, app settings, etc.).
- **Dynamic Active Database Routing (`src/database/db.ts`, `src/database/solodeskDatabase.ts`, `src/database/repositories/dexieRepositories.ts`):**
  - Extracted `SolodeskDatabase` (`SOLODESK_SCHEMA_VERSION = 5`) into `src/database/solodeskDatabase.ts` so repository code, database lifecycle code, and migrations remain acyclic.
  - Exported `db` as a dynamic `Proxy` backed by `getActiveWorkspaceDatabase()`, ensuring every read, write, query, and backup operates solely on the active workspace's IndexedDB instance.
  - `DexieSolodeskRepositories` resolves `getActiveWorkspaceDatabase()` dynamically whenever no explicit test database is injected.

## Workspace Lifecycle Operations & Safe Switching
- **Provider Integration (`src/app/providers/WorkspaceProvider.tsx`):**
  - Initializes the workspace manager before `refresh()`, commits `workspaces`, `activeWorkspaceId`, and workspace-scoped entities atomically inside `refresh()` to eliminate single-frame cross-workspace bleed-through.
  - Marks newly created secondary workspaces `onboardingCompleted: true` so switching to a new workspace opens cleanly without hijacking navigation with initial setup dialogs.
  - Exposes `workspaces`, `activeWorkspace`, `createWorkspace(name)`, `renameWorkspace(id, name)`, `switchWorkspace(id)`, and `deleteWorkspace(id)`.
- **Shell Selector & Confirmation Guards (`src/features/workspaces/WorkspaceSwitcher.tsx`, `src/app/layouts/AppShell.tsx`):**
  - Renders `<WorkspaceSwitcher />` in both the desktop sidebar and mobile navigation drawer (hidden in Focus Mode), clearly showing the active workspace name (`data-testid="active-workspace-name"`).
  - Supports creating, switching, renaming, and deleting secondary workspaces inside an accessible modal dialog.
  - Refuses silent deletion: secondary workspace removal requires explicit confirmation (`Delete workspace "..."?` -> `Delete Workspace`) and blocks deletion of the `'local-workspace'` default or last remaining workspace.
  - Enforces an unsaved Quick Notes switch guard (`Unsaved Quick Notes Draft` -> `Cancel` or `Discard Draft & Switch`) before leaving a workspace with unpersisted scratchpad edits.

## Verification Coverage
- **Unit (`tests/unit/phase63-66-workspace-sync-audit.test.tsx`):** Verifies creating a secondary workspace, zero client/settings leakage between `local-workspace` and secondary workspace, reload persistence of active workspace selection, rename updates, and guarded deletion returning safely to `'local-workspace'`.
- **Chromium E2E (`tests/e2e/solodesk.spec.ts`):** Verifies creating `E2E Isolated Studio`, confirming `E2E Horizon Labs` and Daily Task Goal counts do not leak across workspaces, surviving `page.reload()`, triggering and confirming the unsaved Quick Notes switch guard, and confirmation-guarded workspace deletion.
