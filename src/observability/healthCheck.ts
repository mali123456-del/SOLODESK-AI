import { db as defaultDb, getStorageHealth, type SolodeskDatabase } from '../database/db';

export interface OrphanDiagnostic {
  table: string;
  count: number;
  detail: string;
}

export interface DatabaseHealthReport {
  checkedAt: string;
  schemaVersion: number;
  status: 'healthy' | 'attention';
  storage: {
    supported: boolean;
    persisted: boolean;
    usageBytes: number | null;
    quotaBytes: number | null;
    usagePercent: number | null;
    highUsageWarning: boolean;
  };
  tableCounts: Record<string, number>;
  totalRecords: number;
  orphans: OrphanDiagnostic[];
  issues: string[];
}

export async function runDatabaseHealthCheck(
  database: SolodeskDatabase = defaultDb
): Promise<DatabaseHealthReport> {
  const [
    storage,
    clients,
    projects,
    tasks,
    proposals,
    quotations,
    contracts,
    invoices,
    payments,
    financeEntries,
    timeEntries,
    knowledgeDocs,
    documentChunks,
    templates,
    workflowRuns,
    serviceCatalog,
    appointments,
    workspaceGoals,
    activities,
    notifications,
    vaultFiles,
    clientPortalLinks,
    retainers,
    customWorkflows,
    webhooks,
    syncQueue,
    securityAuditLogs,
    savedViews,
  ] = await Promise.all([
    getStorageHealth(),
    database.clients.toArray(),
    database.projects.toArray(),
    database.tasks.toArray(),
    database.proposals.toArray(),
    database.quotations.toArray(),
    database.contracts.toArray(),
    database.invoices.toArray(),
    database.payments.toArray(),
    database.financeEntries.toArray(),
    database.timeEntries.toArray(),
    database.knowledgeDocs.toArray(),
    database.documentChunks.toArray(),
    database.templates.toArray(),
    database.workflowRuns.toArray(),
    database.serviceCatalog.toArray(),
    database.appointments.toArray(),
    database.workspaceGoals.toArray(),
    database.activities.toArray(),
    database.notifications.toArray(),
    database.vaultFiles.toArray(),
    database.clientPortalLinks.toArray(),
    database.retainers.toArray(),
    database.customWorkflows.toArray(),
    database.webhooks.toArray(),
    database.syncQueue.toArray(),
    database.securityAuditLogs.toArray(),
    database.savedViews.toArray(),
  ]);

  const clientIds = new Set(clients.map((c) => c.id));
  const projectIds = new Set(projects.map((p) => p.id));
  const taskIds = new Set(tasks.map((t) => t.id));
  const invoiceIds = new Set(invoices.map((i) => i.id));
  const docIds = new Set(knowledgeDocs.map((d) => d.id));

  const orphans: OrphanDiagnostic[] = [];
  const check = (table: string, count: number, detail: string) => {
    if (count > 0) orphans.push({ table, count, detail });
  };

  check(
    'projects',
    projects.filter((p) => !clientIds.has(p.clientId)).length,
    'Project(s) referencing a missing clientId'
  );
  check(
    'tasks',
    tasks.filter((t) => (t.projectId && !projectIds.has(t.projectId)) || (t.clientId && !clientIds.has(t.clientId))).length,
    'Task(s) referencing a missing project or client'
  );
  check(
    'invoices',
    invoices.filter((i) => !clientIds.has(i.clientId) || (i.projectId && !projectIds.has(i.projectId))).length,
    'Invoice(s) referencing a missing client or project'
  );
  check(
    'payments',
    payments.filter((p) => !invoiceIds.has(p.invoiceId)).length,
    'Payment(s) referencing a missing invoiceId'
  );
  check(
    'timeEntries',
    timeEntries.filter((t) => (t.projectId && !projectIds.has(t.projectId)) || (t.taskId && !taskIds.has(t.taskId))).length,
    'Time entry/entries referencing a missing project or task'
  );
  check(
    'documentChunks',
    documentChunks.filter((c) => !docIds.has(c.documentId)).length,
    'Knowledge chunk(s) referencing a missing KnowledgeDocument'
  );
  check(
    'appointments',
    appointments.filter(
      (a) => (a.clientId && !clientIds.has(a.clientId)) || (a.projectId && !projectIds.has(a.projectId))
    ).length,
    'Appointment(s) referencing a missing client or project'
  );

  const usagePercent =
    storage.usageBytes !== null && storage.quotaBytes && storage.quotaBytes > 0
      ? Number(((storage.usageBytes / storage.quotaBytes) * 100).toFixed(2))
      : null;
  const highUsageWarning = usagePercent !== null && usagePercent >= 80;

  const issues: string[] = [];
  if (highUsageWarning) {
    issues.push(`IndexedDB usage is at ${usagePercent}% of browser quota.`);
  }
  if (!storage.persisted && storage.supported) {
    issues.push('Browser storage is best-effort; request persistent storage and keep offline JSON backups.');
  }
  for (const o of orphans) {
    issues.push(`${o.table}: ${o.count} ${o.detail}`);
  }

  const tableCounts: Record<string, number> = {
    clients: clients.length,
    projects: projects.length,
    tasks: tasks.length,
    proposals: proposals.length,
    quotations: quotations.length,
    contracts: contracts.length,
    invoices: invoices.length,
    payments: payments.length,
    financeEntries: financeEntries.length,
    timeEntries: timeEntries.length,
    knowledgeDocs: knowledgeDocs.length,
    documentChunks: documentChunks.length,
    templates: templates.length,
    workflowRuns: workflowRuns.length,
    serviceCatalog: serviceCatalog.length,
    appointments: appointments.length,
    workspaceGoals: workspaceGoals.length,
    activities: activities.length,
    notifications: notifications.length,
    vaultFiles: vaultFiles.length,
    clientPortalLinks: clientPortalLinks.length,
    retainers: retainers.length,
    customWorkflows: customWorkflows.length,
    webhooks: webhooks.length,
    syncQueue: syncQueue.length,
    securityAuditLogs: securityAuditLogs.length,
    savedViews: savedViews.length,
  };

  const totalRecords = Object.values(tableCounts).reduce((acc, n) => acc + n, 0);

  return {
    checkedAt: new Date().toISOString(),
    schemaVersion: database.verno,
    status: orphans.length > 0 || highUsageWarning ? 'attention' : 'healthy',
    storage: {
      ...storage,
      usagePercent,
      highUsageWarning,
    },
    tableCounts,
    totalRecords,
    orphans,
    issues,
  };
}
