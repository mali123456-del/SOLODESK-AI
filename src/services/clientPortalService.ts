import { todayDateStr } from '../domain/calculations/dates';
import type {
  Client,
  ClientPortalLink,
  Invoice,
  Project,
  VaultFile,
} from '../domain/schemas/entities';

export interface ScopedClientPortalViewModel {
  valid: boolean;
  reason?: string;
  link?: ClientPortalLink;
  clientPublicProfile?: {
    id: string;
    name: string;
    company: string;
  };
  projectSummary?: {
    id: string;
    name: string;
    status: Project['status'];
    progress: number;
    dueDate: string;
    milestones: Project['milestones'];
  };
  scopedInvoices: Array<{
    id: string;
    number: string;
    status: Invoice['status'];
    dueDate: string;
    currency: string;
    total: number;
    balanceDue: number;
  }>;
  scopedFiles: Array<{
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    version: number;
    approvalStatus: VaultFile['approvalStatus'];
  }>;
}

/**
 * Builds a strictly scoped client portal view model.
 * Internal client notes, internal finance margins, and private/confidential vault files are ALWAYS excluded.
 */
export function buildClientPortalViewModel(input: {
  link: ClientPortalLink | undefined;
  clients: Client[];
  projects: Project[];
  invoices: Invoice[];
  vaultFiles: VaultFile[];
  today?: string;
}): ScopedClientPortalViewModel {
  const today = input.today ?? todayDateStr();
  const { link } = input;
  if (!link) {
    return {
      valid: false,
      reason: 'Portal share token was not found.',
      scopedInvoices: [],
      scopedFiles: [],
    };
  }
  if (link.status === 'revoked') {
    return {
      valid: false,
      reason: 'This client portal access link has been revoked.',
      link,
      scopedInvoices: [],
      scopedFiles: [],
    };
  }
  if (link.status === 'expired' || link.expiresAt < today) {
    return {
      valid: false,
      reason: `This portal access link expired on ${link.expiresAt}.`,
      link,
      scopedInvoices: [],
      scopedFiles: [],
    };
  }

  const client = input.clients.find((c) => c.id === link.clientId);
  if (!client) {
    return {
      valid: false,
      reason: 'Associated client record is no longer available.',
      link,
      scopedInvoices: [],
      scopedFiles: [],
    };
  }

  const project = link.projectId
    ? input.projects.find((p) => p.id === link.projectId && p.clientId === client.id)
    : input.projects.find((p) => p.clientId === client.id && p.status === 'active');

  const scopedInvoices = link.permissions.showInvoices
    ? input.invoices
        .filter((inv) => inv.clientId === client.id && inv.status !== 'draft' && inv.status !== 'cancelled')
        .map((inv) => ({
          id: inv.id,
          number: inv.number,
          status: inv.status,
          dueDate: inv.dueDate,
          currency: inv.currency,
          total: inv.total,
          balanceDue: inv.balanceDue,
        }))
    : [];

  // Security isolation: only expose files explicitly marked client_shared or public AND linked to this client
  const scopedFiles = link.permissions.showSharedFiles
    ? input.vaultFiles
        .filter(
          (f) =>
            (f.classification === 'client_shared' || f.classification === 'public') &&
            (f.clientId === client.id || (project && f.projectId === project.id))
        )
        .map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          version: f.version,
          approvalStatus: f.approvalStatus,
        }))
    : [];

  return {
    valid: true,
    link,
    clientPublicProfile: {
      id: client.id,
      name: client.name,
      company: client.company,
    },
    projectSummary:
      project && link.permissions.showMilestones
        ? {
            id: project.id,
            name: project.name,
            status: project.status,
            progress: project.progress,
            dueDate: project.dueDate,
            milestones: project.milestones,
          }
        : undefined,
    scopedInvoices,
    scopedFiles,
  };
}
