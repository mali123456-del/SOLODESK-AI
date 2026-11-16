import React from 'react';
import { ArchiveRestore, Download } from 'lucide-react';
import { Button, Card, CardHeader, PageHeader, useToast } from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { buildCsvContent, downloadTextFile } from '../../export/csvUtils';
import { BackupRestoreView } from './BackupRestoreView';

export const ImportExportView: React.FC = () => {
  const { clients, invoices, financeEntries, timeEntries } = useWorkspace();
  const { pushToast } = useToast();

  const exportAllCsv = (kind: 'clients' | 'invoices' | 'finance' | 'time') => {
    const date = new Date().toISOString().slice(0, 10);
    if (kind === 'clients') {
      const csv = buildCsvContent(
        ['Name', 'Company', 'Email', 'Phone', 'Location', 'Status', 'Category'],
        clients.map((c) => [c.name, c.company, c.email, c.phone, c.location, c.status, c.category])
      );
      downloadTextFile(`solodesk-clients-${date}.csv`, csv);
    } else if (kind === 'invoices') {
      const csv = buildCsvContent(
        ['Number', 'Issue Date', 'Due Date', 'Status', 'Currency', 'Total', 'Paid', 'Balance Due'],
        invoices.map((i) => [
          i.number,
          i.issueDate,
          i.dueDate,
          i.status,
          i.currency,
          i.total,
          i.amountPaid,
          i.balanceDue,
        ])
      );
      downloadTextFile(`solodesk-invoices-${date}.csv`, csv);
    } else if (kind === 'finance') {
      const csv = buildCsvContent(
        ['Date', 'Type', 'Category', 'Description', 'Amount', 'Currency'],
        financeEntries.map((f) => [f.date, f.type, f.category, f.description, f.amount, f.currency])
      );
      downloadTextFile(`solodesk-finance-${date}.csv`, csv);
    } else {
      const csv = buildCsvContent(
        ['Start Time', 'Description', 'Seconds', 'Hourly Rate', 'Billable'],
        timeEntries.map((t) => [t.startTime, t.description, t.durationSeconds, t.hourlyRate, t.billable])
      );
      downloadTextFile(`solodesk-time-${date}.csv`, csv);
    }
    pushToast({ tone: 'success', title: `Exported ${kind} CSV` });
  };

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Import & Export"
          description="Export clean RFC 4180 CSV spreadsheets or manage full JSON workspace backups."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <Card className="space-y-3">
            <CardHeader title="Clients CSV" description={`${clients.length} records`} />
            <Button
              size="sm"
              variant="outline"
              disabled={clients.length === 0}
              onClick={() => exportAllCsv('clients')}
              icon={<Download className="w-3.5 h-3.5" />}
            >
              Export Clients
            </Button>
          </Card>
          <Card className="space-y-3">
            <CardHeader title="Invoices CSV" description={`${invoices.length} records`} />
            <Button
              size="sm"
              variant="outline"
              disabled={invoices.length === 0}
              onClick={() => exportAllCsv('invoices')}
              icon={<Download className="w-3.5 h-3.5" />}
            >
              Export Invoices
            </Button>
          </Card>
          <Card className="space-y-3">
            <CardHeader title="Finance CSV" description={`${financeEntries.length} records`} />
            <Button
              size="sm"
              variant="outline"
              disabled={financeEntries.length === 0}
              onClick={() => exportAllCsv('finance')}
              icon={<Download className="w-3.5 h-3.5" />}
            >
              Export Finance
            </Button>
          </Card>
          <Card className="space-y-3">
            <CardHeader title="Timesheets CSV" description={`${timeEntries.length} records`} />
            <Button
              size="sm"
              variant="outline"
              disabled={timeEntries.length === 0}
              onClick={() => exportAllCsv('time')}
              icon={<ArchiveRestore className="w-3.5 h-3.5" />}
            >
              Export Time Logs
            </Button>
          </Card>
        </div>
      </div>

      <BackupRestoreView />
    </div>
  );
};
