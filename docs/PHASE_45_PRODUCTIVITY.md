# Phase 45 — Productivity Intelligence, Daily Digest, Focus Mode & Global Timer

- **Persistent Global Timer (`src/app/providers/WorkspaceProvider.tsx`, `src/app/layouts/AppShell.tsx`):**
  - Central timer state (`runningTimer`, `timerElapsedSeconds`, `startGlobalTimer`, `stopGlobalTimer`) backed by IndexedDB `timeEntries`.
  - Survives navigation between `#/time-tracker`, `#/focus-mode`, `#/dashboard`, and full page reloads without duplicate intervals.
  - Header pill indicator (`data-testid="global-timer-indicator"`) displays live `HH:MM:SS` (`font-mono tabular-nums`), quick navigation, and direct Stop button.
- **Daily Digest (`src/features/dashboard/DailyDigestCard.tsx`):** Computes real-time due-today tasks, overdue items, pending invoices, upcoming appointments, and priority deliverables.
- **Focus Mode (`src/features/focus/FocusModeView.tsx`):** Distraction-free view hiding sidebar navigation and notification clutter while sharing the global live timer.
- **Saved Views & Command Palette:** Workspace goals, pinned items, smart notification snooze, and keyboard shortcuts (`Cmd/Ctrl+K`).
