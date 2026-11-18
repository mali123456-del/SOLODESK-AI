import { repositories } from '../database/repositories/dexieRepositories';
import {
  createBackupPayload,
  decryptBackupJson,
  encryptBackupJson,
  inspectBackupText,
} from '../services/backupService';
import type { SecurityAuditLog } from '../domain/schemas/entities';

export async function recordSecurityAudit(input: {
  eventType: string;
  severity?: SecurityAuditLog['severity'];
  detail: string;
  actor?: string;
}): Promise<SecurityAuditLog> {
  return repositories.logSecurityEvent({
    eventType: input.eventType,
    severity: input.severity ?? 'info',
    actor: input.actor ?? 'local-owner',
    detail: input.detail,
  });
}

export interface BackupVerificationReport {
  verifiedAt: string;
  ok: boolean;
  recordCount: number;
  encryptedRoundtripOk: boolean;
  schemaVersion: number;
  message: string;
}

/**
 * Performs a non-destructive backup export + AES-GCM encryption/decryption + schema inspection roundtrip
 * without overwriting live IndexedDB workspace tables.
 */
export async function runBackupRecoverySelfTest(): Promise<BackupVerificationReport> {
  const payload = await createBackupPayload();
  const plainJson = JSON.stringify(payload);
  const testPassphrase = `verify-${Date.now()}`;
  const encrypted = await encryptBackupJson(plainJson, testPassphrase);
  const decrypted = await decryptBackupJson(encrypted, testPassphrase);
  const inspected = await inspectBackupText(decrypted);

  const totalCount = Object.values(payload.recordCounts).reduce((s, n) => s + n, 0);
  const ok = !inspected.requiresPassphrase && Boolean(inspected.payload) && decrypted === plainJson;

  await recordSecurityAudit({
    eventType: 'backup_self_test',
    severity: ok ? 'info' : 'warning',
    detail: ok
      ? `Verified backup export & AES-GCM roundtrip (${totalCount} records, schema v${payload.schemaVersion}).`
      : 'Backup verification roundtrip reported a mismatch.',
  });

  return {
    verifiedAt: new Date().toISOString(),
    ok,
    recordCount: totalCount,
    encryptedRoundtripOk: ok,
    schemaVersion: payload.schemaVersion,
    message: ok
      ? `Verified ${totalCount} records across schema v${payload.schemaVersion} with AES-GCM roundtrip integrity.`
      : 'Verification failed.',
  };
}
