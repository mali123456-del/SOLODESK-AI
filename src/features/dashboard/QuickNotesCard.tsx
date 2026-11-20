import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, RotateCcw, Save, StickyNote, Trash2 } from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { Button, Card, CardHeader, ConfirmDialog, Textarea, useToast } from '../../components/ui';

export const QuickNotesCard: React.FC = () => {
  const {
    activeWorkspace,
    activeWorkspaceId,
    quickNote,
    quickNoteUpdatedAt,
    saveQuickNote,
    clearQuickNote,
    setHasUnsavedQuickNotes,
  } = useWorkspace();
  const { pushToast } = useToast();

  const [draft, setDraft] = useState(quickNote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [trackedWorkspace, setTrackedWorkspace] = useState(activeWorkspaceId);
  const prevSavedRef = useRef(quickNote);

  if (trackedWorkspace !== activeWorkspaceId) {
    setTrackedWorkspace(activeWorkspaceId);
    setDraft(quickNote);
    setError(null);
    prevSavedRef.current = quickNote;
  }

  const hasUnsavedChanges = draft !== quickNote;

  useEffect(() => {
    setHasUnsavedQuickNotes(hasUnsavedChanges);
  }, [hasUnsavedChanges, setHasUnsavedQuickNotes]);

  useEffect(() => {
    return () => {
      setHasUnsavedQuickNotes(false);
    };
  }, [setHasUnsavedQuickNotes]);

  // Synchronize draft when external store updates without local edits
  useEffect(() => {
    const savedChanged = prevSavedRef.current !== quickNote;
    if (savedChanged && draft === prevSavedRef.current) {
      setDraft(quickNote);
    }
    prevSavedRef.current = quickNote;
  }, [quickNote, draft]);

  // Warn user before closing/reloading browser tab if unsaved text exists
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      await saveQuickNote(draft);
      pushToast({
        tone: 'success',
        title: 'Quick note saved',
        description: 'Stored locally in IndexedDB for this workspace.',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save note locally.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setDraft(quickNote);
    setError(null);
  };

  const handleClearAction = () => {
    if (quickNote.length > 0) {
      setClearConfirmOpen(true);
      return;
    }
    setDraft('');
    setError(null);
  };

  const handleConfirmClear = async () => {
    setError(null);
    setSaving(true);
    try {
      await clearQuickNote();
      setDraft('');
      setClearConfirmOpen(false);
      pushToast({
        tone: 'info',
        title: 'Scratchpad cleared',
        description: 'Local quick notes removed for this workspace.',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to clear quick note.');
      setClearConfirmOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (hasUnsavedChanges && !saving) {
        void handleSave();
      }
    }
  };

  const isEmptyState = quickNote === '' && draft === '';

  const formattedSavedTime = (() => {
    if (!quickNoteUpdatedAt) return '';
    const parsed = new Date(quickNoteUpdatedAt);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  })();

  return (
    <Card aria-label="Quick Notes Scratchpad">
      <CardHeader
        title="Quick Notes"
        description="Local workspace scratchpad stored offline in IndexedDB only — never sent externally."
        action={
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <StickyNote className="w-4 h-4 text-[#2563EB]" aria-hidden="true" />
            <span className="font-mono">{activeWorkspace?.name ?? activeWorkspaceId}</span>
          </span>
        }
      />

      <div className="space-y-3">
        <Textarea
          id="quick-notes-textarea"
          label="Temporary Notes & Reminders"
          rows={4}
          maxLength={10_000}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Jot down quick call notes, follow-up reminders, or scratchpad thoughts..."
          aria-describedby="quick-notes-status"
        />

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <div
          id="quick-notes-status"
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex items-center gap-1.5">
            {hasUnsavedChanges ? (
              <span className="font-medium text-amber-700 dark:text-amber-300">
                Unsaved changes · Ctrl/Cmd+S to save
              </span>
            ) : isEmptyState ? (
              <span className="text-slate-500 dark:text-slate-400">
                Empty scratchpad · Saved notes persist across reloads.
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                Saved locally{formattedSavedTime ? ` at ${formattedSavedTime}` : ''}
              </span>
            )}
          </div>
          <span className="font-mono tabular-nums text-slate-400">
            {draft.length} / 10,000
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          {hasUnsavedChanges && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDiscard}
              disabled={saving}
              icon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              Discard Changes
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={handleClearAction}
            disabled={saving || (draft === '' && quickNote === '')}
            icon={<Trash2 className="w-3.5 h-3.5" />}
          >
            Clear Note
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void handleSave()}
            loading={saving}
            disabled={!hasUnsavedChanges}
            icon={<Save className="w-3.5 h-3.5" />}
          >
            Save Note
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={clearConfirmOpen}
        onClose={() => setClearConfirmOpen(false)}
        onConfirm={() => void handleConfirmClear()}
        title="Clear Quick Notes?"
        description="This will remove your saved quick notes for this workspace from local IndexedDB storage."
        confirmLabel="Clear Scratchpad"
        danger
        loading={saving}
      />
    </Card>
  );
};
