# Phase 43 — Finance, Invoicing & Accounting Precision

- **Modules:** `src/domain/finance/`, `src/features/invoices/`, `src/features/payments/`, `src/features/finance/`, `src/features/retainers/`.
- **Monetary Guarantees (`big.js`):**
  - Line-item subtotal, percentage/fixed discount, tax-exclusive & tax-inclusive computation, `ROUND_HALF_UP` minor-unit rounding, partial payments, and refund reversals.
  - Duplicate invoice number (`&number`) uniqueness and payment overpayment rollback protection.
  - Historical invoices snapshot currency and rates at write time.
  - Recurring retainers and live Profit/Loss & What-If Scenario Simulator calculated from persisted Dexie entries.
- **Verification:** Covered in `tests/unit/phase2-database-money.test.ts` and `tests/unit/phase6-payments-finance-time.test.tsx`.
