# Phase 39 — Multi-Tenant Authorization & RLS Security

- **RBAC Roles (`WorkspaceMemberRole`):** `owner`, `admin`, `manager`, `collaborator`, `client_viewer`.
- **Backend Middleware (`server/api/v1/router.ts`):**
  - Verifies session token on every `/workspaces/*`, `/sync/*`, `/ai/*`, `/webhooks/*`, and `/billing/*` route.
  - Checks `workspace_members` membership (`assertWorkspaceAccess`), returning `403` when an authenticated user from Workspace A attempts to read or push to Workspace B.
  - Role guards restrict invitations, webhook secret rotation, and administrative actions to `owner`/`admin` and prevent `client_viewer` writes.
- **PostgreSQL Row-Level Security (`server/database/pgMigrations/`):**
  - `ENABLE ROW LEVEL SECURITY` on tenant tables including `sync_records`, `workspace_invitations`, `sync_checkpoints`, `workflow_executions`, `payment_webhook_events`, `ai_agents`, and `entitlements`.
  - Policies filter via `app.is_workspace_member(workspace_id)` bound to `app.current_user_id()`.
- **Verified Tests:** Cross-tenant isolation and revocation tests pass in `tests/integration/phase26b-saas-backend.test.ts` and `tests/integration/phase36-60-backend.test.ts`.
