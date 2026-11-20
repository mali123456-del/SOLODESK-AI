# Phase 70 — Sync Engine Adversarial Testing & Idempotency Reliability

**Status:** `LOCALLY VERIFIED` (Client retry logic + Express/SQLite backend adversarial test suite passed)

---

## 1. Files Inspected & Modified

### Inspected
- `server/api/v1/router.ts` (`/api/v1/sync/push`, `/api/v1/sync/pull`, `/api/v1/sync/checkpoint`)
- `server/database/sqliteDb.ts` (`sync_records`, `sync_tombstones`, `sync_checkpoints`, `sync_idempotency_keys`)
- `src/services/cloudSyncService.ts`
- `src/services/backendAuthClient.ts`
- `src/features/cloud/CloudSyncView.tsx`
- `tests/integration/phase66-sync-idempotency.test.ts`

### Modified
- `server/api/v1/router.ts`
- `src/services/cloudSyncService.ts`
- `src/services/backendAuthClient.ts`
- `src/features/cloud/CloudSyncView.tsx`
- `tests/integration/phase70-sync-adversarial.test.ts` (new 14-scenario adversarial suite)

---

## 2. Defects Discovered & Fixed

| Defect | Root Cause | Fix Implemented |
| :--- | :--- | :--- |
| **Concurrent duplicate `/sync/push` race** | Pre-check on `sync_idempotency_keys` occurred before `BEGIN;`, so simultaneous requests with the same `Idempotency-Key` could both pass the pre-check and fail on `INSERT` (`SQLITE_CONSTRAINT_PRIMARYKEY`). | Switched `/sync/push` to `BEGIN IMMEDIATE;` and re-checked `sync_idempotency_keys` inside the write lock, replaying stored response cleanly (or returning `409 IDEMPOTENCY_KEY_CONFLICT` if payload hash differs). |
| **Non-canonical request hashing** | `JSON.stringify({ workspaceId, changes })` depended on object key serialization order. | Added deterministic recursive `canonicalizeJson()` before SHA-256 hashing. |
| **Same-millisecond pull cursor omission** | Sequential `/sync/push` calls within the same millisecond shared `updated_at`, risking skipped records under `/sync/pull?since=T` (`updated_at > since`). | Added `nextMonotonicTimestamp(db, workspaceId)` ensuring per-workspace `serverTimestamp` & checkpoint advance monotonically (`>= prevMs + 1`), plus `hasMore` & `nextCursor` on `/sync/pull`. |
| **Post-conflict re-sync revision stall** | `CloudSyncView.handleResolveItem()` marked item `pending` without advancing `revision` above server's conflicting `serverRevision`. | Tracked `conflictServerRevisions` in `CloudSyncView.tsx` and extended `buildResolvedPendingPatch(decision, nextRevision)` to bump `revision > serverRevision` cleanly. |
| **Stale UI auth badge after 401 expiry** | When `/sync/push` or `/sync/pull` returned HTTP `401`, `CloudSyncView` left `authUser` populated. | Cleared `authUser` & `backendWorkspaces` on `httpStatus === 401` and surfaced `httpStatus` from `pullWorkspaceChangesFromServer`. |

---

## 3. All 14 Adversarial Sync Scenarios Tested & Verified

Executed in `tests/integration/phase70-sync-adversarial.test.ts` (all assertions passed):
1. **Same `Idempotency-Key` + same payload (including reordered keys):** Server returns `{ idempotentReplay: true, ackedIds }` with zero duplicate writes.
2. **Same `Idempotency-Key` + mutated payload:** Server returns `409 IDEMPOTENCY_KEY_CONFLICT`.
3. **Concurrent duplicate push batch (5 parallel `Promise.all` requests):** Exactly 1 fresh execution + 4 `idempotentReplay: true` replays; 0 `500` errors.
4. **Dropped network mid-push (`ECONNRESET`):** Client retries with the **identical** `Idempotency-Key` and delivers successfully.
5. **Server restart after request acceptance:** File-backed temp SQLite DB closed and reopened in a fresh Express instance; client retry with original `Idempotency-Key` replays stored ACK cleanly without revision conflict.
6. **Timeout / `504` recovery:** Retried with bounded backoff and identical `Idempotency-Key` until server ACK.
7. **Duplicate `/sync/pull` delivery & rapid sequential pushes:** Monotonic timestamps + deterministic pull ordering return identical snapshots without missed records.
8. **Out-of-order client revision (`rev 2` after `rev 3`):** Rejected into `conflicts[]` with `serverRevision: 3`; server state preserved.
9. **Simultaneous conflicting edits:** First accepted (`ackedIds`), stale concurrent revision rejected (`conflicts[]`), zero silent last-write-wins overwrites.
10. **Tombstone deletion conflicts:** `delete` at `rev 4` rejects stale `upsert` at `rev 4`; explicit resurrection at `rev 5` succeeds after conflict resolution.
11. **Post-conflict resolution lifecycle:** `buildResolvedPendingPatch` keeps status `pending` (never pre-`acked`) with bumped revision; transitions to `Synced` only after server ACK.
12. **Retry budget exhaustion:** `maxAttempts: 3` stops after 3 attempts with deterministic delays `[25, 50]ms` and leaves items in `failedIds`.
13. **Non-retryable `400` validation rejection:** Halts on attempt 1 with `retryable: false`, `delaysMs: []`.
14. **Session authentication expiration (`401`):** Logout/revoked session returns `401` on attempt 1, halts immediately (`retryable: false`), and leaves queue items `Failed` rather than falsely `Synced`.

---

## 4. Residual Sync Scope Limitations

- `CloudSyncView.handlePullSync()` fetches and displays pulled record/tombstone counts from the server; full automatic bi-directional merge of every remote `entityType` payload into local IndexedDB stores requires typed per-entity conflict/schema adapters beyond the scope of the current single-workspace client cache.
- Cloud PostgreSQL sync execution (`sync_records`, `sync_tombstones`, `sync_idempotency_keys`) has matching SQL migration DDL (`003_rls_hardening_and_sync_idempotency.sql`) but remains `BLOCKED — EXTERNAL REQUIREMENT` without a provisioned staging database.
