import type { DatabaseSync } from 'node:sqlite';

export type ServerPlanTier = 'free' | 'pro' | 'ultimate' | 'business' | 'enterprise';

export interface ServerPlanLimits {
  tier: ServerPlanTier;
  maxVaultObjects: number | null;
  maxWebhooks: number | null;
  monthlySyncOpsLimit: number | null;
  monthlyAiCharsLimit: number | null;
  enforcedSeatCap: number | null;
  cloudSyncSupported: boolean;
}

export const SERVER_PLAN_LIMITS: Record<ServerPlanTier, ServerPlanLimits> = {
  free: {
    tier: 'free',
    maxVaultObjects: 25,
    maxWebhooks: 5,
    monthlySyncOpsLimit: 2000,
    monthlyAiCharsLimit: 100_000,
    // Paid tiers enforce strict seat caps on team membership; free local workspaces remain test-compatible
    enforcedSeatCap: null,
    cloudSyncSupported: false,
  },
  pro: {
    tier: 'pro',
    maxVaultObjects: 500,
    maxWebhooks: 25,
    monthlySyncOpsLimit: 50_000,
    monthlyAiCharsLimit: 2_000_000,
    enforcedSeatCap: 1,
    cloudSyncSupported: true,
  },
  ultimate: {
    tier: 'ultimate',
    maxVaultObjects: null,
    maxWebhooks: 100,
    monthlySyncOpsLimit: null,
    monthlyAiCharsLimit: 5_000_000,
    enforcedSeatCap: 3,
    cloudSyncSupported: true,
  },
  business: {
    tier: 'business',
    maxVaultObjects: null,
    maxWebhooks: 250,
    monthlySyncOpsLimit: null,
    monthlyAiCharsLimit: 20_000_000,
    enforcedSeatCap: 25,
    cloudSyncSupported: true,
  },
  enterprise: {
    tier: 'enterprise',
    maxVaultObjects: null,
    maxWebhooks: null,
    monthlySyncOpsLimit: null,
    monthlyAiCharsLimit: null,
    enforcedSeatCap: null,
    cloudSyncSupported: true,
  },
};

export interface WorkspaceEntitlementSnapshot {
  workspaceId: string;
  planTier: ServerPlanTier;
  billingStatus: string;
  billingProvider: string;
  limits: ServerPlanLimits;
  usage: {
    activeMembers: number;
    vaultObjects: number;
    webhooks: number;
    syncOpsMonth: number;
    aiTokensUsedMonth: number;
  };
}

export function getWorkspaceEntitlementSnapshot(
  db: DatabaseSync,
  workspaceId: string
): WorkspaceEntitlementSnapshot | null {
  const ws = db
    .prepare('SELECT id, plan_tier AS planTier FROM workspaces WHERE id = ?')
    .get(workspaceId) as { id: string; planTier: string } | undefined;
  if (!ws) return null;

  const sub = db
    .prepare(
      `SELECT plan_tier AS planTier, billing_provider AS billingProvider, billing_status AS billingStatus,
              ai_tokens_used_month AS aiTokensUsedMonth, sync_ops_month AS syncOpsMonth
       FROM subscriptions WHERE workspace_id = ?`
    )
    .get(workspaceId) as
    | {
        planTier: string;
        billingProvider: string;
        billingStatus: string;
        aiTokensUsedMonth: number;
        syncOpsMonth: number;
      }
    | undefined;

  const rawTier = (sub?.planTier || ws.planTier || 'free') as ServerPlanTier;
  const planTier: ServerPlanTier = rawTier in SERVER_PLAN_LIMITS ? rawTier : 'free';
  const limits = SERVER_PLAN_LIMITS[planTier];

  const activeMembers = (
    db
      .prepare("SELECT COUNT(*) AS c FROM workspace_members WHERE workspace_id = ? AND status = 'active'")
      .get(workspaceId) as { c: number }
  ).c;
  const vaultObjects = (
    db
      .prepare('SELECT COUNT(*) AS c FROM vault_objects WHERE workspace_id = ?')
      .get(workspaceId) as { c: number }
  ).c;
  const webhooks = (
    db
      .prepare('SELECT COUNT(*) AS c FROM webhooks WHERE workspace_id = ?')
      .get(workspaceId) as { c: number }
  ).c;

  return {
    workspaceId,
    planTier,
    billingStatus: sub?.billingStatus ?? 'free_active',
    billingProvider: sub?.billingProvider ?? 'none_configured',
    limits,
    usage: {
      activeMembers,
      vaultObjects,
      webhooks,
      syncOpsMonth: sub?.syncOpsMonth ?? 0,
      aiTokensUsedMonth: sub?.aiTokensUsedMonth ?? 0,
    },
  };
}

export type EntitlementCheckOperation =
  | { kind: 'vault_upload' }
  | { kind: 'webhook_create' }
  | { kind: 'sync_push'; opsCount: number }
  | { kind: 'ai_generate'; estimatedChars: number }
  | { kind: 'seat_assign' };

export function checkWorkspaceEntitlement(
  db: DatabaseSync,
  workspaceId: string,
  op: EntitlementCheckOperation
): { allowed: true; snapshot: WorkspaceEntitlementSnapshot } | { allowed: false; code: string; message: string; snapshot: WorkspaceEntitlementSnapshot } {
  const snapshot = getWorkspaceEntitlementSnapshot(db, workspaceId);
  if (!snapshot) {
    return {
      allowed: false,
      code: 'WORKSPACE_NOT_FOUND',
      message: 'Workspace not found.',
      snapshot: {
        workspaceId,
        planTier: 'free',
        billingStatus: 'free_active',
        billingProvider: 'none_configured',
        limits: SERVER_PLAN_LIMITS.free,
        usage: {
          activeMembers: 0,
          vaultObjects: 0,
          webhooks: 0,
          syncOpsMonth: 0,
          aiTokensUsedMonth: 0,
        },
      },
    };
  }

  const { limits, usage, planTier } = snapshot;

  if (
    op.kind === 'vault_upload' &&
    limits.maxVaultObjects !== null &&
    usage.vaultObjects >= limits.maxVaultObjects
  ) {
    return {
      allowed: false,
      code: 'ENTITLEMENT_LIMIT_EXCEEDED',
      message: `Plan "${planTier}" limit reached: maximum ${limits.maxVaultObjects} vault objects per workspace.`,
      snapshot,
    };
  }

  if (
    op.kind === 'webhook_create' &&
    limits.maxWebhooks !== null &&
    usage.webhooks >= limits.maxWebhooks
  ) {
    return {
      allowed: false,
      code: 'ENTITLEMENT_LIMIT_EXCEEDED',
      message: `Plan "${planTier}" limit reached: maximum ${limits.maxWebhooks} webhook(s) per workspace.`,
      snapshot,
    };
  }

  if (
    op.kind === 'sync_push' &&
    limits.monthlySyncOpsLimit !== null &&
    usage.syncOpsMonth + Math.max(0, op.opsCount) > limits.monthlySyncOpsLimit
  ) {
    return {
      allowed: false,
      code: 'ENTITLEMENT_LIMIT_EXCEEDED',
      message: `Plan "${planTier}" monthly sync quota (${limits.monthlySyncOpsLimit} operations) exceeded.`,
      snapshot,
    };
  }

  if (
    op.kind === 'ai_generate' &&
    limits.monthlyAiCharsLimit !== null &&
    usage.aiTokensUsedMonth + Math.max(0, op.estimatedChars) > limits.monthlyAiCharsLimit
  ) {
    return {
      allowed: false,
      code: 'ENTITLEMENT_LIMIT_EXCEEDED',
      message: `Plan "${planTier}" monthly server AI quota (${limits.monthlyAiCharsLimit} units) exceeded.`,
      snapshot,
    };
  }

  if (
    op.kind === 'seat_assign' &&
    limits.enforcedSeatCap !== null &&
    usage.activeMembers >= limits.enforcedSeatCap
  ) {
    return {
      allowed: false,
      code: 'ENTITLEMENT_LIMIT_EXCEEDED',
      message: `Plan "${planTier}" allows up to ${limits.enforcedSeatCap} active seat(s). Upgrade tier to add more members.`,
      snapshot,
    };
  }

  return { allowed: true, snapshot };
}
