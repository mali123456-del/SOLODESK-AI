# SOLODESK AI — Dependency Security & License Audit

**Audit Date:** 2026-11-17  
**Package Manager / Lockfile:** `bun 1.4.4` with `/bun.lock` (single lockfile maintained; no duplicate `package-lock.json` generated).

## 1. Lockfile & Tooling Observations
- Running `npm audit` returns `ENOLOCK` because this repository uses `bun.lock` rather than `package-lock.json`.
- Per engineering policy, no second lockfile was generated and `npm audit fix --force` was not used.
- `bun pm scan` in Bun `1.4.4` requires a configured security scanner plugin in `bunfig.toml` and cannot run offline without an external registry scanner endpoint.

## 2. Verified License Audit (`bun pm licenses`)
Executed `bun pm licenses` against `/bun.lock`:
- **Total checked packages in lockfile:** `533` (`527` installed packages inspected across `13` license expressions; `6` optional platform packages skipped).
- **Verified license categories:** `MIT`, `Apache-2.0`, `BSD-3-Clause`, `BSD-2-Clause`, `ISC`, `CC0-1.0`, `MPL-2.0` (`lightningcss`, dual `MPL-2.0 OR Apache-2.0` on `dompurify`).
- **Copyleft / Proprietary Blockers:** `0` GPL/AGPL blockers found.

## 3. Core Runtime Dependencies & Attack Surface Review
| Package | Role | Exposure Scope | Remediation / Mitigation |
|---|---|---|---|
| `react` / `react-dom` (`19.3.1`) | UI rendering | Client browser | Auto-escaping JSX; no `dangerouslySetInnerHTML` on user text |
| `dexie` (`4.4.7`) | IndexedDB persistence | Local browser origin | Parameterized table indexes; Zod schema validation on write |
| `zod` (`4.6.7`) | Input & backup schema validation | Local browser | Strict schema parsing on forms, backups, tool args, manifests |
| `big.js` (`7.0.1`) | Financial rounding | Client domain math | No float drift on invoices, taxes, or profitability metrics |
| `jspdf` (`4.2.1`) & `dompurify` (`3.4.1`) | Invoice/Quotation/Report PDF export | Client PDF generation | Sanitized text inputs; generated client-side with no remote upload |
| `recharts` (`3.10.1`) | Dashboard & Report SVG charts | Client rendering | Driven purely by validated local IndexedDB totals |
| `@google/genai` (`2.7.0`) | Optional BYOK Gemini 4 Hydrogen SDK | Only invoked on explicit consent + active session key | Key stays strictly in module JS memory; disabled by default |
| `lucide-react` | UI icons | Static bundled SVGs | Tree-shaken build chunks (`0.15 KB–0.37 KB` per icon) |

## 4. Recommended Pre-Release CI Check
Before public production tagging on an internet-connected workstation or GitHub Actions runner:
1. Run `npm i --package-lock-only && npm audit --omit=dev && rm package-lock.json` (or configure an OSS Bun security scanner) to query live CVE advisories without altering runtime dependencies.
