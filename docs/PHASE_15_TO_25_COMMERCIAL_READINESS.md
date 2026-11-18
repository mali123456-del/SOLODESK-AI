# SOLODESK AI — Commercial Readiness, Localization & Entitlements (Phase 25)

**Updated:** 2026-11-17

## 1. Multi-Language UI & RTL Support (`src/i18n/translations.ts`)

- Built-in dictionary coverage for **English (`en`, LTR)**, **Arabic (`ar`, RTL)**, **Spanish (`es`, LTR)**, **French (`fr`, LTR)**, and **German (`de`, LTR)**.
- Switching to `ar` or toggling RTL dynamically updates `document.documentElement.dir = 'rtl'`, verified across Settings (`SettingsView.tsx`), Help/Localization preview (`HelpPlansTourView.tsx`), and automated unit tests (`phase15-25-features.test.tsx`).

## 2. Brand Accent Customization

- Users can switch workspace accent themes (`#2563EB` Cobalt, `#059669` Emerald, `#D97706` Amber, `#7C3AED` Violet, `#0F172A` Slate) and dark/light modes via `ThemeContext` (`src/app/providers/ThemeProvider.tsx`), persisted locally without external fonts or theme servers.

## 3. Plan Entitlement Model (`src/services/entitlementService.ts`)

Four structured capability profiles (`PLAN_ENTITLEMENTS`) let solo operators and studios evaluate workspace usage (`evaluateUsageAgainstPlan`) against quota presets:
- **Solo Free (`free`):** `$0 / local` — Up to 15 clients, 10 active projects, 25 Vault files, full Client Portal, Custom Workflows, and Multi-Currency.
- **Pro Freelancer (`pro`):** `$12 / mo (Config Preview)` — Up to 200 clients, 100 active projects, 500 Vault files, Sync Adapter toggle.
- **Ultimate Studio (`ultimate`):** `$29 / mo (Config Preview)` — Unlimited records.
- **Business / Small Agency (`business`):** `$49 / mo (Config Preview)` — Unlimited records + RBAC permission profiles & audit log export.

> **Honest Billing Boundary:** Paid subscription checkout (Stripe/Paddle/merchant webhook verification) is **NOT CONFIGURED IN STATIC MVP**. Plan tiers act strictly as local quota evaluation & preview configuration without locking out core offline IndexedDB workflows.

## 4. Onboarding Tour, Keyboard Shortcuts & Marketing Overview

- **Interactive 6-Step Guided Tour (`HelpPlansTourView.tsx`):** Covers Daily Digest, Focus Mode, Client Portal, Project Planning, Document Vault/Security, and Hybrid RAG v2.
- **Global Keyboard Shortcuts Modal (`KeyboardShortcutsModal.tsx`):** Accessible anywhere via `?` or header button, pairing with `Ctrl/Cmd + K` command palette and `Esc` to exit Focus Mode or close dialogs.
