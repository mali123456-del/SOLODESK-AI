import { todayDateStr } from '../domain/calculations/dates';
import type { Appointment, Client, Invoice, Proposal } from '../domain/schemas/entities';

export type FollowUpKind =
  | 'overdue_invoice'
  | 'pending_proposal'
  | 'lead_outreach'
  | 'meeting_followup';

export interface FollowUpQueueItem {
  id: string;
  kind: FollowUpKind;
  priority: 'high' | 'medium' | 'low';
  clientId: string;
  clientName: string;
  clientEmail: string;
  title: string;
  contextSummary: string;
  referenceDate: string;
  suggestedSubject: string;
  suggestedBody: string;
}

export function buildFollowUpQueue(params: {
  clients: Client[];
  invoices: Invoice[];
  proposals: Proposal[];
  appointments: Appointment[];
  businessName?: string;
  referenceDate?: string;
}): FollowUpQueueItem[] {
  const today = params.referenceDate ?? todayDateStr();
  const sender = params.businessName?.trim() || 'Your Freelance Studio';
  const clientMap = new Map(params.clients.map((c) => [c.id, c]));
  const items: FollowUpQueueItem[] = [];

  for (const inv of params.invoices) {
    if (inv.status === 'overdue' && inv.balanceDue > 0) {
      const cli = clientMap.get(inv.clientId);
      items.push({
        id: `fu_inv_${inv.id}`,
        kind: 'overdue_invoice',
        priority: 'high',
        clientId: inv.clientId,
        clientName: cli?.name ?? 'Client',
        clientEmail: cli?.email ?? '',
        title: `Follow up on overdue invoice ${inv.number}`,
        contextSummary: `Balance due: ${inv.currency} ${inv.balanceDue.toFixed(2)} (due ${inv.dueDate})`,
        referenceDate: inv.dueDate,
        suggestedSubject: `Friendly reminder: Invoice ${inv.number} (Balance ${inv.currency} ${inv.balanceDue.toFixed(2)})`,
        suggestedBody: `Hi ${cli?.name ?? 'there'},\n\nI hope your week is going well. Sharing a quick reminder regarding Invoice ${inv.number} (balance due ${inv.currency} ${inv.balanceDue.toFixed(2)}), which fell due on ${inv.dueDate}.\n\nPlease let me know if you need the PDF re-sent or have any questions on the line items.\n\nBest regards,\n${sender}`,
      });
    }
  }

  for (const apt of params.appointments) {
    if (apt.followUpRequired && apt.status !== 'cancelled') {
      const cli = apt.clientId ? clientMap.get(apt.clientId) : undefined;
      items.push({
        id: `fu_apt_${apt.id}`,
        kind: 'meeting_followup',
        priority: apt.date <= today ? 'high' : 'medium',
        clientId: apt.clientId,
        clientName: cli?.name ?? 'Client',
        clientEmail: cli?.email ?? '',
        title: `Send recap after "${apt.title}"`,
        contextSummary: `Scheduled ${apt.date} at ${apt.startTime}${apt.meetingNotes ? ` — Notes: ${apt.meetingNotes.slice(0, 80)}` : ''}`,
        referenceDate: apt.date,
        suggestedSubject: `Summary & next steps: ${apt.title}`,
        suggestedBody: `Hi ${cli?.name ?? 'there'},\n\nThanks for taking the time to speak during "${apt.title}". Here is a brief recap of our discussion and proposed next steps:\n\n${apt.meetingNotes ? apt.meetingNotes : '- Confirm milestone deliverables and schedule\n- Review open action items'}\n\nPlease reply if anything needs adjustment.\n\nBest regards,\n${sender}`,
      });
    }
  }

  for (const prp of params.proposals) {
    if (prp.status === 'sent') {
      const cli = clientMap.get(prp.clientId);
      items.push({
        id: `fu_prp_${prp.id}`,
        kind: 'pending_proposal',
        priority: 'medium',
        clientId: prp.clientId,
        clientName: cli?.name ?? 'Client',
        clientEmail: cli?.email ?? '',
        title: `Check in on sent proposal ${prp.number}`,
        contextSummary: `"${prp.title}" (${prp.currency} ${prp.pricingAmount.toFixed(2)})${prp.validUntil ? ` — Valid until ${prp.validUntil}` : ''}`,
        referenceDate: prp.validUntil || prp.updatedAt.slice(0, 10),
        suggestedSubject: `Checking in on Proposal ${prp.number}: ${prp.title}`,
        suggestedBody: `Hi ${cli?.name ?? 'there'},\n\nFollowing up to see if you had a chance to review Proposal ${prp.number} ("${prp.title}", quoted at ${prp.currency} ${prp.pricingAmount.toFixed(2)}).\n\nHappy to walk through scope, timeline, or deliverables on a short call.\n\nBest regards,\n${sender}`,
      });
    }
  }

  for (const cli of params.clients) {
    if (cli.status === 'lead') {
      items.push({
        id: `fu_lead_${cli.id}`,
        kind: 'lead_outreach',
        priority: 'low',
        clientId: cli.id,
        clientName: cli.name,
        clientEmail: cli.email,
        title: `Qualify lead: ${cli.name}${cli.company ? ` (${cli.company})` : ''}`,
        contextSummary: cli.notes ? cli.notes.slice(0, 100) : 'Active lead with no logged conversion yet.',
        referenceDate: cli.updatedAt.slice(0, 10),
        suggestedSubject: `Quick discovery check-in with ${sender}`,
        suggestedBody: `Hi ${cli.name},\n\nThanks for connecting${cli.company ? ` from ${cli.company}` : ''}. When would be a convenient time this week to clarify project scope, timeline, and budget goals?\n\nBest regards,\n${sender}`,
      });
    }
  }

  const weight: Record<FollowUpQueueItem['priority'], number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => weight[a.priority] - weight[b.priority]);
}
