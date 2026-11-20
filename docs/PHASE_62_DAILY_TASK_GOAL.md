# Phase 62 — Daily Task Completion Goal

## Overview
Implemented a live **Daily Task Completion Goal** widget (`src/features/dashboard/DailyTaskGoalCard.tsx`) on `DashboardView.tsx` with an accessible SVG circular progress ring, numeric `completed / target` counter, percentage display, and target configuration form.

## Calculation & Rollover Rules (`src/services/productivityService.ts`, `src/domain/calculations/dates.ts`)
- **Timezone-Aware Calendar Resolution:** Added optional `timeZone` support to `todayDateStr(now, timeZone)` and added `toWorkspaceDateStr(value, timeZone)` so UTC ISO `completedAt` timestamps map accurately to the user's local/workspace calendar day (`YYYY-MM-DD`).
- **Source of Truth (`computeDailyTaskGoalProgress`):**
  - Evaluates actual persisted `tasks` (`status === 'done'` whose completion calendar date equals today).
  - Deduplicates by `task.id` (`Set<string>`) to prevent duplicate counting.
  - Dynamically decreases when a task is reopened (`dexieRepositories.updateTask` clears `completedAt` when status leaves `'done'`).
  - Logically resets to `0` at date rollover without mutating or deleting historical completed tasks.
- **Target Validation (`validateDailyTaskGoalTarget`):**
  - Accepts integers `0`–`500` (`0` = no target tracked, `0%`, no division by zero).
  - Rejects blank, negative, fractional, or `>500` inputs with inline `role="alert"` errors.
- **Persistence & Workspace Isolation:** Stored in Dexie `appSettings.dailyTaskGoalsByWorkspace[activeWorkspaceId]` via `WorkspaceProvider.setDailyTaskGoalTarget(target)`.

## Accessibility
- Circular SVG progress bar wrapped in `role="progressbar"` with `aria-label`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and descriptive `aria-valuetext` paired with visible numeric text.
