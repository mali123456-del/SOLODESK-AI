import Big from 'big.js';

export type DiscountType = 'none' | 'percentage' | 'fixed';

export interface LineItemInput {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface DocumentPricingInput {
  lineItems: LineItemInput[];
  discountType: DiscountType;
  discountValue: number;
  taxRate: number; // percentage e.g. 16 for 16%
  taxInclusive: boolean;
}

export interface DocumentTotalsResult {
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  total: number;
}

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  { code: 'PKR', name: 'Pakistani Rupee', symbol: 'PKR ', decimals: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham', symbol: 'AED ', decimals: 2 },
  { code: 'SAR', name: 'Saudi Riyal', symbol: 'SAR ', decimals: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimals: 2 },
];

export function getCurrencyDecimals(currencyCode: string): number {
  return SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode)?.decimals ?? 2;
}

function toBig(value: number | string | Big): Big {
  if (value instanceof Big) return value;
  const num = typeof value === 'string' ? value.trim() : value;
  if (num === '' || num === null || num === undefined || Number.isNaN(Number(num))) {
    return new Big(0);
  }
  return new Big(num);
}

export function roundMoney(value: number | string | Big, decimals = 2): number {
  const b = toBig(value);
  return Number(b.round(decimals, Big.roundHalfUp).toFixed(decimals));
}

export function addMoney(...values: Array<number | string | Big>): number {
  let sum = new Big(0);
  for (const v of values) {
    sum = sum.plus(toBig(v));
  }
  return roundMoney(sum, 2);
}

export function subtractMoney(a: number | string | Big, b: number | string | Big): number {
  return roundMoney(toBig(a).minus(toBig(b)), 2);
}

export function multiplyMoney(a: number | string | Big, b: number | string | Big): number {
  return roundMoney(toBig(a).times(toBig(b)), 2);
}

export function calculateLineItemTotal(quantity: number, unitPrice: number, decimals = 2): number {
  const q = toBig(Math.max(0, Number.isFinite(quantity) ? quantity : 0));
  const p = toBig(Math.max(0, Number.isFinite(unitPrice) ? unitPrice : 0));
  return roundMoney(q.times(p), decimals);
}

export function calculateDocumentTotals(
  input: DocumentPricingInput,
  decimals = 2
): DocumentTotalsResult {
  let subtotalBig = new Big(0);
  for (const item of input.lineItems) {
    const lineTotal = toBig(calculateLineItemTotal(item.quantity, item.unitPrice, decimals));
    subtotalBig = subtotalBig.plus(lineTotal);
  }
  const subtotal = roundMoney(subtotalBig, decimals);

  let discountBig = new Big(0);
  const rawDiscountVal = Math.max(0, Number.isFinite(input.discountValue) ? input.discountValue : 0);
  if (input.discountType === 'percentage') {
    const clampedPct = Math.min(100, rawDiscountVal);
    discountBig = subtotalBig.times(toBig(clampedPct)).div(100);
  } else if (input.discountType === 'fixed') {
    discountBig = toBig(rawDiscountVal);
    if (discountBig.gt(subtotalBig)) {
      discountBig = subtotalBig;
    }
  }
  const discountAmount = roundMoney(discountBig, decimals);
  const afterDiscountBig = subtotalBig.minus(toBig(discountAmount));

  const safeTaxRate = Math.max(0, Math.min(100, Number.isFinite(input.taxRate) ? input.taxRate : 0));
  const rateBig = toBig(safeTaxRate).div(100);

  if (safeTaxRate === 0) {
    const finalAmt = roundMoney(afterDiscountBig, decimals);
    return {
      subtotal,
      discountAmount,
      taxableAmount: finalAmt,
      taxAmount: 0,
      total: finalAmt,
    };
  }

  if (input.taxInclusive) {
    // Gross after discount already includes tax: net = gross / (1 + rate), tax = gross - net
    const total = roundMoney(afterDiscountBig, decimals);
    const netBig = toBig(total).div(new Big(1).plus(rateBig));
    const taxableAmount = roundMoney(netBig, decimals);
    const taxAmount = roundMoney(toBig(total).minus(toBig(taxableAmount)), decimals);
    return {
      subtotal,
      discountAmount,
      taxableAmount,
      taxAmount,
      total,
    };
  }

  // Tax-exclusive
  const taxableAmount = roundMoney(afterDiscountBig, decimals);
  const taxAmount = roundMoney(toBig(taxableAmount).times(rateBig), decimals);
  const total = roundMoney(toBig(taxableAmount).plus(toBig(taxAmount)), decimals);

  return {
    subtotal,
    discountAmount,
    taxableAmount,
    taxAmount,
    total,
  };
}

export function calculatePaymentSummary(
  invoiceTotal: number,
  paymentAmounts: number[],
  decimals = 2
): { paidAmount: number; balanceDue: number; isFullyPaid: boolean; isPartiallyPaid: boolean } {
  let paidBig = new Big(0);
  for (const amt of paymentAmounts) {
    if (Number.isFinite(amt) && amt > 0) {
      paidBig = paidBig.plus(toBig(amt));
    }
  }
  const totalBig = toBig(Math.max(0, invoiceTotal));
  const paidAmount = roundMoney(paidBig, decimals);
  const rawBalance = totalBig.minus(toBig(paidAmount));
  const balanceDue = rawBalance.lte(0) ? 0 : roundMoney(rawBalance, decimals);

  return {
    paidAmount,
    balanceDue,
    isFullyPaid: totalBig.gt(0) && balanceDue === 0,
    isPartiallyPaid: paidAmount > 0 && balanceDue > 0,
  };
}

export function formatMoney(amount: number, currencyCode = 'USD'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: getCurrencyDecimals(currencyCode),
      maximumFractionDigits: getCurrencyDecimals(currencyCode),
    }).format(safe);
  } catch {
    const symbol = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode)?.symbol ?? `${currencyCode} `;
    return `${symbol}${safe.toFixed(2)}`;
  }
}
