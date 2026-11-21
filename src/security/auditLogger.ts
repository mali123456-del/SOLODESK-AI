import { repositories } from '../database/repositories/dexieRepositories';
import {
  createBackupPayload,
  decryptBackupJson,
  encryptBackupJson,
  inspectBackupText,
} from '../services/backupService';
import type { AuditEvent, AuditEventType, SecurityAuditLog } from '../domain/schemas/entities';

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

export async function recordStructuredAudit(input: {
  eventType: AuditEventType;
  action: string;
  resourceType: string;
  resourceId?: string;
  outcome?: 'success' | 'failure';
  severity?: 'info' | 'warning' | 'critical';
  detail: string;
  metadata?: Record<string, unknown>;
}): Promise<AuditEvent> {
  return repositories.recordAuditEvent({
    eventType: input.eventType,
    actorId: 'local-owner',
    actorEmail: 'owner@local.workspace',
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? '',
    outcome: input.outcome ?? 'success',
    correlationId: `aud_${Date.now().toString(36)}`,
    severity: input.severity ?? 'info',
    detail: input.detail,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : '{}',
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
  await recordStructuredAudit({
    eventType: 'BACKUP_CREATED',
    action: 'backup.self_test',
    resourceType: 'backup',
    outcome: ok ? 'success' : 'failure',
    severity: ok ? 'info' : 'warning',
    detail: ok
      ? `Verified encrypted backup roundtrip (${totalCount} records, v${payload.schemaVersion}).`
      : 'Encrypted backup roundtrip mismatch.',
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
