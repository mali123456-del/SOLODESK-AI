# SOLODESK AI — Phase 14 Risk Register

| ID | Risk Description | Likelihood | Impact | Mitigation Implemented | Residual Status |
|---|---|---|---|---|---|
| **R-01** | Browser IndexedDB cleared by user/OS storage eviction | Medium | High | `requestPersistentBrowserStorage()` on boot, storage usage telemetry in `SettingsView`, encrypted PBKDF2/AES-GCM JSON export & restore | Mitigated (User export still required) |
| **R-02** | Cross-origin restrictions (CORS) block fetching external public URLs directly in browser | High | Medium | Honest UX guidance suggesting local `.md`/`.txt` download & import; zero misleading bypass claims | Known Browser Limitation |
| **R-03** | Prompt injection embedded in imported files or public web pages | Medium | High | `wrapUntrustedContextSnippet()` delimiter wrapping, HTML tag stripping (`<script>`, `<iframe>`, `<svg>`), approval-gated `proposed_action` execution, and Case #11 benchmark check | Mitigated |
| **R-04** | Silent IndexedDB write failure or confusion while offline | Medium | Medium | `syncEvents` telemetry + `WorkspaceProvider` online/offline listeners + header `Offline · Local DB`, `Syncing DB…`, and `Local DB Sync Failed` with `Retry` | Mitigated |
| **R-05** | Transitive dependency vulnerability without lockfile audit | Low | Medium | Documented `bun.lock` inventory + `bun pm licenses` (527 packages / 13 permissive/MPL licenses); scheduled security advisory check on CI with network access | Open Advisory Check (`bun pm scan` requires custom scanner config) |
| **R-06** | Recharts & Tailwind requiring `style-src 'unsafe-inline'` in CSP | Low | Low | Strictly enforced `script-src 'self'`, `object-src 'none'`, `base-uri 'self'` so inline CSS cannot execute JavaScript | Accepted Trade-off |
| **R-07** | Multi-word out-of-scope RAG queries matching a single generic stop-term | Low | Medium | Added minimum 2-term overlap floor for 5+ term queries in `src/ai/rag/retrieval.ts` (`0%` unsupported FP across benchmark negative cases) | Mitigated |
