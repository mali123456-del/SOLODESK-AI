# SOLODESK AI — Service & Repository Contracts

Because SOLODESK AI runs as a local-first PWA without a mandatory backend server, internal module boundaries serve as typed contracts (`src/database/repositories/interfaces.ts` and domain service modules) so future optional cloud sync or backend adapters can swap cleanly behind the repository boundary.

## Key Service Boundaries

### 1. Repository Interface (`ISolodeskRepositories`)
- **Location:** `src/database/repositories/interfaces.ts`
- **Implementation:** `DexieSolodeskRepositories` (`src/database/repositories/dexieRepositories.ts`)
- **Guarantees:** Schema validation via Zod, atomic transactions, typed errors (`ValidationError`, `NotFoundError`, `ConflictError`, `ReferentialIntegrityError`, `StorageQuotaError` in `src/core/errors.ts`), and FK checks.

### 2. Import & Backup Services
- `importClientsFromCsvText(csvText, repo)` (`src/services/importService.ts`): Bounded at 2,000 rows, validates row schemas, skips duplicates by email/name, returns `{ totalRows, importedCount, skippedDuplicateCount, skippedInvalidCount, errors }`.
- `createBackupPayload()`, `inspectBackupText(raw, passphrase?)`, `restoreBackupPayload(payload, mode)` (`src/services/backupService.ts`): Schema-versioned (`v3`) backup export, PBKDF2-SHA256 (210k default, backward-compatible via stored `iterations`) + AES-GCM encryption, pre-restore snapshot, and unique invoice `&number` collision renaming on `merge`.

### 3. Observability & Health Check
- `runDatabaseHealthCheck(database?)` (`src/observability/healthCheck.ts`): Returns non-destructive table counts, orphaned foreign-key diagnostics across 6 relationships, schema version, and `navigator.storage.estimate()` utilization.

### 4. AI, RAG & Approval-Gated Workflows
- `AIProvider` (`src/ai/providers/AIProvider.ts`): Common contract implemented by `GeminiProvider` (`gemini-4-hydrogen`) and `MockProvider` (offline deterministic templates). Configured via `AI_PROVIDER_REGISTRY` (`src/ai/providers/registry.ts`).
- `executeAllowlistedTool(toolName, rawArgs)` (`src/ai/agent/tools.ts`): Read/write tools validated against Zod schemas and `TOOL_PERMISSION_MAP`.
- `previewProposalWorkflow(proposalId)` & `executeProposalWorkflowWithApproval(proposalId, approved)` (`src/workflows/workflowEngine.ts`): Preview + explicit approval gate + duplicate-execution guard via `workflowRuns`.

### 5. Controlled URL Importer
- `fetchAndPreviewUrlForKnowledge(rawUrl)` (`src/integrations/crawler/urlImporter.ts`): Enforces SSRF URL policy (`validatePublicHttpUrl`), `robots.txt` rules, 10s timeout, 512 KB cap, content-type allowlist, post-redirect SSRF check, and HTML script stripping (`stripHtmlToSafeText`).
