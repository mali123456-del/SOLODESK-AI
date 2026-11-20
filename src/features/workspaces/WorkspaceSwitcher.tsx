import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Edit3,
  Plus,
  Trash2,
} from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import {
  Button,
  ConfirmDialog,
  Dialog,
  Input,
  useToast,
} from '../../components/ui';
import type { WorkspaceMetadata } from '../../database/workspaceManager';

interface WorkspaceSwitcherProps {
  compact?: boolean;
}

export const WorkspaceSwitcher: React.FC<WorkspaceSwitcherProps> = ({ compact = false }) => {
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    hasUnsavedQuickNotes,
    createWorkspace,
    renameWorkspace,
    switchWorkspace,
    deleteWorkspace,
  } = useWorkspace();
  const { pushToast } = useToast();

  const [managerOpen, setManagerOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<WorkspaceMetadata | null>(null);
  const [pendingSwitchTarget, setPendingSwitchTarget] = useState<string | null>(null);

  const activeDisplayName = activeWorkspace?.name ?? 'Local Workspace';

  const performSwitch = async (targetId: string) => {
    if (targetId === activeWorkspaceId) {
      setManagerOpen(false);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await switchWorkspace(targetId);
      const targetWs = workspaces.find((w) => w.id === targetId);
      setManagerOpen(false);
      pushToast({
        tone: 'info',
        title: `Switched to "${targetWs?.name ?? targetId}"`,
        description: 'Isolated workspace database loaded from IndexedDB.',
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to switch workspace.');
    } finally {
      setBusy(false);
    }
  };

  const handleRequestSwitch = (targetId: string) => {
    if (targetId === activeWorkspaceId) return;
    if (hasUnsavedQuickNotes) {
      setPendingSwitchTarget(targetId);
      return;
    }
    void performSwitch(targetId);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasUnsavedQuickNotes) {
      setFormError('Save or discard your unsaved Quick Notes draft before creating & switching workspaces.');
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const created = await createWorkspace(newName, true);
      setNewName('');
      setManagerOpen(false);
      pushToast({
        tone: 'success',
        title: `Workspace "${created.name}" created`,
        description: 'Switched to isolated workspace storage.',
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create workspace.');
    } finally {
      setBusy(false);
    }
  };

  const handleStartRename = (ws: WorkspaceMetadata) => {
    setEditingId(ws.id);
    setEditName(ws.name);
    setFormError(null);
  };

  const handleSaveRename = async (workspaceId: string) => {
    setBusy(true);
    setFormError(null);
    try {
      const updated = await renameWorkspace(workspaceId, editName);
      setEditingId(null);
      setEditName('');
      pushToast({
        tone: 'success',
        title: `Renamed workspace to "${updated.name}"`,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to rename workspace.');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    setFormError(null);
    try {
      await deleteWorkspace(deleteTarget.id);
      pushToast({
        tone: 'info',
        title: `Workspace "${deleteTarget.name}" deleted`,
        description: 'Isolated workspace storage removed.',
      });
      setDeleteTarget(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to delete workspace.');
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setFormError(null);
          setManagerOpen(true);
        }}
        data-testid="workspace-switcher-trigger"
        aria-label={`Active workspace: ${activeDisplayName}. Switch or manage workspaces`}
        className={
          compact
            ? 'h-9 px-2.5 rounded-[10px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#101827] text-xs font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer max-w-[180px]'
            : 'w-full px-3 py-2 rounded-[10px] border border-slate-700/80 bg-[#172338] hover:bg-[#1e2d47] text-xs text-slate-100 flex items-center justify-between gap-2 cursor-pointer transition-colors'
        }
      >
        <span className="flex items-center gap-2 min-w-0">
          <Building2 className="w-3.5 h-3.5 text-[#20C7D9] shrink-0" aria-hidden="true" />
          <span className="truncate font-semibold" data-testid="active-workspace-name">
            {activeDisplayName}
          </span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
      </button>

      <Dialog
        open={managerOpen}
        onClose={() => {
          setManagerOpen(false);
          setEditingId(null);
          setFormError(null);
        }}
        title="Workspaces"
        description="Each workspace keeps completely isolated CRM, projects, tasks, invoices, Quick Notes, and daily goals in its own IndexedDB database."
        size="lg"
      >
        <div className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          <div className="space-y-2" role="list" aria-label="Available Workspaces">
            {workspaces.map((ws) => {
              const isActive = ws.id === activeWorkspaceId;
              const isEditing = editingId === ws.id;

              return (
                <div
                  key={ws.id}
                  role="listitem"
                  className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                    isActive
                      ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101827]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label="Rename workspace name"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          maxLength={64}
                        />
                        <Button
                          size="sm"
                          variant="primary"
                          loading={busy}
                          onClick={() => void handleSaveRename(ws.id)}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingId(null);
                            setEditName('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                          {ws.name}
                        </span>
                        {ws.isDefault && (
                          <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            Default
                          </span>
                        )}
                        {isActive && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                            <Check className="w-3 h-3" aria-hidden="true" />
                            Active
                          </span>
                        )}
                      </div>
                    )}
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      ID: {ws.id}
                    </p>
                  </div>

                  {!isEditing && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isActive && (
                        <Button
                          size="sm"
                          variant="primary"
                          loading={busy}
                          onClick={() => handleRequestSwitch(ws.id)}
                        >
                          Switch
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Rename ${ws.name}`}
                        onClick={() => handleStartRename(ws)}
                        icon={<Edit3 className="w-3.5 h-3.5" />}
                      >
                        Rename
                      </Button>
                      {!ws.isDefault && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${ws.name}`}
                          onClick={() => setDeleteTarget(ws)}
                          icon={<Trash2 className="w-3.5 h-3.5 text-rose-600" />}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <form onSubmit={handleCreate} className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <div className="flex-1">
                <Input
                  id="new-workspace-name"
                  label="Create New Isolated Workspace"
                  placeholder="e.g., Acme Retainer Studio"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  maxLength={64}
                />
              </div>
              <Button
                type="submit"
                size="md"
                variant="primary"
                loading={busy}
                icon={<Plus className="w-4 h-4" />}
              >
                Create Workspace
              </Button>
            </div>
          </form>
        </div>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
        title={`Delete workspace "${deleteTarget?.name ?? ''}"?`}
        description="This permanently erases all clients, projects, tasks, invoices, Quick Notes, and settings stored inside this workspace's IndexedDB database. This action cannot be undone."
        confirmLabel="Delete Workspace"
        danger
        loading={busy}
      />

      <ConfirmDialog
        open={Boolean(pendingSwitchTarget)}
        onClose={() => setPendingSwitchTarget(null)}
        onConfirm={() => {
          const target = pendingSwitchTarget;
          setPendingSwitchTarget(null);
          if (target) {
            void performSwitch(target);
          }
        }}
        title="Unsaved Quick Notes Draft"
        description="You have unsaved changes in Quick Notes on the current workspace. Switching workspaces now will discard your unsaved draft unless you cancel and save it first."
        confirmLabel="Discard Draft & Switch"
        cancelLabel="Stay & Save First"
        danger
        loading={busy}
      />
    </>
  );
};
