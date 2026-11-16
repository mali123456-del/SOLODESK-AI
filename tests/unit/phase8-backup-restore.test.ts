import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import {
  createBackupPayload,
  decryptBackupJson,
  encryptBackupJson,
  inspectBackupText,
  restoreBackupPayload,
} from '../../src/services/backupService';

async function clearDb() {
  await db.transaction(
    'rw',
    [db.clients, db.projects, db.invoices, db.payments, db.financeEntries, db.activities, db.appSettings],
    async () => {
      await Promise.all([
        db.clients.clear(),
        db.projects.clear(),
        db.invoices.clear(),
        db.payments.clear(),
        db.financeEntries.clear(),
        db.activities.clear(),
        db.appSettings.clear(),
      ]);
    }
  );
}

describe('Phase 8: Backup, Encryption & Restore Safety', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('exports and restores a full workspace roundtrip accurately without leaking API keys', async () => {
    const client = await repositories.createClient({
      name: 'Backup Client',
      company: 'Roundtrip Co',
      email: 'backup@roundtrip.example',
      phone: '',
      website: '',
      location: 'Karachi',
      status: 'active',
      category: 'Web',
      tags: ['VIP'],
      notes: '',
      isDemo: false,
    });

    await repositories.createInvoice({
      number: 'INV-BK-01',
      clientId: client.id,
      projectId: '',
      quotationId: '',
      issueDate: '2026-11-01',
      dueDate: '2026-11-20',
      currency: 'USD',
      lineItems: [{ id: 'li_1', description: 'Sprint', quantity: 1, unitPrice: 800 }],
      discountType: 'none',
      discountValue: 0,
      taxRate: 0,
      taxInclusive: false,
      subtotal: 800,
      discountAmount: 0,
      taxAmount: 0,
      total: 800,
      notes: '',
      paymentInstructions: '',
      status: 'sent',
      isDemo: false,
    });

    const payload = await createBackupPayload();
    const raw = JSON.stringify(payload);
    expect(raw).not.toMatch(/AIza/);
    expect(payload.recordCounts.clients).toBe(1);
    expect(payload.recordCounts.invoices).toBe(1);

    await clearDb();
    expect(await repositories.listClients()).toHaveLength(0);

    const inspected = await inspectBackupText(raw);
    expect(inspected.requiresPassphrase).toBe(false);
    expect(inspected.payload).toBeDefined();

    await restoreBackupPayload(inspected.payload!, 'replace');
    const restoredClients = await repositories.listClients();
    const restoredInvoices = await repositories.listInvoices();
    expect(restoredClients).toHaveLength(1);
    expect(restoredClients[0].name).toBe('Backup Client');
    expect(restoredInvoices).toHaveLength(1);
    expect(restoredInvoices[0].number).toBe('INV-BK-01');
  });

  it('encrypts and decrypts backups with AES-GCM and rejects wrong passphrases', async () => {
    await repositories.createClient({
      name: 'Secret Client',
      company: '',
      email: '',
      phone: '',
      website: '',
      location: '',
      status: 'active',
      category: 'General',
      tags: [],
      notes: '',
      isDemo: false,
    });

    const payload = await createBackupPayload();
    const plain = JSON.stringify(payload);
    const encrypted = await encryptBackupJson(plain, 'StrongPass!2026');

    expect(encrypted).not.toContain('Secret Client');

    const promptCheck = await inspectBackupText(encrypted);
    expect(promptCheck.requiresPassphrase).toBe(true);

    await expect(decryptBackupJson(encrypted, 'WrongPass')).rejects.toThrow(/Invalid passphrase/i);

    const verified = await inspectBackupText(encrypted, 'StrongPass!2026');
    expect(verified.payload?.data.clients[0].name).toBe('Secret Client');
  });

  it('rejects malformed or invalid schema JSON backups safely', async () => {
    await expect(inspectBackupText('{not valid json')).rejects.toThrow(/not valid JSON/i);
    await expect(inspectBackupText('{"format":"wrong","data":{}}')).rejects.toThrow();
  });
});
