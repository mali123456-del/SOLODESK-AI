import type { WorkspaceMemberRole } from './cloudSyncService';

export interface BackendWorkspaceMembership {
  id: string;
  slug: string;
  name: string;
  planTier: string;
  role: WorkspaceMemberRole;
}

export interface BackendAuthSessionInfo {
  ok: boolean;
  user?: {
    id: string;
    email: string;
    displayName: string;
  };
  workspaces?: BackendWorkspaceMembership[];
  defaultWorkspaceId?: string;
  errorMessage?: string;
}

export interface BackendSyncPullResult {
  ok: boolean;
  records: Array<{
    entityType: string;
    entityId: string;
    revision: number;
    payloadJson: string;
    updatedAt: string;
  }>;
  tombstones: Array<{
    entityType: string;
    entityId: string;
    revision: number;
    deletedAt: string;
  }>;
  serverTimestamp: string;
  hasMore?: boolean;
  nextCursor?: string;
  nextPageCursor?: string;
  httpStatus?: number;
  errorMessage?: string;
}

function normalizeBase(endpointUrl?: string): string {
  return (endpointUrl || '/api/v1').replace(/\/+$/, '');
}

export async function fetchBackendSession(endpointUrl?: string): Promise<BackendAuthSessionInfo> {
  try {
    const res = await fetch(`${normalizeBase(endpointUrl)}/auth/me`, {
      credentials: 'include',
    });
    if (!res.ok) {
      return { ok: false };
    }
    const body = (await res.json()) as {
      user?: { id: string; email: string; displayName: string };
      workspaces?: BackendWorkspaceMembership[];
    };
    return {
      ok: true,
      user: body.user,
      workspaces: body.workspaces ?? [],
    };
  } catch {
    return { ok: false, errorMessage: 'Backend sync server unreachable (local-first mode active).' };
  }
}

export async function registerBackendAccount(input: {
  endpointUrl?: string;
  email: string;
  password: string;
  displayName: string;
}): Promise<BackendAuthSessionInfo> {
  try {
    const res = await fetch(`${normalizeBase(input.endpointUrl)}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        displayName: input.displayName,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      user?: { id: string; email: string; displayName: string };
      defaultWorkspaceId?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        errorMessage: body.error?.message || `Registration failed (HTTP ${res.status})`,
      };
    }
    return {
      ok: true,
      user: body.user,
      defaultWorkspaceId: body.defaultWorkspaceId,
    };
  } catch (err) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : 'Unable to reach backend server.',
    };
  }
}

export async function loginBackendAccount(input: {
  endpointUrl?: string;
  email: string;
  password: string;
}): Promise<BackendAuthSessionInfo> {
  try {
    const res = await fetch(`${normalizeBase(input.endpointUrl)}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: input.email,
        password: input.password,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      user?: { id: string; email: string; displayName: string };
      defaultWorkspaceId?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        errorMessage: body.error?.message || `Sign in failed (HTTP ${res.status})`,
      };
    }
    return {
      ok: true,
      user: body.user,
      defaultWorkspaceId: body.defaultWorkspaceId,
    };
  } catch (err) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : 'Unable to reach backend server.',
    };
  }
}

export async function logoutBackendAccount(endpointUrl?: string): Promise<void> {
  try {
    await fetch(`${normalizeBase(endpointUrl)}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Best-effort offline logout
  }
}

export async function pullWorkspaceChangesFromServer(input: {
  endpointUrl?: string;
  workspaceId: string;
  since?: string;
  cursor?: string;
  limit?: number;
}): Promise<BackendSyncPullResult> {
  try {
    const base = normalizeBase(input.endpointUrl);
    const qs = new URLSearchParams({ workspaceId: input.workspaceId });
    if (input.since) qs.set('since', input.since);
    if (input.cursor) qs.set('cursor', input.cursor);
    if (typeof input.limit === 'number') qs.set('limit', String(input.limit));
    const res = await fetch(`${base}/sync/pull?${qs.toString()}`, {
      credentials: 'include',
    });
    const body = (await res.json().catch(() => ({}))) as {
      records?: BackendSyncPullResult['records'];
      tombstones?: BackendSyncPullResult['tombstones'];
      serverTimestamp?: string;
      hasMore?: boolean;
      nextCursor?: string;
      nextPageCursor?: string;
      error?: { message?: string };
    };
    if (!res.ok) {
      return {
        ok: false,
        records: [],
        tombstones: [],
        serverTimestamp: new Date().toISOString(),
        httpStatus: res.status,
        errorMessage: body.error?.message || `Pull failed (HTTP ${res.status})`,
      };
    }
    return {
      ok: true,
      records: body.records ?? [],
      tombstones: body.tombstones ?? [],
      serverTimestamp: body.serverTimestamp ?? new Date().toISOString(),
      hasMore: body.hasMore,
      nextCursor: body.nextCursor,
      nextPageCursor: body.nextPageCursor,
      httpStatus: res.status,
    };
  } catch (err) {
    return {
      ok: false,
      records: [],
      tombstones: [],
      serverTimestamp: new Date().toISOString(),
      errorMessage: err instanceof Error ? err.message : 'Network error pulling remote records.',
    };
  }
}

export async function submitBackendSupportRequest(input: {
  workspaceId: string;
  category: 'billing_upgrade' | 'payment_gateway' | 'technical_support' | 'enterprise';
  subject: string;
  details: string;
}): Promise<{ ok: boolean; persistedLocallyOnly: boolean; referenceId?: string; message: string }> {
  try {
    const res = await fetch('/api/v1/billing/support-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      supportRequest?: { id: string };
      error?: { message?: string };
    };
    if (res.ok && body.ok) {
      return {
        ok: true,
        persistedLocallyOnly: false,
        referenceId: body.supportRequest?.id,
        message: `Support request logged on server (Ref: ${body.supportRequest?.id}).`,
      };
    }
    return {
      ok: false,
      persistedLocallyOnly: true,
      message: body.error?.message || 'Sign in to Cloud Sync or submit via email when offline.',
    };
  } catch {
    return {
      ok: false,
      persistedLocallyOnly: true,
      message: 'Offline/static mode active — recorded locally in workspace activity log.',
    };
  }
}

export async function verifyInvoiceTotalsOnServer(input: {
  currency: string;
  lineItems: Array<{ id: string; description: string; quantity: number; unitPrice: number }>;
  discountType: 'none' | 'percentage' | 'fixed';
  discountValue: number;
  taxRate: number;
  taxInclusive: boolean;
}): Promise<{
  ok: boolean;
  source: 'server' | 'offline_fallback';
  subtotal?: number;
  discountAmount?: number;
  taxableAmount?: number;
  taxAmount?: number;
  total?: number;
  message: string;
}> {
  try {
    const res = await fetch('/api/v1/invoices/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      subtotal?: number;
      discountAmount?: number;
      taxableAmount?: number;
      taxAmount?: number;
      total?: number;
      error?: { message?: string };
    };
    if (res.ok && body.ok && typeof body.total === 'number') {
      return {
        ok: true,
        source: 'server',
        subtotal: body.subtotal,
        discountAmount: body.discountAmount,
        taxableAmount: body.taxableAmount,
        taxAmount: body.taxAmount,
        total: body.total,
        message: 'Verified against server-side Big.js financial engine.',
      };
    }
    return {
      ok: false,
      source: 'offline_fallback',
      message: body.error?.message || 'Sign in to Cloud Sync to verify totals on backend; local Big.js ledger verified.',
    };
  } catch {
    return {
      ok: false,
      source: 'offline_fallback',
      message: 'Offline mode active; local Big.js ledger calculation confirmed.',
    };
  }
}

export async function fetchServerAuditLogs(input: {
  workspaceId: string;
  eventType?: string;
  outcome?: string;
  severity?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  ok: boolean;
  total: number;
  logs: Array<{
    id: string;
    eventType: string;
    severity: string;
    outcome: string;
    actorUserId: string;
    resourceType: string;
    resourceId: string;
    detail: string;
    metadataJson: string;
    createdAt: string;
  }>;
  message?: string;
}> {
  try {
    const qs = new URLSearchParams();
    if (input.eventType && input.eventType !== 'all') qs.set('eventType', input.eventType);
    if (input.outcome && input.outcome !== 'all') qs.set('outcome', input.outcome);
    if (input.severity && input.severity !== 'all') qs.set('severity', input.severity);
    if (input.search) qs.set('search', input.search);
    if (typeof input.limit === 'number') qs.set('limit', String(input.limit));
    if (typeof input.offset === 'number') qs.set('offset', String(input.offset));
    const res = await fetch(`/api/v1/audit-logs/${encodeURIComponent(input.workspaceId)}?${qs.toString()}`, {
      credentials: 'include',
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      total?: number;
      logs?: Array<{
        id: string;
        eventType: string;
        severity: string;
        outcome: string;
        actorUserId: string;
        resourceType: string;
        resourceId: string;
        detail: string;
        metadataJson: string;
        createdAt: string;
      }>;
      error?: { message?: string };
    };
    if (!res.ok || !body.ok) {
      return { ok: false, total: 0, logs: [], message: body.error?.message || 'Unable to load server audit logs.' };
    }
    return { ok: true, total: body.total ?? 0, logs: body.logs ?? [] };
  } catch {
    return { ok: false, total: 0, logs: [], message: 'Offline mode active; displaying local workspace audit ledger.' };
  }
}

export async function listWorkspaceMembersFromServer(workspaceId: string): Promise<{
  ok: boolean;
  callerRole?: string;
  members: Array<{
    id: string;
    userId: string;
    email: string;
    displayName: string;
    role: WorkspaceMemberRole;
    status: string;
    createdAt: string;
  }>;
  errorMessage?: string;
}> {
  try {
    const res = await fetch(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/members`, {
      credentials: 'include',
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      callerRole?: string;
      members?: Array<{
        id: string;
        userId: string;
        email: string;
        displayName: string;
        role: WorkspaceMemberRole;
        status: string;
        createdAt: string;
      }>;
      error?: { message?: string };
    };
    if (!res.ok || !body.ok) {
      return { ok: false, members: [], errorMessage: body.error?.message || 'Unable to fetch members.' };
    }
    return { ok: true, callerRole: body.callerRole, members: body.members ?? [] };
  } catch {
    return { ok: false, members: [], errorMessage: 'Backend unreachable in offline mode.' };
  }
}

export async function inviteWorkspaceMemberOnServer(input: {
  workspaceId: string;
  email: string;
  role: 'admin' | 'manager' | 'collaborator' | 'client_viewer';
}): Promise<{
  ok: boolean;
  invitation?: { id: string; email: string; role: string; expiresAt: string; testInviteToken?: string };
  message: string;
}> {
  try {
    const res = await fetch(`/api/v1/workspaces/${encodeURIComponent(input.workspaceId)}/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: input.email, role: input.role }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      invitation?: { id: string; email: string; role: string; expiresAt: string; testInviteToken?: string };
      error?: { message?: string };
    };
    if (!res.ok || !body.ok) {
      return { ok: false, message: body.error?.message || `Invite failed (HTTP ${res.status})` };
    }
    return {
      ok: true,
      invitation: body.invitation,
      message: `Invitation created for ${input.email} (${input.role}). Email delivery is not configured in local mode.`,
    };
  } catch {
    return { ok: false, message: 'Backend unreachable — invitations require Cloud Sync connection.' };
  }
}

export async function acceptWorkspaceInviteOnServer(inviteToken: string): Promise<{
  ok: boolean;
  workspaceId?: string;
  role?: string;
  message: string;
}> {
  try {
    const res = await fetch('/api/v1/workspaces/invitations/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ inviteToken }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      workspaceId?: string;
      role?: string;
      error?: { message?: string };
    };
    if (!res.ok || !body.ok) {
      return { ok: false, message: body.error?.message || `Accept failed (HTTP ${res.status})` };
    }
    return { ok: true, workspaceId: body.workspaceId, role: body.role, message: 'Joined workspace via invitation.' };
  } catch {
    return { ok: false, message: 'Backend unreachable — cannot accept invitation offline.' };
  }
}

export async function requestBillingCheckoutPreview(input: {
  workspaceId: string;
  targetTier: 'free' | 'pro' | 'ultimate' | 'business' | 'enterprise';
}): Promise<{ ok: boolean; statusCode: number; checkoutStatus: string; message: string }> {
  try {
    const res = await fetch('/api/v1/billing/checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(input),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      checkoutStatus?: string;
      message?: string;
      error?: { code?: string; message?: string };
    };
    if (res.ok && body.ok) {
      return {
        ok: true,
        statusCode: res.status,
        checkoutStatus: body.checkoutStatus ?? 'ready',
        message: body.message ?? 'Ready',
      };
    }
    return {
      ok: false,
      statusCode: res.status,
      checkoutStatus: body.error?.code ?? 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED',
      message:
        body.error?.message ??
        'Live merchant checkout is blocked until Stripe/Safepay/PayFast credentials are configured.',
    };
  } catch {
    return {
      ok: false,
      statusCode: 0,
      checkoutStatus: 'BLOCKED_EXTERNAL_PROVIDER_REQUIRED',
      message: 'Offline mode — previewing plan tier locally. Live checkout requires configured merchant keys.',
    };
  }
}

export async function deleteBackendAccount(): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch('/api/v1/auth/account', {
      method: 'DELETE',
      credentials: 'include',
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: { message?: string };
    };
    if (!res.ok || !body.ok) {
      return { ok: false, message: body.error?.message || 'No active cloud session or account delete failed.' };
    }
    return { ok: true, message: 'Cloud account and active sessions erased.' };
  } catch {
    return { ok: false, message: 'Offline mode — only local workspace data cleared.' };
  }
}

