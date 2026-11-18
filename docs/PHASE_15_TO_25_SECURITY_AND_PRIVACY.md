# SOLODESK AI — Security, Privacy & Reliability Model (Phases 15–25)

**Updated:** 2026-11-17

## 1. Zero-Persistence Secret Policy

- **BYOK API Keys (Gemini, OpenAI-Compatible):** Keys entered in `SettingsView` or `AICopilotView` are held strictly in React runtime memory (`AiKeyContext` / state). Nothing is written to `localStorage`, `sessionStorage`, cookies, URL parameters, or IndexedDB. Verified in Playwright E2E (`localStorage.length === 0`, `sessionStorage.length === 0`).
- **Backup Passphrases:** AES-GCM backup encryption/decryption uses Web Crypto (`PBKDF2` + `AES-GCM` 256-bit) inside `src/services/backupService.ts`. Passphrases are never stored or logged.

## 2. Document Vault Validation (`src/services/documentVaultService.ts`)

Every uploaded file passes four layered checks before persistence:
1. **Extension Blocklist:** Rejects dangerous executable/script extensions (`.exe`, `.bat`, `.cmd`, `.msi`, `.sh`, `.ps1`, `.vbs`, `.js`, `.mjs`, `.html`, `.svg`, `.dll`, `.scr`).
2. **Size Cap:** Enforces a strict `5 MB` browser payload ceiling to protect IndexedDB quota stability.
3. **Magic-Byte Signature Inspection:** Inspects header bytes directly (`%PDF-` for PDF, `89 50 4E 47` for PNG, `FF D8 FF` for JPEG) alongside UTF-8 plain text verification for Markdown/CSV/JSON.
4. **Filename Sanitization & Content Integrity:** Strips path traversal/control characters (`sanitizeFileName`) and computes a `SHA-256` digest recorded per version.

## 3. Scoped Client Portal Data Isolation (`src/services/clientPortalService.ts`)

- Portal share URLs (`#/client-portal?token=...`) validate token status (`active` vs `revoked`) and `expiresAt` timestamp against current time.
- Expired or revoked links return `valid: false` with zero business data exposed.
- Active tokens compute a minimal snapshot (`buildScopedPortalSnapshot`) limited strictly to the linked client's non-draft invoices, non-draft contracts, and client-safe milestones. Internal client notes, cost rates, unrelated clients, API configs, audit logs, and workflow triggers are never included.

## 4. Hybrid RAG Injection Guardrails (`src/ai/rag/retrieval.ts`)

- Retrieved query inputs and indexed text strip directive injection preambles (`system override`, `ignore [all] previous|prior instructions`, `disregard ...`, `bypass all rules`) via `INJECTION_PREAMBLE_RE` so adversarial queries such as prompt-injection key exfiltration return `0` false matches instead of leaking or matching security canary content.
- Knowledge documents support `accessScope` (`workspace_all`, `internal_only`, `client_safe`), enforced prior to vector/keyword scoring.

## 5. Non-Destructive Backup Recovery Self-Test (`src/security/auditLogger.ts`)

- Triggered manually from `SecurityCenterView` (`Run Non-Destructive Backup Recovery Test`).
- Exports live workspace snapshot -> encrypts with Web Crypto `AES-GCM` using an ephemeral verification passphrase -> decrypts -> validates checksums and schema `v5` integrity -> logs a persisted `securityAuditLogs` record **without modifying live tables**.
