import { formatDisplayDate, type DateFormatPreference } from '../domain/calculations/dates';
import { calculateLineItemTotal, formatMoney } from '../domain/calculations/money';
import type {
  BusinessProfile,
  Client,
  Contract,
  Invoice,
  LineItem,
  Proposal,
  Quotation,
} from '../domain/schemas/entities';

interface PdfHeaderMeta {
  docType: string;
  number: string;
  issueDate: string;
  secondaryDateLabel?: string;
  secondaryDate?: string;
  status: string;
}

async function createDoc() {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ unit: 'pt', format: 'a4' });
}

function drawHeader(
  doc: Awaited<ReturnType<typeof createDoc>>,
  profile: BusinessProfile | null,
  client: Client | undefined,
  meta: PdfHeaderMeta,
  dateFormat: DateFormatPreference
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  let y = 48;

  // Brand bar
  doc.setFillColor(16, 24, 39);
  doc.rect(0, 0, pageWidth, 8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(profile?.businessName || 'SOLODESK Workspace', margin, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.text(meta.docType.toUpperCase(), pageWidth - margin, y, { align: 'right' });

  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);

  const bizLines: string[] = [];
  if (profile?.ownerName) bizLines.push(profile.ownerName);
  if (profile?.email) bizLines.push(profile.email);
  if (profile?.phone) bizLines.push(profile.phone);
  if (profile?.address) bizLines.push(profile.address);
  if (profile?.taxIdLabel) bizLines.push(`Tax ID: ${profile.taxIdLabel}`);

  let leftY = y;
  for (const line of bizLines) {
    const wrapped = doc.splitTextToSize(line, 250) as string[];
    doc.text(wrapped, margin, leftY);
    leftY += wrapped.length * 13;
  }

  let rightY = y;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`No: ${meta.number}`, pageWidth - margin, rightY, { align: 'right' });
  rightY += 14;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text(`Date: ${formatDisplayDate(meta.issueDate, dateFormat)}`, pageWidth - margin, rightY, {
    align: 'right',
  });
  rightY += 14;
  if (meta.secondaryDateLabel && meta.secondaryDate) {
    doc.text(
      `${meta.secondaryDateLabel}: ${formatDisplayDate(meta.secondaryDate, dateFormat)}`,
      pageWidth - margin,
      rightY,
      { align: 'right' }
    );
    rightY += 14;
  }
  doc.text(`Status: ${meta.status.replace('_', ' ').toUpperCase()}`, pageWidth - margin, rightY, {
    align: 'right',
  });
  rightY += 14;

  y = Math.max(leftY, rightY) + 18;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('PREPARED FOR', margin, y);
  y += 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(client?.name || 'Client', margin, y);
  y += 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  const clientLines = [client?.company, client?.email, client?.phone, client?.location].filter(
    Boolean
  ) as string[];
  for (const line of clientLines) {
    doc.text(line, margin, y);
    y += 13;
  }

  return y + 14;
}

function ensureSpace(
  doc: Awaited<ReturnType<typeof createDoc>>,
  currentY: number,
  needed: number
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (currentY + needed > pageHeight - 54) {
    doc.addPage();
    return 52;
  }
  return currentY;
}

function drawLineItemsTable(
  doc: Awaited<ReturnType<typeof createDoc>>,
  startY: number,
  lineItems: LineItem[],
  currency: string,
  totals: {
    subtotal: number;
    discountAmount: number;
    taxRate: number;
    taxInclusive: boolean;
    taxAmount: number;
    total: number;
    amountPaid?: number;
    balanceDue?: number;
  }
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 44;
  let y = ensureSpace(doc, startY, 60);

  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageWidth - margin * 2, 24, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('DESCRIPTION', margin + 8, y + 15);
  doc.text('QTY', pageWidth - margin - 180, y + 15, { align: 'right' });
  doc.text('UNIT PRICE', pageWidth - margin - 95, y + 15, { align: 'right' });
  doc.text('AMOUNT', pageWidth - margin - 8, y + 15, { align: 'right' });
  y += 30;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);

  for (const item of lineItems) {
    const descLines = doc.splitTextToSize(item.description, 255) as string[];
    const rowH = Math.max(20, descLines.length * 13 + 8);
    y = ensureSpace(doc, y, rowH + 10);

    doc.text(descLines, margin + 8, y + 11);
    doc.text(String(item.quantity), pageWidth - margin - 180, y + 11, { align: 'right' });
    doc.text(formatMoney(item.unitPrice, currency), pageWidth - margin - 95, y + 11, {
      align: 'right',
    });
    const lineTotal = calculateLineItemTotal(item.quantity, item.unitPrice);
    doc.text(formatMoney(lineTotal, currency), pageWidth - margin - 8, y + 11, {
      align: 'right',
    });

    y += rowH;
    doc.setDrawColor(241, 245, 249);
    doc.line(margin, y - 3, pageWidth - margin, y - 3);
  }

  y += 12;
  y = ensureSpace(doc, y, 100);
  const labelX = pageWidth - margin - 140;
  const valX = pageWidth - margin - 8;

  const addTotalRow = (label: string, val: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 11 : 9.5);
    doc.setTextColor(bold ? 15 : 71, bold ? 23 : 85, bold ? 42 : 105);
    doc.text(label, labelX, y, { align: 'right' });
    doc.text(val, valX, y, { align: 'right' });
    y += bold ? 18 : 15;
  };

  addTotalRow('Subtotal', formatMoney(totals.subtotal, currency));
  if (totals.discountAmount > 0) {
    addTotalRow('Discount', `-${formatMoney(totals.discountAmount, currency)}`);
  }
  if (totals.taxRate > 0) {
    addTotalRow(
      `Tax (${totals.taxRate}%${totals.taxInclusive ? ' incl.' : ''})`,
      formatMoney(totals.taxAmount, currency)
    );
  }
  addTotalRow('Total', formatMoney(totals.total, currency), true);

  if (typeof totals.amountPaid === 'number' && totals.amountPaid > 0) {
    addTotalRow('Amount Paid', formatMoney(totals.amountPaid, currency));
    addTotalRow('Balance Due', formatMoney(totals.balanceDue ?? 0, currency), true);
  }

  return y;
}

export async function generateInvoicePdf(
  invoice: Invoice,
  client: Client | undefined,
  profile: BusinessProfile | null,
  dateFormat: DateFormatPreference
): Promise<void> {
  const doc = await createDoc();
  const margin = 44;
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = drawHeader(
    doc,
    profile,
    client,
    {
      docType: 'Invoice',
      number: invoice.number,
      issueDate: invoice.issueDate,
      secondaryDateLabel: 'Due Date',
      secondaryDate: invoice.dueDate,
      status: invoice.status,
    },
    dateFormat
  );

  y = drawLineItemsTable(doc, y, invoice.lineItems, invoice.currency, {
    subtotal: invoice.subtotal,
    discountAmount: invoice.discountAmount,
    taxRate: invoice.taxRate,
    taxInclusive: invoice.taxInclusive,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    amountPaid: invoice.amountPaid,
    balanceDue: invoice.balanceDue,
  });

  if (invoice.paymentInstructions || invoice.notes || profile?.invoiceFooterNote) {
    y = ensureSpace(doc, y + 14, 70);
    doc.setFontSize(9);
    if (invoice.paymentInstructions) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Payment Instructions', margin, y);
      y += 13;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const lines = doc.splitTextToSize(invoice.paymentInstructions, pageWidth - margin * 2) as string[];
      doc.text(lines, margin, y);
      y += lines.length * 12 + 10;
    }
    if (invoice.notes) {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text('Notes', margin, y);
      y += 13;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      const lines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2) as string[];
      doc.text(lines, margin, y);
      y += lines.length * 12 + 10;
    }
    if (profile?.invoiceFooterNote) {
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 116, 139);
      doc.text(profile.invoiceFooterNote, margin, y + 8);
    }
  }

  doc.save(`${invoice.number}.pdf`);
}

export async function generateQuotationPdf(
  quotation: Quotation,
  client: Client | undefined,
  profile: BusinessProfile | null,
  dateFormat: DateFormatPreference
): Promise<void> {
  const doc = await createDoc();
  const margin = 44;
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = drawHeader(
    doc,
    profile,
    client,
    {
      docType: 'Quotation',
      number: quotation.number,
      issueDate: quotation.issueDate,
      secondaryDateLabel: quotation.expiryDate ? 'Valid Until' : undefined,
      secondaryDate: quotation.expiryDate || undefined,
      status: quotation.status,
    },
    dateFormat
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(quotation.title, margin, y);
  y += 18;

  y = drawLineItemsTable(doc, y, quotation.lineItems, quotation.currency, {
    subtotal: quotation.subtotal,
    discountAmount: quotation.discountAmount,
    taxRate: quotation.taxRate,
    taxInclusive: quotation.taxInclusive,
    taxAmount: quotation.taxAmount,
    total: quotation.total,
  });

  if (quotation.notes) {
    y = ensureSpace(doc, y + 14, 48);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Terms & Notes', margin, y);
    y += 13;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    const lines = doc.splitTextToSize(quotation.notes, pageWidth - margin * 2) as string[];
    doc.text(lines, margin, y);
  }

  doc.save(`${quotation.number}.pdf`);
}

export async function generateProposalPdf(
  proposal: Proposal,
  client: Client | undefined,
  profile: BusinessProfile | null,
  dateFormat: DateFormatPreference
): Promise<void> {
  const doc = await createDoc();
  const margin = 44;
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = drawHeader(
    doc,
    profile,
    client,
    {
      docType: 'Proposal',
      number: proposal.number,
      issueDate: proposal.createdAt,
      secondaryDateLabel: proposal.validUntil ? 'Valid Until' : undefined,
      secondaryDate: proposal.validUntil || undefined,
      status: proposal.status,
    },
    dateFormat
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(proposal.title, margin, y);
  y += 22;

  const drawSection = (heading: string, body: string) => {
    if (!body.trim()) return;
    y = ensureSpace(doc, y, 48);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(37, 99, 235);
    doc.text(heading, margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(body, pageWidth - margin * 2) as string[];
    for (const line of lines) {
      y = ensureSpace(doc, y, 16);
      doc.text(line, margin, y);
      y += 13;
    }
    y += 10;
  };

  drawSection('Overview', proposal.overview);
  drawSection('Scope of Work', proposal.scopeOfWork);

  if (proposal.deliverables.length > 0) {
    drawSection(
      'Deliverables',
      proposal.deliverables.map((d, idx) => `${idx + 1}. ${d}`).join('\n')
    );
  }

  drawSection('Timeline', proposal.timeline);
  drawSection('Estimated Investment', formatMoney(proposal.pricingAmount, proposal.currency));
  drawSection('Terms', proposal.terms);

  doc.save(`${proposal.number}.pdf`);
}

export async function generateContractPdf(
  contract: Contract,
  client: Client | undefined,
  profile: BusinessProfile | null,
  dateFormat: DateFormatPreference
): Promise<void> {
  const doc = await createDoc();
  const margin = 44;
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = drawHeader(
    doc,
    profile,
    client,
    {
      docType: 'Service Contract',
      number: contract.number,
      issueDate: contract.effectiveDate || contract.createdAt,
      secondaryDateLabel: contract.acceptedAt ? 'Accepted' : undefined,
      secondaryDate: contract.acceptedAt || undefined,
      status: contract.status,
    },
    dateFormat
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(contract.title, margin, y);
  y += 22;

  for (const sec of contract.sections) {
    y = ensureSpace(doc, y, 48);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(15, 23, 42);
    doc.text(sec.heading, margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(sec.body, pageWidth - margin * 2) as string[];
    for (const line of lines) {
      y = ensureSpace(doc, y, 16);
      doc.text(line, margin, y);
      y += 13;
    }
    y += 10;
  }

  y = ensureSpace(doc, y + 18, 70);
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y + 26, margin + 200, y + 26);
  doc.line(pageWidth - margin - 200, y + 26, pageWidth - margin, y + 26);
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Provider: ${profile?.businessName || 'Service Provider'}`, margin, y + 38);
  doc.text(`Client: ${client?.name || 'Client'}`, pageWidth - margin - 200, y + 38);

  doc.setFontSize(8);
  doc.text(
    'Note: Template-based commercial agreement generated by SOLODESK AI. Not a substitute for qualified legal counsel.',
    margin,
    y + 62
  );

  doc.save(`${contract.number}.pdf`);
}

export async function generateFinancialSummaryPdf(input: {
  businessName: string;
  periodLabel: string;
  currency: string;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  outstandingReceivables: number;
  overdueAmount: number;
  rows: Array<{ label: string; income: number; expenses: number; net: number }>;
}): Promise<void> {
  const doc = await createDoc();
  const margin = 44;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 52;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(`${input.businessName || 'SOLODESK AI'} — Financial Summary`, margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Period: ${input.periodLabel} · Currency: ${input.currency}`, margin, y);
  y += 24;

  const metrics = [
    ['Recorded Income', formatMoney(input.totalIncome, input.currency)],
    ['Recorded Expenses', formatMoney(input.totalExpenses, input.currency)],
    ['Estimated Net Profit', formatMoney(input.netProfit, input.currency)],
    ['Outstanding Invoices', formatMoney(input.outstandingReceivables, input.currency)],
    ['Overdue Invoices', formatMoney(input.overdueAmount, input.currency)],
  ];

  for (const [k, v] of metrics) {
    doc.setFont('helvetica', 'bold');
    doc.text(k, margin, y);
    doc.setFont('helvetica', 'normal');
    doc.text(v, margin + 180, y);
    y += 16;
  }

  y += 14;
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, pageWidth - margin * 2, 22, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('MONTH', margin + 8, y + 14);
  doc.text('INCOME', pageWidth - margin - 180, y + 14, { align: 'right' });
  doc.text('EXPENSES', pageWidth - margin - 95, y + 14, { align: 'right' });
  doc.text('NET', pageWidth - margin - 8, y + 14, { align: 'right' });
  y += 28;

  doc.setFont('helvetica', 'normal');
  for (const row of input.rows) {
    y = ensureSpace(doc, y, 22);
    doc.text(row.label, margin + 8, y);
    doc.text(formatMoney(row.income, input.currency), pageWidth - margin - 180, y, {
      align: 'right',
    });
    doc.text(formatMoney(row.expenses, input.currency), pageWidth - margin - 95, y, {
      align: 'right',
    });
    doc.text(formatMoney(row.net, input.currency), pageWidth - margin - 8, y, {
      align: 'right',
    });
    y += 16;
  }

  y = ensureSpace(doc, y + 16, 30);
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Informational estimates derived from user-entered records. Not certified tax or accounting advice.',
    margin,
    y
  );

  doc.save(`solodesk-financial-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}
