import { createId } from '../domain/schemas/entities';

export type ExternalCalendarProvider = 'google_calendar' | 'microsoft_calendar' | 'ics_local';
export type ExternalEmailProvider = 'gmail' | 'outlook' | 'mailto_local';

export interface CalendarEmailConnectorStatus {
  provider: ExternalCalendarProvider | ExternalEmailProvider;
  label: string;
  mode: 'offline_supported' | 'blocked_external_oauth_required';
  note: string;
}

export const CALENDAR_EMAIL_CONNECTOR_CATALOG: CalendarEmailConnectorStatus[] = [
  {
    provider: 'ics_local',
    label: 'Standard iCalendar (.ics) Export',
    mode: 'offline_supported',
    note: 'Exports RFC 5545 .ics calendar invites completely offline with zero external OAuth required.',
  },
  {
    provider: 'mailto_local',
    label: 'System Mail Client (mailto:) Draft',
    mode: 'offline_supported',
    note: 'Opens user-configured email client locally without storing OAuth tokens.',
  },
  {
    provider: 'google_calendar',
    label: 'Google Calendar Two-Way Sync',
    mode: 'blocked_external_oauth_required',
    note: 'BLOCKED — EXTERNAL REQUIREMENT: Live Google Workspace OAuth credentials & user consent required.',
  },
  {
    provider: 'microsoft_calendar',
    label: 'Microsoft Outlook / Graph Calendar',
    mode: 'blocked_external_oauth_required',
    note: 'BLOCKED — EXTERNAL REQUIREMENT: Azure AD OAuth client registration required.',
  },
  {
    provider: 'gmail',
    label: 'Gmail API Thread Sync',
    mode: 'blocked_external_oauth_required',
    note: 'BLOCKED — EXTERNAL REQUIREMENT: Verified Google OAuth scopes required.',
  },
  {
    provider: 'outlook',
    label: 'Microsoft Mail Graph Sync',
    mode: 'blocked_external_oauth_required',
    note: 'BLOCKED — EXTERNAL REQUIREMENT: Microsoft Graph Mail.Send OAuth credentials required.',
  },
];

function escapeIcsText(val: string): string {
  return val.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
}

/**
 * Generates an RFC 5545 compliant .ics calendar invitation locally without external network dependency.
 */
export function buildAppointmentIcsContent(input: {
  uid?: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  durationMinutes: number;
  location?: string;
  description?: string;
}): string {
  const [y, m, d] = input.date.split('-').map(Number);
  const [hh, mm] = input.startTime.split(':').map(Number);
  const start = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1, hh || 10, mm || 0, 0));
  const end = new Date(start.getTime() + Math.max(5, input.durationMinutes) * 60_000);
  const fmt = (dt: Date) =>
    dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SOLODESK AI//Workspace Calendar//EN',
    'BEGIN:VEVENT',
    `UID:${input.uid ?? createId('evt')}@solodesk.local`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    input.location ? `LOCATION:${escapeIcsText(input.location)}` : '',
    input.description ? `DESCRIPTION:${escapeIcsText(input.description)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}

export function buildMailtoDraftHref(input: {
  to: string;
  subject: string;
  body: string;
}): string {
  const params = new URLSearchParams({
    subject: input.subject,
    body: input.body,
  });
  return `mailto:${encodeURIComponent(input.to.trim())}?${params.toString().replace(/\+/g, '%20')}`;
}
