# Changelog

## v1.0.0 — Local-First Freelancer Business Workspace & PWA
- Built Dexie IndexedDB v2 schema, Zod entity validation, `big.js` monetary math, and repository abstraction.
- Implemented Dashboard, Activity Feed, Notifications, Clients, Projects, Tasks (List + Kanban), Proposals, Quotations (with atomic invoice conversion), Contracts, Invoices (print + `jsPDF`), Payments, Income, Expenses, Profitability, Financial Reports, Templates, Global Search, and Command Palette (`Ctrl+K`).
- Added persistent Time Tracker with running-timer recovery from IndexedDB.
- Built JSON Backup & Restore with conflict inspection, pre-restore safety snapshot, and optional Web Crypto AES-256-GCM passphrase encryption.
- Added Local Knowledge Hub (`.txt`/`.md`/`.json`/`.csv` chunking & offline RAG citations) and optional BYOK Gemini 4 Hydrogen AI Copilot with explicit consent and approval-gated write actions.
- Added standalone PWA manifest, PNG icons, Workbox offline precaching, and in-app install prompt.
- Added Settings (`Profile`, `Appearance`, `Localization`, `AI`, `Backup`, `Privacy`, `About`) and honest `Product & Pricing Overview` page.
