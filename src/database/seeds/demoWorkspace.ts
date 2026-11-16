import { addDaysToDateStr, todayDateStr } from '../../domain/calculations/dates';
import type { SolodeskDatabase } from '../db';
import { db as defaultDb } from '../db';
import { DexieSolodeskRepositories } from '../repositories/dexieRepositories';

export async function ensureBuiltInTemplates(database: SolodeskDatabase = defaultDb): Promise<void> {
  const existingCount = await database.templates.count();
  if (existingCount > 0) return;

  const repo = new DexieSolodeskRepositories(database);
  const builtIns = [
    {
      id: 'tpl_builtin_proposal_web',
      kind: 'proposal' as const,
      name: 'Web Application & UI/UX Delivery Proposal',
      description: 'Structured scope, phased milestones, and clear deliverables for software/design projects.',
      content:
        'Overview:\nWe propose designing and building a responsive, maintainable web application tailored to your operational goals.\n\nScope of Work:\n1. Discovery & Information Architecture\n2. UI/UX Component System & Responsive Views\n3. Core Implementation, Validation & Testing\n4. Deployment Handover & Documentation',
      isBuiltIn: true,
    },
    {
      id: 'tpl_builtin_contract_msa',
      kind: 'contract' as const,
      name: 'Independent Freelance Services Agreement (Template)',
      description: 'Editable service agreement template covering scope, payment schedule, IP, and termination.',
      content:
        'NOTE: This is an editable template for convenience and does not constitute legal advice.\n\n1. Services & Deliverables: Freelancer agrees to deliver the agreed project scope.\n2. Compensation & Schedule: Fees are payable per issued invoice terms.\n3. Intellectual Property: Final deliverables transfer upon full payment.\n4. Revisions & Change Requests: Out-of-scope requests are quoted separately.\n5. Termination: Either party may terminate with 14 days written notice for completed work.',
      isBuiltIn: true,
    },
    {
      id: 'tpl_builtin_email_followup',
      kind: 'email' as const,
      name: 'Polite Invoice Follow-Up Email',
      description: 'Friendly reminder for upcoming or slightly overdue invoices.',
      content:
        'Subject: Friendly reminder: Invoice [INVOICE_NUMBER]\n\nHi [CLIENT_NAME],\n\nI hope your week is going well. This is a quick reminder regarding Invoice [INVOICE_NUMBER] for [AMOUNT], which fell due on [DUE_DATE].\n\nPlease let me know if you need the PDF re-sent or have any questions.\n\nBest regards,\n[YOUR_NAME]',
      isBuiltIn: true,
    },
  ];

  for (const tpl of builtIns) {
    await repo.saveTemplate(tpl);
  }
}

export async function seedDemoWorkspace(database: SolodeskDatabase = defaultDb): Promise<void> {
  const repo = new DexieSolodeskRepositories(database);
  await ensureBuiltInTemplates(database);

  const settings = await repo.getSettings();
  if (settings.demoDataActive) return;

  const existingClients = await repo.listClients();
  if (existingClients.some((c) => c.isDemo)) {
    await repo.saveSettings({ demoDataActive: true, onboardingCompleted: true });
    return;
  }

  const today = todayDateStr();
  const clientA = await repo.createClient({
    name: '[Demo] Ayesha Siddiqui',
    company: 'Crescent Commerce Studio',
    email: 'ayesha.demo@example.invalid',
    phone: '+92 300 0000101',
    website: 'https://example.invalid',
    location: 'Lahore, Pakistan',
    status: 'active',
    category: 'E-Commerce',
    tags: ['Demo', 'Web App', 'Retainer'],
    notes: 'Sample demo client record. Safe to archive or clear anytime.',
    isDemo: true,
  });

  const clientB = await repo.createClient({
    name: '[Demo] Daniel Mercer',
    company: 'Northbridge Logistics',
    email: 'daniel.demo@example.invalid',
    phone: '+1 555 010 2299',
    website: 'https://example.invalid',
    location: 'Toronto, Canada',
    status: 'active',
    category: 'Consulting',
    tags: ['Demo', 'SaaS'],
    notes: 'Sample demo client for testing quotations and partial payments.',
    isDemo: true,
  });

  const projectA = await repo.createProject({
    clientId: clientA.id,
    name: '[Demo] Storefront Performance Overhaul',
    description: 'Sample project tracking checkout speed, design cleanup, and QA.',
    status: 'active',
    priority: 'high',
    startDate: addDaysToDateStr(today, -14),
    dueDate: addDaysToDateStr(today, 18),
    budget: 2400,
    agreedValue: 2600,
    currency: settings.defaultCurrency,
    hourlyRate: 60,
    progress: 65,
    milestones: [
      { id: 'ms_1', title: 'Audit & UX Wireframes', dueDate: addDaysToDateStr(today, -5), completed: true },
      { id: 'ms_2', title: 'Checkout Rebuild', dueDate: addDaysToDateStr(today, 7), completed: false },
    ],
    notes: 'Sample project milestones.',
    isDemo: true,
  });

  const projectB = await repo.createProject({
    clientId: clientB.id,
    name: '[Demo] Operations Portal Design',
    description: 'Sample project for dispatch reporting dashboard.',
    status: 'planning',
    priority: 'medium',
    startDate: today,
    dueDate: addDaysToDateStr(today, 30),
    budget: 1800,
    agreedValue: 1800,
    currency: settings.defaultCurrency,
    hourlyRate: 55,
    progress: 20,
    milestones: [
      { id: 'ms_3', title: 'Discovery Workshop', dueDate: addDaysToDateStr(today, 5), completed: false },
    ],
    notes: '',
    isDemo: true,
  });

  await repo.createTask({
    projectId: projectA.id,
    clientId: clientA.id,
    title: '[Demo] Optimize cart drawer state transitions',
    description: 'Reduce unnecessary re-renders during quantity updates.',
    status: 'in_progress',
    priority: 'high',
    dueDate: addDaysToDateStr(today, 3),
    tags: ['Demo', 'Frontend'],
    subtasks: [
      { id: 'st_1', title: 'Profile render tree', done: true },
      { id: 'st_2', title: 'Memoize summary totals', done: false },
    ],
    completedAt: '',
    isDemo: true,
  });

  await repo.createTask({
    projectId: projectB.id,
    clientId: clientB.id,
    title: '[Demo] Finalize component color contrast audit',
    description: 'Ensure WCAG AA compliance across light and dark surfaces.',
    status: 'todo',
    priority: 'medium',
    dueDate: addDaysToDateStr(today, -2),
    tags: ['Demo', 'Accessibility'],
    subtasks: [],
    completedAt: '',
    isDemo: true,
  });

  await repo.createProposal({
    clientId: clientB.id,
    projectId: projectB.id,
    title: '[Demo] Phase 2 Analytics & Dispatch Proposal',
    overview: 'Delivering live shipment visibility and exportable operational summaries.',
    scopeOfWork: 'Information architecture, accessible data tables, CSV export workflows.',
    deliverables: ['Interactive Prototype', 'Production Web Modules', 'Test Suite'],
    timeline: '4 Weeks',
    pricingAmount: 1800,
    currency: settings.defaultCurrency,
    terms: '50% upfront, 50% on final delivery.',
    validUntil: addDaysToDateStr(today, 21),
    status: 'sent',
    isDemo: true,
  });

  await repo.createQuotation({
    clientId: clientB.id,
    projectId: projectB.id,
    title: '[Demo] Portal UI & Reporting Quote',
    issueDate: addDaysToDateStr(today, -3),
    expiryDate: addDaysToDateStr(today, 14),
    currency: settings.defaultCurrency,
    lineItems: [
      { id: 'ql_1', description: 'UI Architecture & Design System', quantity: 1, unitPrice: 950 },
      { id: 'ql_2', description: 'Reporting Views & CSV Export', quantity: 1, unitPrice: 850 },
    ],
    discountType: 'none',
    discountValue: 0,
    taxRate: 0,
    taxInclusive: false,
    subtotal: 1800,
    discountAmount: 0,
    taxAmount: 0,
    total: 1800,
    notes: 'Sample quotation ready for one-click conversion to invoice.',
    status: 'accepted',
    convertedInvoiceId: '',
    isDemo: true,
  });

  const inv1 = await repo.createInvoice({
    clientId: clientA.id,
    projectId: projectA.id,
    quotationId: '',
    issueDate: addDaysToDateStr(today, -12),
    dueDate: addDaysToDateStr(today, 5),
    currency: settings.defaultCurrency,
    lineItems: [
      { id: 'il_1', description: 'Performance Audit & Wireframes', quantity: 1, unitPrice: 1200 },
      { id: 'il_2', description: 'Checkout Component Implementation', quantity: 10, unitPrice: 60 },
    ],
    discountType: 'none',
    discountValue: 0,
    taxRate: 0,
    taxInclusive: false,
    subtotal: 1800,
    discountAmount: 0,
    taxAmount: 0,
    total: 1800,
    notes: 'Sample invoice with partial payment recorded.',
    paymentInstructions: 'Bank transfer to Demo Account.',
    status: 'sent',
    isDemo: true,
  });

  await repo.recordPayment({
    invoiceId: inv1.id,
    clientId: clientA.id,
    amount: 900,
    currency: settings.defaultCurrency,
    paymentDate: addDaysToDateStr(today, -6),
    method: 'bank_transfer',
    reference: 'DEMO-TXN-9001',
    notes: '50% deposit recorded in sample workspace.',
    isDemo: true,
  });

  await repo.createFinanceEntry({
    type: 'expense',
    category: 'Software & Hosting',
    amount: 45,
    currency: settings.defaultCurrency,
    date: addDaysToDateStr(today, -4),
    clientId: '',
    projectId: projectA.id,
    invoiceId: '',
    paymentId: '',
    description: '[Demo] Staging Domain & Cloud DNS',
    notes: 'Sample expense record.',
    isDemo: true,
  });

  await repo.createManualTimeEntry({
    projectId: projectA.id,
    taskId: '',
    description: '[Demo] Checkout bundle optimization & profiling',
    startTime: new Date(Date.now() - 7200_000).toISOString(),
    endTime: new Date(Date.now() - 1800_000).toISOString(),
    durationSeconds: 5400,
    hourlyRate: 60,
    billable: true,
    isDemo: true,
  });

  await repo.saveSettings({
    demoDataActive: true,
    onboardingCompleted: true,
  });
}

export async function clearDemoWorkspaceData(
  database: SolodeskDatabase = defaultDb
): Promise<void> {
  await database.transaction(
    'rw',
    [
      database.clients,
      database.projects,
      database.tasks,
      database.proposals,
      database.quotations,
      database.contracts,
      database.invoices,
      database.payments,
      database.financeEntries,
      database.timeEntries,
      database.appSettings,
    ],
    async () => {
      const tables = [
        database.clients,
        database.projects,
        database.tasks,
        database.proposals,
        database.quotations,
        database.contracts,
        database.invoices,
        database.payments,
        database.financeEntries,
        database.timeEntries,
      ];
      for (const tbl of tables) {
        const all = await tbl.toArray();
        const demoIds = all
          .filter((r) => (r as { isDemo?: boolean }).isDemo === true)
          .map((r) => (r as { id: string }).id);
        if (demoIds.length > 0) {
          await tbl.bulkDelete(demoIds);
        }
      }
      const settings = await database.appSettings.get('default');
      if (settings) {
        await database.appSettings.put({
          ...settings,
          demoDataActive: false,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  );
}
