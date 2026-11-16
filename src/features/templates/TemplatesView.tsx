import React, { useMemo, useState } from 'react';
import { Briefcase, Copy, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  useToast,
} from '../../components/ui';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { repositories } from '../../database/repositories/dexieRepositories';
import type { ReusableTemplate } from '../../domain/schemas/entities';

export const TemplatesView: React.FC = () => {
  const { templates, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [kindFilter, setKindFilter] = useState<'all' | 'proposal' | 'contract' | 'email'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReusableTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReusableTemplate | null>(null);

  const [kind, setKind] = useState<'proposal' | 'contract' | 'email'>('proposal');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');

  const filtered = useMemo(
    () => templates.filter((t) => kindFilter === 'all' || t.kind === kindFilter),
    [templates, kindFilter]
  );

  const openCreate = () => {
    setEditing(null);
    setKind('proposal');
    setName('');
    setDescription('');
    setContent('');
    setModalOpen(true);
  };

  const openEdit = (t: ReusableTemplate) => {
    setEditing(t);
    setKind(t.kind);
    setName(t.name);
    setDescription(t.description);
    setContent(t.content);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !content.trim()) return;
    await repositories.saveTemplate({
      id: editing?.id,
      kind,
      name: name.trim(),
      description: description.trim(),
      content,
      isBuiltIn: editing?.isBuiltIn ?? false,
    });
    await refresh();
    setModalOpen(false);
    pushToast({ tone: 'success', title: editing ? 'Template updated' : 'Template saved' });
  };

  const copyContent = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast({ tone: 'success', title: 'Copied template to clipboard' });
    } catch {
      pushToast({ tone: 'info', title: 'Copy manually from template editor' });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description="Reusable templates for client proposals, freelance contracts, and follow-up emails."
        actions={
          <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
            New Template
          </Button>
        }
      />

      <Tabs
        activeId={kindFilter}
        onChange={(id) => setKindFilter(id as typeof kindFilter)}
        items={[
          { id: 'all', label: 'All', count: templates.length },
          { id: 'proposal', label: 'Proposals', count: templates.filter((t) => t.kind === 'proposal').length },
          { id: 'contract', label: 'Contracts', count: templates.filter((t) => t.kind === 'contract').length },
          { id: 'email', label: 'Emails', count: templates.filter((t) => t.kind === 'email').length },
        ]}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Briefcase className="w-5 h-5" />}
          title="No templates in this category"
          description="Create reusable boilerplate to accelerate client onboarding."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((tpl) => (
            <Card key={tpl.id} className="flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">{tpl.name}</h3>
                  <Badge tone={tpl.kind === 'contract' ? 'warning' : 'info'}>{tpl.kind}</Badge>
                </div>
                {tpl.description && (
                  <p className="text-xs text-slate-500 mt-1">{tpl.description}</p>
                )}
                <pre className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-[#101827] text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans max-h-36 overflow-y-auto">
                  {tpl.content}
                </pre>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400">
                  {tpl.isBuiltIn ? 'Built-in' : 'Custom'}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void copyContent(tpl.content)}
                    icon={<Copy className="w-3.5 h-3.5" />}
                  >
                    Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(tpl)}>
                    Edit
                  </Button>
                  {!tpl.isBuiltIn && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteTarget(tpl)}
                      aria-label={`Delete ${tpl.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Template' : 'New Template'}
        size="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Category"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              options={[
                { value: 'proposal', label: 'Proposal' },
                { value: 'contract', label: 'Contract' },
                { value: 'email', label: 'Client Email' },
              ]}
            />
            <Input
              label="Template Name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Input
            label="Short Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Textarea
            label="Template Content"
            required
            rows={8}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Template</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await repositories.deleteTemplate(deleteTarget.id);
          setDeleteTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Template deleted' });
        }}
        title="Delete Template"
        description={`Delete "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};
