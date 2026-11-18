import React, { useMemo, useState } from 'react';
import { AlertTriangle, Calendar, Copy, Download, ExternalLink, Mail, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Textarea,
  useToast,
} from '../../components/ui';
import { repositories } from '../../database/repositories/dexieRepositories';
import { formatDisplayDate, todayDateStr } from '../../domain/calculations/dates';
import type { Appointment } from '../../domain/schemas/entities';
import { buildFollowUpQueue, type FollowUpQueueItem } from '../../services/communicationService';
import { downloadTextFile } from '../../export/csvUtils';

export const CommunicationHubView: React.FC = () => {
  const {
    appointments,
    clients,
    projects,
    invoices,
    proposals,
    businessProfile,
    settings,
    refresh,
  } = useWorkspace();
  const { pushToast } = useToast();
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);

  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(todayDateStr());
  const [startTime, setStartTime] = useState('10:00');
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [locationOrLink, setLocationOrLink] = useState('Video Call');
  const [status, setStatus] = useState<Appointment['status']>('scheduled');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [followUpRequired, setFollowUpRequired] = useState(true);
  const [saving, setSaving] = useState(false);

  const [activeDraft, setActiveDraft] = useState<FollowUpQueueItem | null>(null);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const followUps = useMemo(
    () =>
      buildFollowUpQueue({
        clients,
        invoices,
        proposals,
        appointments,
        businessName: businessProfile?.businessName,
      }),
    [clients, invoices, proposals, appointments, businessProfile]
  );

  const timeToMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };

  const conflictingAppointment = useMemo(() => {
    const startMin = timeToMinutes(startTime);
    const endMin = startMin + Math.max(5, Number(durationMinutes) || 30);
    return appointments.find((apt) => {
      if (apt.status !== 'scheduled' || apt.date !== date || apt.id === editing?.id) return false;
      const aStart = timeToMinutes(apt.startTime);
      const aEnd = aStart + apt.durationMinutes;
      return startMin < aEnd && endMin > aStart;
    });
  }, [appointments, date, startTime, durationMinutes, editing]);

  const exportIcsInvite = (apt: Appointment) => {
    const cleanDate = apt.date.replace(/-/g, '');
    const cleanTime = apt.startTime.replace(':', '') + '00';
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//SOLODESK AI//Workspace//EN',
      'BEGIN:VEVENT',
      `UID:${apt.id}@solodesk.local`,
      `DTSTART:${cleanDate}T${cleanTime}`,
      `SUMMARY:${apt.title}`,
      `LOCATION:${apt.locationOrLink || 'Online'}`,
      `DESCRIPTION:${(apt.meetingNotes || '').replace(/\n/g, '\\n')}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    downloadTextFile(`${apt.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`, ics);
    pushToast({ title: 'Calendar .ics invite downloaded', tone: 'success' });
  };

  const openCreate = () => {
    setEditing(null);
    setTitle('');
    setClientId(clients[0]?.id ?? '');
    setProjectId('');
    setDate(todayDateStr());
    setStartTime('10:00');
    setDurationMinutes('30');
    setLocationOrLink('Video Call');
    setStatus('scheduled');
    setMeetingNotes('');
    setFollowUpRequired(true);
    setModalOpen(true);
  };

  const openEdit = (apt: Appointment) => {
    setEditing(apt);
    setTitle(apt.title);
    setClientId(apt.clientId);
    setProjectId(apt.projectId);
    setDate(apt.date);
    setStartTime(apt.startTime);
    setDurationMinutes(String(apt.durationMinutes));
    setLocationOrLink(apt.locationOrLink);
    setStatus(apt.status);
    setMeetingNotes(apt.meetingNotes);
    setFollowUpRequired(apt.followUpRequired);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        clientId,
        projectId,
        title: title.trim(),
        date,
        startTime,
        durationMinutes: Math.max(5, Number(durationMinutes) || 30),
        locationOrLink: locationOrLink.trim(),
        status,
        meetingNotes,
        followUpRequired,
        isDemo: false,
      };
      if (editing) {
        await repositories.updateAppointment(editing.id, payload);
        pushToast({ tone: 'success', title: 'Appointment updated' });
      } else {
        await repositories.createAppointment(payload);
        pushToast({ tone: 'success', title: 'Appointment scheduled' });
      }
      await refresh();
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const copyFollowUpDraft = async (item: FollowUpQueueItem) => {
    const fullText = `Subject: ${item.suggestedSubject}\n\n${item.suggestedBody}`;
    try {
      await navigator.clipboard.writeText(fullText);
      pushToast({
        tone: 'success',
        title: 'Follow-up email copied',
        description: 'Ready to paste into your mail client.',
      });
    } catch {
      setActiveDraft(item);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule & Client Follow-Ups"
        description="Manage client appointments with conflict detection, .ics calendar invites, booking preview, and email follow-up drafts."
        actions={
          <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
            Schedule Meeting
          </Button>
        }
      />

      {/* Honest Provider Status Banner */}
      <Card padding="sm">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold">External Email & Calendar Sync:</span>
            <Badge tone="neutral">Local PWA Mode (Not Connected)</Badge>
            <span className="text-slate-500">
              Export standard `.ics` calendar invites or launch `mailto:` drafts directly from your device.
            </span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Appointments & Meeting Notes */}
        <div className="lg:col-span-6">
          <Card>
            <CardHeader
              title={`Appointments & Call Notes (${appointments.length})`}
              description="Synced locally in IndexedDB."
            />
            {appointments.length === 0 ? (
              <EmptyState
                icon={<Calendar className="w-5 h-5" />}
                title="No meetings scheduled"
                description="Schedule discovery calls, kickoff reviews, or milestone check-ins with meeting notes."
                action={
                  <Button size="sm" onClick={openCreate} icon={<Plus className="w-3.5 h-3.5" />}>
                    Schedule Meeting
                  </Button>
                }
              />
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {appointments.map((apt) => (
                  <div key={apt.id} className="py-3.5 first:pt-0 last:pb-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {apt.title}
                          </span>
                          <Badge
                            tone={
                              apt.status === 'completed'
                                ? 'success'
                                : apt.status === 'cancelled'
                                  ? 'neutral'
                                  : 'info'
                            }
                          >
                            {apt.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatDisplayDate(apt.date, dateFormat)} · {apt.startTime} ({apt.durationMinutes}m)
                          {apt.clientId ? ` · ${clientMap.get(apt.clientId)?.name ?? 'Client'}` : ''}
                          {apt.locationOrLink ? ` · ${apt.locationOrLink}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => exportIcsInvite(apt)}
                          title="Download .ics calendar invite"
                          aria-label={`Export ICS for ${apt.title}`}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(apt)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget(apt)}
                          aria-label={`Delete ${apt.title}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        </Button>
                      </div>
                    </div>
                    {apt.meetingNotes && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#101827] p-2.5 rounded-lg whitespace-pre-wrap">
                        {apt.meetingNotes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Prioritized Follow-Up Queue */}
        <div className="lg:col-span-6">
          <Card>
            <CardHeader
              title={`Client Follow-Up Queue (${followUps.length})`}
              description="Generated deterministically from overdue invoices, meeting follow-ups, sent proposals, and leads."
            />
            {followUps.length === 0 ? (
              <EmptyState
                icon={<Mail className="w-5 h-5" />}
                title="All caught up"
                description="No overdue invoices, pending proposals, or flagged follow-ups waiting right now."
              />
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {followUps.map((item) => (
                  <div key={item.id} className="py-3.5 first:pt-0 last:pb-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            tone={
                              item.priority === 'high'
                                ? 'danger'
                                : item.priority === 'medium'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {item.priority}
                          </Badge>
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {item.title}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.clientName}
                          {item.clientEmail ? ` (${item.clientEmail})` : ''} · {item.contextSummary}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => setActiveDraft(item)}>
                          Draft
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Copy draft for ${item.title}`}
                          onClick={() => void copyFollowUpDraft(item)}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Appointment Modal */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Appointment' : 'Schedule Client Meeting'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {conflictingAppointment && (
            <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Scheduling conflict detected: overlaps with &quot;{conflictingAppointment.title}&quot; at{' '}
                {conflictingAppointment.startTime} ({conflictingAppointment.durationMinutes}m).
              </span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Meeting Title"
              required
              placeholder="e.g., Milestone 1 Walkthrough"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Select
              label="Client (Optional)"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              options={[
                { value: '', label: 'General / Internal' },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <Select
              label="Project (Optional)"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              options={[
                { value: '', label: 'None' },
                ...projects.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />
            <Select
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as Appointment['status'])}
              options={[
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'completed', label: 'Completed' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
            <Input label="Date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="Start Time"
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
              <Input
                label="Minutes"
                type="number"
                min="5"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </div>
          </div>

          <Input
            label="Location or Meeting Link"
            placeholder="Video Call, Google Meet link, or address"
            value={locationOrLink}
            onChange={(e) => setLocationOrLink(e.target.value)}
          />

          <Textarea
            label="Meeting Agenda & Notes"
            rows={4}
            value={meetingNotes}
            onChange={(e) => setMeetingNotes(e.target.value)}
            placeholder="Agenda items, decisions, or recap points..."
          />

          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={followUpRequired}
              onChange={(e) => setFollowUpRequired(e.target.checked)}
            />
            <span>Flag follow-up recap reminder in queue</span>
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Save Changes' : 'Save Meeting'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Follow-Up Draft Dialog */}
      <Dialog
        open={Boolean(activeDraft)}
        onClose={() => setActiveDraft(null)}
        title={activeDraft ? `Follow-Up Draft — ${activeDraft.clientName}` : 'Follow-Up Draft'}
        size="lg"
      >
        {activeDraft && (
          <div className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#101827] space-y-1">
              <p className="text-slate-500">
                To: <span className="font-mono text-slate-800 dark:text-slate-200">{activeDraft.clientEmail || activeDraft.clientName}</span>
              </p>
              <p className="text-slate-500">
                Subject: <span className="font-semibold text-slate-900 dark:text-white">{activeDraft.suggestedSubject}</span>
              </p>
            </div>
            <pre className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101827] text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
              {activeDraft.suggestedBody}
            </pre>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActiveDraft(null)}>
                Close
              </Button>
              {activeDraft.clientEmail && (
                <a
                  href={`mailto:${encodeURIComponent(activeDraft.clientEmail)}?subject=${encodeURIComponent(activeDraft.suggestedSubject)}&body=${encodeURIComponent(activeDraft.suggestedBody)}`}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-[10px] border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open in Mail App
                </a>
              )}
              <Button
                onClick={() => void copyFollowUpDraft(activeDraft)}
                icon={<Copy className="w-3.5 h-3.5" />}
              >
                Copy Full Draft
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await repositories.deleteAppointment(deleteTarget.id);
          setDeleteTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Appointment deleted' });
        }}
        title="Delete Appointment"
        description={`Remove "${deleteTarget?.title}" from your local schedule?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
