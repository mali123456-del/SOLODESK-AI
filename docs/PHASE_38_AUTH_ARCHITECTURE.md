# Phase 38 — Authentication & Account Architecture

Implemented in `server/auth/authService.ts` and `server/api/v1/router.ts`:
- **Password Hashing:** `scryptSync` per-user random salt + timing-safe comparison (`timingSafeEqual`).
- **Sessions & Revocation:** Opaque high-entropy bearer tokens stored hashed (`SHA-256`) in `sessions` table with explicit revocation (`logout`, single session revoke, revoke-all-other sessions).
- **Password Reset Flow:**
  - `POST /api/v1/auth/password-reset/request` generates a 30-minute SHA-256 hashed reset token without leaking user existence.
  - `POST /api/v1/auth/password-reset/confirm` verifies token validity/expiry/unused state, updates `password_hash`, marks the token used, and revokes all active sessions for the user.
- **Workspace Invitations:**
  - `POST /api/v1/workspaces/:workspaceId/invitations` (owner/admin RBAC gated) creates expiring SHA-256 hashed invites.
  - `POST /api/v1/workspaces/invitations/accept` validates email match, creates membership inside `workspace_members`, and records acceptance timestamp.
- **Client Isolation:** External `#/client-portal?token=...` routes isolate UI chrome via `isIsolatedPortalTokenSession()` and bypass full workspace navigation.
