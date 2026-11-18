# Phase 40 — Offline-First Sync Engine & Auto-Sync Controls

- **Local Outbox (`syncQueue` in IndexedDB):** Mutations queue with entity type, operation, vector clock / version, status (`pending`, `synced`, `failed`), and tombstone flags (`deletedAt`).
- **Auto-Sync Toggle & Pause Control (`src/app/providers/WorkspaceProvider.tsx`, `src/features/settings/SettingsView.tsx`, `src/features/cloud/CloudSyncView.tsx`):**
  - Persists `autoSyncEnabled` (default `true`) and `syncPaused` (default `false`) in IndexedDB `appSettings` (zero `localStorage` usage).
  - Accessible `Auto-sync` switch (`role="switch"`, `aria-label="Auto-sync"`) in **Settings > Cloud Sync** (`#/settings-cloud-sync`) and mirrored in `#/cloud-sync`, logging `auto_sync_toggled` to `securityAuditLogs`.
  - Monotonic exponential backoff (`computeSyncBackoffDelayMs`) with jitter-bounded cap in `src/services/cloudSyncService.ts`.
- **Server Checkpoints & Idempotency (`server/api/v1/router.ts`):**
  - `/api/v1/sync/push` deduplicates by `clientMutationId`, tracks monotonic `serverVersion`, and updates `sync_checkpoints` automatically per `(workspace_id, user_id, device_id)`.
  - `GET /api/v1/sync/checkpoint` returns the durable server checkpoint cursor for delta resume.
