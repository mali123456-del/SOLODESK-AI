# Phase 65 — Quick Notes Reliability Audit & Hardening

## Audited Scenarios & Safeguards
1. **Save, Edit, Discard & Clear (`src/features/dashboard/QuickNotesCard.tsx`):**
   - Empty, unsaved, saved, and error banners use explicit accessible roles (`aria-live="polite"`, `role="alert"`).
   - Clearing a saved non-empty note requires explicit confirmation (`Clear Quick Notes?` -> `Clear Scratchpad`) and clears both the persisted workspace note and draft state atomically.
   - `Discard Changes` reverts uncommitted edits back to the persisted workspace snapshot.
2. **Failed IndexedDB Write Preservation (`src/app/providers/WorkspaceProvider.tsx`, `src/features/dashboard/QuickNotesCard.tsx`):**
   - If `saveQuickNote(draft)` rejects (e.g., IndexedDB quota or transaction failure), `QuickNotesCard` catches the failure, displays a `role="alert"` error banner, and keeps the user's unsaved `draft` intact in memory so no typed content is lost.
3. **Unsaved Draft Overwrite Prevention & Safe Workspace Switching:**
   - Synchronizes `hasUnsavedChanges` into `WorkspaceProvider.setHasUnsavedQuickNotes`.
   - `QuickNotesCard` syncs `draft` from `persistedContent` only when `!hasUnsavedChanges` or when `workspaceId` changes after an explicit switch decision, preventing background `refresh()` cycles from silently clobbering active typing.
   - Attempting to switch workspaces while `hasUnsavedQuickNotes` is `true` intercepts the switch inside `WorkspaceSwitcher.tsx` and opens the `Unsaved Quick Notes Draft` modal (`Cancel` keeps the user and draft intact; `Discard Draft & Switch` confirms intentional discard).
4. **Navigation Guard (`beforeunload`) & Keyboard Shortcut Isolation:**
   - Registers a `beforeunload` confirmation listener strictly when `hasUnsavedChanges` is `true` and cleans it up immediately on save, discard, or unmount.
   - Scopes `Ctrl/Cmd+S` (`save` shortcut) strictly to keydown events originating inside `#quick-notes-textarea` and ignores modified combinations (`e.altKey` / `Ctrl+Alt+S` / `Cmd+Alt+S`) so browser and OS shortcuts remain unaffected.
5. **Lightweight Storage Decision & Privacy Boundary:**
   - Keeps scratchpad state in `appSettings.quickNotesByWorkspace` inside each workspace's isolated Dexie DB (`SOLODESK_SCHEMA_VERSION = 5`), avoiding unnecessary schema fragmentation while staying 100% outside `localStorage`/`sessionStorage` and never transmitting notes automatically to external cloud or AI endpoints.

## Verification Coverage
- **Unit (`tests/unit/phase63-66-workspace-sync-audit.test.tsx`, `tests/unit/phase61-62-dashboard-notes-goal.test.tsx`):** Verifies failed IndexedDB write retention, `Ctrl/Cmd+S` scoping (inside textarea vs outside textarea vs `Alt`-modified combos), `beforeunload` activation/cleanup, unsaved draft switch guard (`Cancel` preserves draft vs `Discard Draft & Switch`), and zero webStorage usage.
- **Chromium E2E (`tests/e2e/solodesk.spec.ts`):** Verifies saving, reloading, clearing Quick Notes, and triggering the `Unsaved Quick Notes Draft` switch guard across workspaces.
