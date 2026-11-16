import React, { useMemo, useState } from 'react';
import { Briefcase, Copy, Package, Plus, Trash2 } from 'lucide-react';
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
import { formatMoney, SUPPORTED_CURRENCIES } from '../../domain/calculations/money';
import type { ReusableTemplate, ServiceCatalogItem } from '../../domain/schemas/entities';

export const TemplatesView: React.FC = () => {
  const { templates, serviceCatalog, settings, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [kindFilter, setKindFilter] = useState<'all' | 'proposal' | 'contract' | 'email' | 'services'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReusableTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReusableTemplate | null>(null);

  const [kind, setKind] = useState<'proposal' | 'contract' | 'email'>('proposal');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');

  // Service Catalog state
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceCatalogItem | null>(null);
  const [deleteServiceTarget, setDeleteServiceTarget] = useState<ServiceCatalogItem | null>(null);
  const [svcName, setSvcName] = useState('');
  const [svcDescription, setSvcDescription] = useState('');
  const [svcCategory, setSvcCategory] = useState('Engineering');
  const [svcBillingUnit, setSvcBillingUnit] = useState<'fixed' | 'hourly' | 'monthly' | 'milestone'>('fixed');
  const [svcEstimatedHours, setSvcEstimatedHours] = useState('8');
  const [svcPrice, setSvcPrice] = useState('500');
  const [svcCurrency, setSvcCurrency] = useState(settings?.defaultCurrency ?? 'USD');
  const [svcTaxable, setSvcTaxable] = useState(true);
  const [svcActive, setSvcActive] = useState(true);

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

  const openCreateService = () => {
    setEditingService(null);
    setSvcName('');
    setSvcDescription('');
    setSvcCategory('Engineering');
    setSvcBillingUnit('fixed');
    setSvcEstimatedHours('8');
    setSvcPrice('500');
    setSvcCurrency(settings?.defaultCurrency ?? 'USD');
    setSvcTaxable(true);
    setSvcActive(true);
    setServiceModalOpen(true);
  };

  const openEditService = (svc: ServiceCatalogItem) => {
    setEditingService(svc);
    setSvcName(svc.name);
    setSvcDescription(svc.description);
    setSvcCategory(svc.category);
    setSvcBillingUnit(svc.billingUnit);
    setSvcEstimatedHours(String(svc.estimatedHours));
    setSvcPrice(String(svc.defaultUnitPrice));
    setSvcCurrency(svc.currency);
    setSvcTaxable(svc.defaultTaxable);
    setSvcActive(svc.active);
    setServiceModalOpen(true);
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

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!svcName.trim()) return;
    const payload = {
      name: svcName.trim(),
      description: svcDescription.trim(),
      category: svcCategory.trim() || 'General',
      billingUnit: svcBillingUnit,
      estimatedHours: Math.max(0, Number(svcEstimatedHours) || 0),
      defaultUnitPrice: Math.max(0, Number(svcPrice) || 0),
      currency: svcCurrency,
      defaultTaxable: svcTaxable,
      active: svcActive,
      isDemo: editingService?.isDemo ?? false,
    };
    if (editingService) {
      await repositories.updateServiceItem(editingService.id, payload);
      pushToast({ tone: 'success', title: 'Service package updated' });
    } else {
      await repositories.createServiceItem(payload);
      pushToast({ tone: 'success', title: 'Service package added to catalog' });
    }
    await refresh();
    setServiceModalOpen(false);
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
        title="Templates & Service Catalog"
        description="Reusable templates for proposals, contracts, and emails plus pre-priced services you can insert directly into Quotations & Invoices."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openCreateService} icon={<Package className="w-4 h-4" />}>
              New Service Item
            </Button>
            <Button onClick={openCreate} icon={<Plus className="w-4 h-4" />}>
              New Template
            </Button>
          </div>
        }
      />

      <Tabs
        activeId={kindFilter}
        onChange={(id) => setKindFilter(id as typeof kindFilter)}
        items={[
          { id: 'all', label: 'All Templates', count: templates.length },
          { id: 'proposal', label: 'Proposals', count: templates.filter((t) => t.kind === 'proposal').length },
          { id: 'contract', label: 'Contracts', count: templates.filter((t) => t.kind === 'contract').length },
          { id: 'email', label: 'Emails', count: templates.filter((t) => t.kind === 'email').length },
          { id: 'services', label: 'Service Catalog', count: serviceCatalog.length },
        ]}
      />

      {kindFilter === 'services' ? (
        serviceCatalog.length === 0 ? (
          <EmptyState
            icon={<Package className="w-5 h-5" />}
            title="No service packages yet"
            description="Save recurring services, retainers, or hourly packages once and insert them into quotations and invoices."
            action={
              <Button onClick={openCreateService} icon={<Plus className="w-4 h-4" />}>
                Add Service Item
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {serviceCatalog.map((svc) => (
              <Card key={svc.id} className="flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{svc.name}</h3>
                    <Badge tone={svc.active ? 'success' : 'neutral'}>
                      {svc.active ? 'Active' : 'Paused'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {svc.category} · {svc.billingUnit}
                    {svc.estimatedHours > 0 ? ` · ~${svc.estimatedHours}h` : ''}
                  </p>
                  {svc.description && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">{svc.description}</p>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                  <span className="font-mono font-semibold text-sm text-slate-900 dark:text-white tabular-nums">
                    {formatMoney(svc.defaultUnitPrice, svc.currency)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEditService(svc)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleteServiceTarget(svc)}
                      aria-label={`Delete ${svc.name}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
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

      <Dialog
        open={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        title={editingService ? 'Edit Service Item' : 'New Service Catalog Item'}
        size="md"
      >
        <form onSubmit={handleSaveService} className="space-y-4">
          <Input
            label="Service Name"
            required
            placeholder="e.g., Landing Page Architecture & QA"
            value={svcName}
            onChange={(e) => setSvcName(e.target.value)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Category"
              value={svcCategory}
              onChange={(e) => setSvcCategory(e.target.value)}
            />
            <Select
              label="Billing Unit"
              value={svcBillingUnit}
              onChange={(e) => setSvcBillingUnit(e.target.value as ServiceCatalogItem['billingUnit'])}
              options={[
                { value: 'fixed', label: 'Fixed Fee' },
                { value: 'hourly', label: 'Hourly' },
                { value: 'milestone', label: 'Milestone' },
                { value: 'monthly', label: 'Monthly Retainer' },
              ]}
            />
            <Input
              label="Default Unit Price"
              type="number"
              min="0"
              step="0.01"
              required
              value={svcPrice}
              onChange={(e) => setSvcPrice(e.target.value)}
            />
            <Select
              label="Currency"
              value={svcCurrency}
              onChange={(e) => setSvcCurrency(e.target.value)}
              options={SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: c.code }))}
            />
            <Input
              label="Estimated Hours"
              type="number"
              min="0"
              step="0.5"
              value={svcEstimatedHours}
              onChange={(e) => setSvcEstimatedHours(e.target.value)}
            />
          </div>
          <Textarea
            label="Deliverable Description"
            rows={2}
            value={svcDescription}
            onChange={(e) => setSvcDescription(e.target.value)}
          />
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={svcActive}
                onChange={(e) => setSvcActive(e.target.checked)}
              />
              <span>Active in Quotation & Invoice quick-insert picker</span>
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={svcTaxable}
                onChange={(e) => setSvcTaxable(e.target.checked)}
              />
              <span>Default taxable</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <Button variant="outline" onClick={() => setServiceModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Service Item</Button>
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

      <ConfirmDialog
        open={Boolean(deleteServiceTarget)}
        onClose={() => setDeleteServiceTarget(null)}
        onConfirm={async () => {
          if (!deleteServiceTarget) return;
          await repositories.deleteServiceItem(deleteServiceTarget.id);
          setDeleteServiceTarget(null);
          await refresh();
          pushToast({ tone: 'info', title: 'Service catalog item deleted' });
        }}
        title="Delete Service Item"
        description={`Delete "${deleteServiceTarget?.name}" from your service catalog?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
};

