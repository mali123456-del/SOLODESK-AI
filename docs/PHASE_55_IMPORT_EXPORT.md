# Phase 55 — Data Import, Export & Atomic Backup Recovery

- **Modules:** `src/services/backupService.ts`, `src/features/settings/SettingsView.tsx`, `src/features/security/SecurityCenterView.tsx`.
- **Capabilities:**
  - Full versioned JSON workspace backup export & import (`validateBackupPayload`, excludes volatile session secrets/AI keys).
  - Non-destructive pre-restore snapshot before transactional Dexie import (`db.transaction`) so failed or canceled imports never delete user data.
  - Optional passphrase-encrypted backup support using Web Crypto API (`PBKDF2` + `AES-GCM`).
  - CSV exports, offline `.pdf` invoices (`jspdf`), and `.ics` calendar exports (`calendarEmailAdapter.ts`).
  - Verified in `tests/unit/phase8-backup-restore.test.ts` and E2E Step 7c non-destructive AES-GCM roundtrip test.
