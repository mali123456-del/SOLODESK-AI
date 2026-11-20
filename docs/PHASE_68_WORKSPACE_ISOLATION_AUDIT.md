# Phase 68 — Multi-Workspace Isolation Audit

**Status:** `LOCALLY VERIFIED` (IndexedDB / fake-indexeddb unit tests & Playwright Chromium E2E)

---

## 1. Files Inspected & Modified

### Inspected
- `src/database/solodeskDatabase.ts` (all 29 Dexie tables in schema v5)
- `src/database/db.ts` (`db` dynamic proxy)
- `src/database/workspaceManager.ts`
- `src/database/repositories/dexieRepositories.ts`
- `src/services/backgroundJobRunner.ts`
- `src/services/backupService.ts`
- `src/features/backup/BackupRestoreView.tsx`
- `src/features/settings/SettingsView.tsx`
- `src/app/providers/WorkspaceProvider.tsx`

### Modified
- `src/database/workspaceManager.ts`
- `src/database/repositories/dexieRepositories.ts`
- `src/services/backgroundJobRunner.ts`
- `src/services/backupService.ts`
- `src/features/backup/BackupRestoreView.tsx`
- `src/features/settings/SettingsView.tsx`
- `src/app/providers/WorkspaceProvider.tsx`
- `tests/unit/phase68-69-isolation-migrations.test.tsx` (added automated tests)

---

## 2. All 29 IndexedDB Domain Tables Audited

`SolodeskDatabase` (`src/database/solodeskDatabase.ts`, schema v5) defines and isolates all 29 domain tables per workspace database instance:
1. `businessProfile`
2. `appSettings`
3. `clients`
4. `projects`
5. `tasks`
6. `proposals`
7. `quotations`
8. `contracts`
9. `invoices`
10. `payments`
11. `financeEntries`
12. `timeEntries`
13. `knowledgeDocs`
14. `documentChunks`
15. `templates`
16. `workflowRuns`
17. `serviceCatalog`
18. `appointments`
19. `workspaceGoals`
20. `activities`
21. `notifications`
22. `vaultFiles`
23. `clientPortalLinks`
24. `retainers`
25. `customWorkflows`
26. `webhooks`
27. `syncQueue`
28. `securityAuditLogs`
29. `savedViews`

Each workspace maps deterministically:
- Default local workspace (`local-workspace`) -> `solodesk_ai_workspace`
- Secondary workspace (`<id>`) -> `solodesk_ai_ws_<id>`
- Workspace registry metadata DB -> `solodesk_ai_workspaces_meta`

---

## 3. Issues Discovered & Fixed

| Severity | Finding | Fix Applied |
| :--- | :--- | :--- |
| **High** | `sanitizeWorkspaceId` previously coerced arbitrary punctuation (e.g. `ws/a` and `ws?a`) to underscores, enabling silent database-name collisions. | Added strict `validateWorkspaceId(id)` requiring `/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/`, blocking reserved names (`solodesk_ai_workspace`, `solodesk_ai_workspaces_meta`, `__proto__`, `constructor`, `prototype`), and enforcing `assertNoDbNameCollision()`. |
| **High** | `backgroundJobRunner.ts` stored `JOB_RUN_STORAGE_KEY` globally in `window.sessionStorage`, leaking daily alert markers across workspaces and violating zero-webStorage discipline. | Removed `window.sessionStorage` usage completely; replaced with per-DB `lastOverdueAlertDateByDb` memory map + persisted `notifications` check, and bound `database` & `repo = repositories.withDatabase(targetDb)` at job entry. |
| **High** | Async switching races could let in-flight `WorkspaceProvider.refresh()`, background jobs, backup/restore, settings saves, or workspace deletion write into the wrong workspace database. | Serialized workspace lifecycle operations via `enqueueWorkspaceLifecycle`, added `trackWorkspaceOperation()` operation-drain barrier on `deleteWorkspaceRecord()`, added `refreshEpochRef` + active-workspace checks + `mountedRef` teardown guard in `WorkspaceProvider.tsx`, added `repositories.withDatabase(db)` scoping, and pinned `targetDb` at entry in `backupService.ts` and `SettingsView.tsx`. |
| **Medium** | Backup payload lacked workspace provenance, allowing silent cross-workspace confusion during inspection. | Added optional backward-compatible `workspaceId`/`workspaceName` fields in `backupPayloadSchema`, surfaced `crossWorkspaceMismatch` in `inspectBackupText`, and rendered warning banner in `BackupRestoreView.tsx`. |
| **Low** | Creating a secondary workspace without immediate switching (`createWorkspace(name, false)`) left `onboardingCompleted` unset on first visit. | Initialized `{ activeWorkspaceId: created.id, onboardingCompleted: true }` on secondary workspace creation regardless of `switchTo` flag. |

---

## 4. Verification Evidence

- **Unit Tests:** `tests/unit/phase68-69-isolation-migrations.test.tsx` (executed in `npm test`, 23/23 files, 102/102 tests passed) verifies:
  - ID validation rejection for slashes, spaces, traversal segments, and reserved DB names;
  - All 29 table names verified isolated across workspaces A and B;
  - Background job pinned to workspace A while switching concurrently to B never leaks invoices/notifications into B and leaves `sessionStorage.length === 0`;
  - Backup from A flags `crossWorkspaceMismatch: true` when inspected inside B and restores strictly into target DB;
  - Rapid concurrent UI switching settles on consistent active workspace state;
  - Deleting workspace B waits for active `trackWorkspaceOperation` tasks to drain before closing and deleting IndexedDB, while preserving default workspace deletion protection.
- **Playwright E2E:** `tests/e2e/solodesk.spec.ts` creates secondary workspace `E2E Isolated Studio`, verifies CRM isolation (`E2E Horizon Labs` count `0`), persists active workspace across reload, verifies unsaved Quick Notes switch guard, switches back cleanly, and deletes secondary workspace with explicit confirmation.

---

## 5. Known Limitations

- Client-side IndexedDB isolation protects tenant separation at the browser database layer per origin/profile; OS-level local disk encryption or cross-user isolation on shared OS user profiles is outside browser storage guarantees.
- `runBackgroundJobs` still executes synchronously within the active workspace browser tab (no persistent Service Worker background thread).
