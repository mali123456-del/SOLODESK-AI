# Security, Privacy & Disclaimers

## Local-First Storage Model
- All client, project, task, document, payment, finance, time, and knowledge records stay inside your browser's **IndexedDB** (`solodesk_ai_workspace`).
- SOLODESK AI collects **zero analytics telemetry** and requires no remote server.

## Gemini BYOK Key Handling
- Optional Gemini API keys are stored **strictly in volatile JavaScript memory** (`src/ai/providers/providerFactory.ts`).
- Keys are **never** written to `localStorage`, `sessionStorage`, IndexedDB, URL parameters, console logs, or JSON backups.
- Reloading or closing the browser tab clears the session key.
- Browser-side BYOK means you should never enter API keys on shared or untrusted devices.
- When a Gemini key is active, Copilot requires explicit user consent before sending workspace summaries or Knowledge Hub snippets to the external Gemini API.

## Backup Encryption
- Optional passphrase encryption in **Backup & Restore** uses standard browser Web Crypto APIs (`PBKDF2-SHA256`, 150,000 iterations, random salt & IV, `AES-256-GCM`).
- Passphrases are never stored. Forgetting a backup passphrase makes an encrypted `.json` archive unrecoverable.

## Legal & Financial Disclaimers
- Invoices, profitability metrics, and tax summaries are informational workspace estimates—not certified accounting or tax filings.
- Contract templates are convenience starting points—not legal advice.
