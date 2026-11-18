# Phase 42 — Projects, Tasks & Gantt Timeline

- **Modules:** `src/features/projects/ProjectsView.tsx`, `src/features/tasks/TasksView.tsx`, `src/features/proposals/ProposalsView.tsx`.
- **Capabilities:**
  - Approval-gated Proposal-to-Project/Deliverables workflow creating milestone tasks without silent mutation.
  - Project list, kanban/list views, due date health, priority management, and integrated **Gantt Timeline** visualization (`#/projects`).
  - Task dependencies, statuses (`todo`, `in_progress`, `blocked`, `review`, `done`), subtasks, pinned tasks, and linkage to **Global Timer** + **Focus Mode**.
- **Verification:** Covered by `tests/unit/phase3-4-crm-projects-tasks.test.tsx` and Chromium E2E Steps 4, 5, and 7c.
