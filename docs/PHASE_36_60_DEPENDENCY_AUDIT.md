# Phases 36–60 — Dependency Audit

Audited `package.json` prior to extending functionality: **zero unnecessary packages were added** during Phases 36–60.

## Runtime Dependencies
| Package | Version | Role & Assessment |
| :--- | :--- | :--- |
| `react` / `react-dom` | `^19.3.1` | Core UI runtime |
| `dexie` | `^4.4.7` | IndexedDB ORM with atomic `db.transaction` |
| `big.js` | `^7.0.1` | Exact decimal monetary arithmetic |
| `zod` | `^4.6.7` | Schema & API payload validation |
| `lucide-react` | `^1.73.0` | Tree-shakable UI icons |
| `recharts` | `^3.10.1` | Route-lazy analytics & BI visualizations |
| `jspdf` | `^4.2.1` | Client-side offline PDF invoice export |
| `express` | `^5.3.0` | Optional backend API (`server.ts`) |
| `@google/genai` | `^2.32.0` | Server-only Gemini adapter (`server/ai/geminiGateway.ts`) |
| `@opentelemetry/api` | `^1.10.0` | Lightweight span instrumentation |
| `tailwindcss` / `@tailwindcss/vite` | `^4.3.5` | Utility design tokens |
| `@axe-core/playwright` | `^4.14.0` | Automated WCAG runtime audit |

## Rejected Bloat Candidates
- Heavy WYSIWYG editors, unrequested ORMs over `node:sqlite`, Three.js/XR runtimes, and unrequested CSS component suites were excluded to preserve PWA performance on 8 GB RAM hardware.
