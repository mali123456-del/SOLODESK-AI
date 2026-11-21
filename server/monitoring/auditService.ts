import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { scrubSensitiveData } from './telemetry';

export const AUDIT_EVENT_TYPES = [
  'AUTH_LOGIN_SUCCESS',
  'AUTH_LOGIN_FAILURE',
  'AUTH_LOGOUT',
  'WORKSPACE_CREATED',
  'WORKSPACE_RENAMED',
  'WORKSPACE_DELETED',
  'MEMBER_INVITED',
  'MEMBER_ROLE_UPDATED',
  'SECURITY_SETTING_CHANGED',
  'DATA_EXPORTED',
  'BACKUP_CREATED',
  'BACKUP_RESTORED',
  'WEBHOOK_CREATED',
  'WEBHOOK_ROTATED',
  'VOICE_NOTE_CREATED',
  'VOICE_NOTE_DELETED',
  'INTEGRATION_UPDATED',
  'BILLING_EVENT_PROCESSED',
  'AI_GENERATED',
  'ACCOUNT_DELETED',
  'PROPOSAL_UPDATED',
  'CONTRACT_UPDATED',
  'PRIVACY_CONSENT_UPDATED',
  'WORKFLOW_EXECUTED',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface ServerAuditLogEntry {
  id: string;
  workspaceId: string;
  actorUserId: string;
  eventType: string;
  severity: 'info' | 'warning' | 'critical';
  outcome: 'success' | 'failure' | 'denied';
  resourceType: string;
  resourceId: string;
  detail: string;
  metadataJson: string;
  createdAt: string;
}

const AUDIT_EXTRA_SENSITIVE_KEY_RE = /(gemini|session_?token|bearer|refresh_?token|private_?key|webhook_?secret)/i;

function scrubAuditMetadataDeep(value: unknown): unknown {
  const baseScrubbed = scrubSensitiveData(value);
  if (Array.isArray(baseScrubbed)) {
    return baseScrubbed.slice(0, 25).map(scrubAuditMetadataDeep);
  }
  if (baseScrubbed && typeof baseScrubbed === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(baseScrubbed as Record<string, unknown>)) {
      if (AUDIT_EXTRA_SENSITIVE_KEY_RE.test(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = scrubAuditMetadataDeep(v);
      }
    }
    return out;
  }
  if (typeof baseScrubbed === 'string' && baseScrubbed.length > 400) {
    return `${baseScrubbed.slice(0, 400)}...`;
  }
  return baseScrubbed;
}

export function sanitizeAuditMetadata(metadata: unknown): string {
  try {
    const cleaned = scrubAuditMetadataDeep(metadata ?? {});
    const json = JSON.stringify(cleaned);
    if (!json) return '{}';
    return json.length > 2048 ? `${json.slice(0, 2040)}...` : json;
  } catch {
    return '{}';
  }
}

export function writeAuditEvent(
  db: DatabaseSync,
  input: {
    workspaceId: string;
    actorUserId?: string;
    eventType: string;
    severity?: 'info' | 'warning' | 'critical';
    outcome?: 'success' | 'failure' | 'denied';
    resourceType?: string;
    resourceId?: string;
    detail: string;
    metadata?: Record<string, unknown>;
  }
): ServerAuditLogEntry {
  const id = `aud_${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();
  const severity = input.severity ?? 'info';
  const outcome = input.outcome ?? 'success';
  const actorUserId = input.actorUserId?.trim() || 'system';
  const resourceType = (input.resourceType ?? '').slice(0, 80);
  const resourceId = (input.resourceId ?? '').slice(0, 120);
  const detail = String(scrubSensitiveData(input.detail)).slice(0, 500);
  const metadataJson = sanitizeAuditMetadata(input.metadata ?? {});

  db.prepare(
    `INSERT INTO audit_logs (
       id, workspace_id, actor_user_id, event_type, severity, detail,
       resource_type, resource_id, outcome, metadata_json, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.workspaceId,
    actorUserId,
    input.eventType,
    severity,
    detail,
    resourceType,
    resourceId,
    outcome,
    metadataJson,
    createdAt
  );

  return {
    id,
    workspaceId: input.workspaceId,
    actorUserId,
    eventType: input.eventType,
    severity,
    outcome,
    resourceType,
    resourceId,
    detail,
    metadataJson,
    createdAt,
  };
}

export function queryAuditLogs(
  db: DatabaseSync,
  input: {
    workspaceId: string;
    eventType?: string;
    outcome?: string;
    severity?: string;
    resourceType?: string;
    actorUserId?: string;
    from?: string;
    to?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }
): { rows: ServerAuditLogEntry[]; total: number } {
  const where: string[] = ['workspace_id = ?'];
  const params: Array<string | number> = [input.workspaceId];

  if (input.eventType && input.eventType !== 'all') {
    where.push('event_type = ?');
    params.push(input.eventType);
  }
  if (input.outcome && input.outcome !== 'all') {
    where.push('outcome = ?');
    params.push(input.outcome);
  }
  if (input.severity && input.severity !== 'all') {
    where.push('severity = ?');
    params.push(input.severity);
  }
  if (input.resourceType && input.resourceType !== 'all') {
    where.push('resource_type = ?');
    params.push(input.resourceType);
  }
  if (input.actorUserId) {
    where.push('actor_user_id = ?');
    params.push(input.actorUserId);
  }
  if (input.from) {
    where.push('created_at >= ?');
    params.push(input.from);
  }
  if (input.to) {
    where.push('created_at <= ?');
    params.push(input.to);
  }
  if (input.search?.trim()) {
    const q = `%${input.search.trim().toLowerCase()}%`;
    where.push('(LOWER(detail) LIKE ? OR LOWER(event_type) LIKE ? OR LOWER(resource_id) LIKE ?)');
    params.push(q, q, q);
  }

  const whereSql = where.join(' AND ');
  const totalRow = db
    .prepare(`SELECT COUNT(*) AS count FROM audit_logs WHERE ${whereSql}`)
    .get(...params) as { count: number };

  const limit = Math.max(1, Math.min(200, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);

  const rows = db
    .prepare(
      `SELECT id, workspace_id AS workspaceId, actor_user_id AS actorUserId,
              event_type AS eventType, severity, outcome,
              resource_type AS resourceType, resource_id AS resourceId,
              detail, metadata_json AS metadataJson, created_at AS createdAt
       FROM audit_logs
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as unknown as ServerAuditLogEntry[];

  return { rows, total: totalRow.count };
}

function escapeCsvCellSafe(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR)
  const neutralized = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

export function formatAuditLogsCsv(rows: ServerAuditLogEntry[]): string {
  const headers = [
    'id',
    'createdAt',
    'eventType',
    'severity',
    'outcome',
    'actorUserId',
    'resourceType',
    'resourceId',
    'detail',
    'metadataJson',
  ];
  const headerLine = headers.map((h) => escapeCsvCellSafe(h)).join(',');
  const lines = rows.map((row) =>
    [
      row.id,
      row.createdAt,
      row.eventType,
      row.severity,
      row.outcome,
      row.actorUserId,
      row.resourceType,
      row.resourceId,
      row.detail,
      row.metadataJson,
    ]
      .map((cell) => escapeCsvCellSafe(cell))
      .join(',')
  );
  return [headerLine, ...lines].join('\r\n');
}

export function purgeExpiredAuditLogs(
  db: DatabaseSync,
  workspaceId: string,
  retentionDays: number
): { deletedCount: number } {
  const safeDays = Math.max(7, Math.min(3650, Math.floor(retentionDays)));
  const cutoffIso = new Date(Date.now() - safeDays * 86_400_000).toISOString();
  const result = db
    .prepare('DELETE FROM audit_logs WHERE workspace_id = ? AND created_at < ?')
    .run(workspaceId, cutoffIso);
  return { deletedCount: Number(result.changes ?? 0) };
}
