# Invoice Management, Tax & Payment Terms Guide

## Decimal-Safe Document Calculation Rules
1. **Line Totals**: `quantity * unitPrice` rounded half-up to currency decimals (0 decimals for JPY/KRW, 2 for USD/PKR/EUR/GBP, 3 for KWD/BHD/OMR).
2. **Discounts**: Applied as fixed value (capped at subtotal) or percentage prior to final tax extraction.
3. **Tax Exclusive vs Tax Inclusive**:
   - **Tax Exclusive**: `tax = netSubtotal * (taxRate / 100)`, `total = netSubtotal + tax`.
   - **Tax Inclusive**: `net = discountedSubtotal / (1 + taxRate / 100)`, `tax = discountedSubtotal - net`, preserving exact gross total.
4. **Partial Payments**: Balance due equals `invoice.total - sum(payments)`. Status moves automatically: `sent` -> `partially_paid` -> `paid`.

## Invoice Aging Buckets & Follow-Up Cadence
- **Current (Not Yet Due)**: Send PDF clearly listing payment instructions and invoice number.
- **1–30 Days Past Due**: Send polite day-3 and day-14 reminder emails attaching the invoice PDF.
- **31–60 Days Past Due**: Escalate with a direct call/appointment and pause optional out-of-scope work until balance clears.
- **61+ Days Past Due**: Issue formal final notice and review contract late-payment remedies.
