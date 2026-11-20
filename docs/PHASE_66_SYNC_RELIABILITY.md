# Phase 66 — Sync Reliability, Lifecycle Model & Conflict Handling

## Data Flow & Persistence Boundaries
SOLODESK AI enforces a strict three-tier distinction so UI indicators never conflate local saves with cloud confirmation:
1. **Local Persistence (IndexedDB / Dexie):** Immediate writes to the active workspace's isolated Dexie database (`solodesk_ai_workspace` or `solodesk_ai_ws_<id>`). Surfaced via `syncStatus` (`idle | syncing | synced | error`) and browser `navigator.onLine`.
2. **Queued Outbox Changes (`db.syncQueue`):** Local mutations awaiting remote delivery (`syncQueue[].synced === 0` without conflicts).
3. **Confirmed Remote Sync (`server /api/v1/sync/push` & `/pull`):** State updated only after server HTTP acknowledgement; local failures or conflicts never mark records as synced.

## 6-State Sync Lifecycle Model (`src/services/cloudSyncService.ts`)
Exported `SyncLifecycleStatus` and `SYNC_LIFECYCLE_LABELS`:
- **`local_only` (`Local Only`):** No remote session/connection configured and no pending/conflicted/failed remote outbox items (`deriveRemoteSyncLifecycleStatus` + `WorkspaceProvider`).
- **`pending` (`Pending`):** Changes queued locally awaiting upload (`pending > 0`), including while offline.
- **`syncing` (`Syncing`):** Active `pushSyncQueueWithRetry` / pull roundtrip in flight.
- **`synced` (`Synced`):** Remote endpoint confirmed push/pull with zero remaining outbox items, zero unresolved conflicts, and no active retry failures.
- **`conflict` (`Conflict`):** One or more `syncQueue` items flagged `conflictStatus === 'conflict'` (takes priority over `failed`, `syncing`, `pending`, and `synced`).
- **`failed` (`Failed`):** Bounded remote push retries exhausted or non-retryable client rejection encountered.

Surfaced live in `AppShell.tsx` (`data-testid="sync-lifecycle-badge"`, clicking navigates to `#/cloud-sync`) and in `CloudSyncView.tsx` / `SettingsView.tsx`.

## Retry Policy & Backend Idempotency
- **Bounded Exponential Backoff (`pushSyncQueueWithRetry` in `src/services/cloudSyncService.ts`):**
  - Assigns a stable batch `Idempotency-Key` (`batchKey` UUID) across retry attempts for the same outbox snapshot.
  - Retries transient transport/5xx errors up to bounded `maxAttempts` (default `3`, exponential backoff `baseDelayMs * 2^attempt` with deterministic test injection option).
  - Stops immediately without wasting retries on non-retryable 4xx responses (`400`, `401`, `403`, `404`, `409`, `422`), transitioning lifecycle state honestly to `Failed` (or `Conflict`).
- **SQLite Idempotency & Conflict Persistence (`server/database/sqliteDb.ts`, `server/api/v1/router.ts`):**
  - Added **Migration v5 (`005_sync_idempotency_keys`)** creating `sync_idempotency_keys(workspace_id, idempotency_key, request_hash, response_json, created_at)` keyed by `(workspace_id, idempotency_key)`.
  - `POST /api/v1/sync/push`:
    - Computes SHA-256 `requestHash` over canonical payload changes.
    - Returns cached `{ ...parsed, idempotentReplay: true }` without duplicate mutations when the same `Idempotency-Key` + identical payload is replayed.
    - Returns HTTP `409` (`IDEMPOTENCY_KEY_CONFLICT`) if an existing `Idempotency-Key` is reused with a different payload.
    - Checks `sync_tombstones` alongside `sync_records`: stale pushes against deleted or higher-revision server rows return explicit `conflicts[]` entries instead of silent overwrites; higher-revision upserts remove the tombstone cleanly.
  - `GET /api/v1/sync/pull`: Returns changes ordered deterministically by `(server_revision ASC, updated_at ASC, entity_id ASC)` alongside deletions (`tombstones`) and latest `serverCursor`.
- **Conflict Resolution Safety (`CloudSyncView.tsx`):**
  - Resolving a conflict (`Keep Local & Re-queue` or `Accept Remote`) clears `conflictStatus` and re-queues/applies locally as **`Pending`** — never fabricating a fake `Synced` timestamp without a confirmed remote ACK.

## Classification of Remote Sync Verification
- **Implemented & Tested Locally:** 6-state lifecycle derivation, bounded exponential backoff (`pushSyncQueueWithRetry`), SQLite v5 `Idempotency-Key` deduplication + payload-mismatch `409` guard, tombstone/revision conflict detection (`tests/integration/phase66-sync-idempotency.test.ts`), and Chromium UI badge + conflict resolution flow (`tests/e2e/solodesk.spec.ts`).
- **Implemented Locally / Externally Unverified:** Remote multi-device sync against live external PostgreSQL/Supabase staging environments remains unverified in this sandbox due to absence of external database credentials and live staging deployment targets.
