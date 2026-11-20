# Phase 64 — Daily Task Goal Accuracy & Timestamp Migration

## Audit Findings
1. **Historical Overcounting via `completedAt || updatedAt` (`src/services/productivityService.ts`):**
   - Previously, `computeDailyTaskGoalProgress` fell back to `task.updatedAt` when `task.completedAt` was missing. Editing an older completed task's title or notes on a later day could make it count against today's goal.
2. **Calendar String Rollover Bug (`src/domain/calculations/dates.ts`):**
   - Dates such as `'2026-02-30'` were accepted by JavaScript's `new Date('2026-02-30')`, silently rolling over into March instead of being treated as invalid.

## Implemented Corrections
- **Strict Completion Timestamp Enforcement (`src/services/productivityService.ts`):**
  - Removed the `|| task.updatedAt` fallback completely. Tasks now count toward `computeDailyTaskGoalProgress` only when `task.status === 'done'`, `task.completedAt` parses to a valid calendar date, and that date matches `todayStr` in the resolved workspace timezone.
  - Deduplicates counted task IDs via `Set<string>` so repeated records cannot double-count a task.
  - Changing the daily target (`setDailyTaskGoalTarget`) updates only `appSettings.dailyTaskGoalsByWorkspace[workspaceId]` and never mutates task timestamps or task history.
- **Calendar Date Validation (`src/domain/calculations/dates.ts`):**
  - Updated `toWorkspaceDateStr` to validate `YYYY-MM-DD` bounds explicitly (month `1–12`, day `1–daysInMonth`), returning `null` for impossible calendar dates like `'2026-02-30'`, `'invalid-date'`, or blank values.
- **Explicit Lifecycle & Legacy Backfill (`src/database/repositories/dexieRepositories.ts`, `src/database/migrations/taskCompletionMigration.ts`, `src/database/solodeskDatabase.ts`):**
  - Preserves explicit `completedAt` on `createTask` / `updateTask` when `status === 'done'`, assigns `completedAt` on completion transitions, and deletes `completedAt` when a task is reopened (`status !== 'done'`).
  - Added `taskCompletionBackfilledAt` to `appSettingsSchema` (`src/domain/schemas/entities.ts`) while keeping `SOLODESK_SCHEMA_VERSION = 5` intact for database health checks.
  - Implemented `runTaskCompletionTimestampMigration(database)` inside an atomic Dexie `'rw'` transaction (`[database.tasks, database.appSettings]`) — plus v5 `.upgrade()` hook — to idempotently backfill missing `completedAt` values on legacy `'done'` tasks using `(task.updatedAt || task.createdAt)` once per workspace database without disturbing newer explicit timestamps.

## Verification Coverage
- **Unit (`tests/unit/phase63-66-workspace-sync-audit.test.tsx`, `tests/unit/phase61-62-dashboard-notes-goal.test.tsx`):**
  - Rejects `completedAt || updatedAt` miscounting when editing a previously completed task.
  - Rejects invalid calendar strings (`'2026-02-30'`, `'not-a-date'`, `''`).
  - Verifies UTC midnight boundary normalization across timezones (`America/New_York` vs `Asia/Karachi`).
  - Verifies reopen -> re-complete lifecycle, deduplicated task IDs, goal target changes leaving task history untouched, and idempotent backfill migration.
- **Chromium E2E (`tests/e2e/solodesk.spec.ts`):** Verifies setting target `2`, completing `Architecture Audit` -> `1/2` (`50%`) surviving full page reload, and isolated `0/—` goal tracking per workspace.
