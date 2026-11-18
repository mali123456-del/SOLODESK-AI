# SOLODESK AI — Offline Sync Queue & Multi-Role Architecture (Phase 23)

**Updated:** 2026-11-17

## 1. Local Offline Sync Queue (`syncQueue` store in Dexie `v5`)

- **Queue State Machine:** Pending mutations are tracked with `status` (`pending` | `acked` | `conflict` | `failed`), `entityType`, `entityId`, and `updatedAt`.
- **Queue Telemetry (`WorkspaceProvider` & `AppShell`):**
  - Listens to `window` `online`/`offline` events plus local `syncEvents` emissions across repository CRUD operations.
  - Exposes visual status pills/badges inside `AppShell` and `SettingsView` (`syncStatus`, `pendingSyncCount`, `lastSyncedAt`, `syncError`, and manual `retrySync()`).

## 2. Deterministic Conflict Resolution (`src/services/cloudSyncService.ts`)

`resolveSyncConflict({ localUpdatedAt, remoteUpdatedAt, strategy })` supports three deterministic modes:
1. `latest_timestamp`: Selects whichever revision carries the newer or equal ISO timestamp.
2. `local_wins`: Explicitly preserves local browser edits.
3. `remote_wins`: Explicitly accepts incoming remote payload.

## 3. Multi-Role & Multi-Tenant Readiness (`ROLE_PERMISSION_MATRIX`)

Four canonical roles define workspace boundaries in `src/services/cloudSyncService.ts` and `src/features/cloud/CloudSyncView.tsx`:
- `owner` (`Workspace Owner`): Full client/invoice editing, security management, workflow approval.
- `manager` (`Project & Finance Manager`): Client/invoice editing and workflow approval; no security admin.
- `collaborator` (`Delivery Collaborator`): Project/task/time execution; read-restricted from billing & security controls.
- `client_viewer` (`Scoped Client Portal Viewer`): Confined strictly to `#/client-portal?token=...`.

## 4. Honest Boundary: Static MVP vs Hosted Cloud Sync

- **Implemented & Verified:** Local `syncQueue` IndexedDB store, conflict simulator & resolution engine, RBAC permission matrix UI, remote sync adapter config (`RemoteSyncAdapterConfig`), and scoped client portal views.
- **NOT CONFIGURED IN STATIC MVP:** Multi-device cloud database server synchronization (requires provisioning a hosted REST/WebSocket sync endpoint and server-side authentication, intentionally omitted to preserve zero paid-backend operation).
