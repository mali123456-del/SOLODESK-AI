# SOLODESK AI — Privacy Model

## Data Sovereignty
- **Default State:** 100% of business data (clients, projects, tasks, proposals, quotations, contracts, invoices, payments, finance entries, time logs, Knowledge Hub notes, and workflow runs) remains inside the user's browser IndexedDB (`solodesk_ai_workspace`).
- **Telemetry:** Zero analytics scripts, zero tracking beacons, zero crash telemetry uploads.

## External Network Surfaces (Strict Opt-In)
1. **Google Fonts (`fonts.googleapis.com` / `fonts.gstatic.com`):** Cached locally by Workbox SW on first load; works cleanly with system fallback fonts if offline or blocked.
2. **Optional BYOK Gemini 4 Hydrogen (`@google/genai`):**
   - Inactive unless the user manually pastes a personal Gemini key into tab memory.
   - Sending local Knowledge Hub snippets or workspace summaries to Gemini requires checking the **External API Consent** box inside **AI Copilot** (`allowExternalContextTransmission`).
3. **Optional Single-URL Import (`Knowledge Hub -> Import Public URL`):** Fetches only a single user-specified public URL with `credentials: 'omit'`.

## User Controls
- **Export:** Full plain JSON or AES-256-GCM passphrase-encrypted backup anytime.
- **Persistent Storage Request:** Button in **Settings -> Privacy & Storage**.
- **Complete Erasure:** **Delete All Local Data** clears all 18 IndexedDB tables and volatile memory keys immediately.
