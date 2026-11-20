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
