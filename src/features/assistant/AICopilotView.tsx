import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  Copy,
  KeyRound,
  Play,
  ShieldAlert,
  Sparkles,
  Square,
  WifiOff,
  X,
} from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { runActionWithApproval } from '../../ai/agent/actionApproval';
import {
  runCopilotPrompt,
  type CopilotPresetTask,
  type CopilotRunResponse,
} from '../../ai/agent/agent';
import type { ProposedAgentAction } from '../../ai/agent/schemas';
import {
  AGENT_WORKFORCE_REGISTRY,
  runWorkforceAgent,
  type AgentAutonomyClass,
  type AgentId,
  type AgentRunResult,
} from '../../ai/agents/agentRegistry';
import { evaluateDraftQuality } from '../../ai/evaluation/evaluation';
import {
  clearSessionGeminiKey,
  createAIProvider,
  getSessionGeminiKey,
  hasSessionGeminiKey,
  maskApiKey,
  setSessionGeminiKey,
} from '../../ai/providers/providerFactory';
import type { AIProviderId } from '../../ai/providers/AIProvider';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Input,
  PageHeader,
  Select,
  Tabs,
  Textarea,
  useToast,
} from '../../components/ui';
import type { AppRouteId } from '../../types/navigation';

interface AICopilotViewProps {
  onNavigate?: (route: AppRouteId) => void;
}

const PRESET_DEFINITIONS: {
  id: CopilotPresetTask;
  label: string;
  prompt: string;
}[] = [
  {
    id: 'proposal_draft',
    label: 'Proposal Draft',
    prompt:
      'Draft a concise, client-ready project proposal outline including scope, milestones, timeline, and assumptions based on the selected project and Knowledge Hub notes.',
  },
  {
    id: 'client_email',
    label: 'Client Update Email',
    prompt:
      'Write a clear, professional client progress update email summarizing current status, next deliverables, and any questions needed to stay on schedule.',
  },
  {
    id: 'invoice_followup',
    label: 'Invoice Follow-Up',
    prompt:
      'Draft a polite, firm invoice payment follow-up email referencing our standard payment terms without sounding confrontational.',
  },
  {
    id: 'project_summary',
    label: 'Project Summary',
    prompt:
      'Summarize the current workspace and selected project priorities into an actionable weekly freelance checklist.',
  },
  {
    id: 'rewrite_professional',
    label: 'Rewrite Professionally',
    prompt:
      'Rewrite the following rough notes into a polished, friendly client message:\n\n"Hey, almost done with the layouts, just waiting on your brand logo files so I can wrap up milestone 1 by Friday."',
  },
];

export const AICopilotView: React.FC<AICopilotViewProps> = ({ onNavigate }) => {
  const { clients, projects, refresh } = useWorkspace();
  const { pushToast } = useToast();

  const [preset, setPreset] = useState<CopilotPresetTask>('proposal_draft');
  const [prompt, setPrompt] = useState(PRESET_DEFINITIONS[0].prompt);
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [useKnowledgeRag, setUseKnowledgeRag] = useState(true);
  const [includeWorkspaceContext, setIncludeWorkspaceContext] = useState(true);
  const [consentExternal, setConsentExternal] = useState(false);
  const [providerPreference, setProviderPreference] = useState<'auto' | AIProviderId>('auto');

  const [sessionKeyInput, setSessionKeyInput] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(() => hasSessionGeminiKey());

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CopilotRunResponse | null>(null);
  const [handledActionIds, setHandledActionIds] = useState<Record<string, 'approved' | 'rejected'>>({});

  // Phase 28: Staged 15-Agent Workforce Console state
  const [activeTab, setActiveTab] = useState<'studio' | 'workforce'>('studio');
  const [agentClassFilter, setAgentClassFilter] = useState<'all' | AgentAutonomyClass>('all');
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId>('workspace_analyst');
  const [agentGoal, setAgentGoal] = useState(
    'Review active project priorities, open invoice aging, and top deliverables for this week.'
  );
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentRunResult, setAgentRunResult] = useState<AgentRunResult | null>(null);
  const [agentRunHistory, setAgentRunHistory] = useState<AgentRunResult[]>([]);
  const agentAbortRef = useRef<AbortController | null>(null);

  const filteredAgents = useMemo(
    () =>
      agentClassFilter === 'all'
        ? AGENT_WORKFORCE_REGISTRY
        : AGENT_WORKFORCE_REGISTRY.filter((a) => a.autonomyClass === agentClassFilter),
    [agentClassFilter]
  );

  const selectedAgent = useMemo(
    () => AGENT_WORKFORCE_REGISTRY.find((a) => a.id === selectedAgentId) ?? AGENT_WORKFORCE_REGISTRY[0],
    [selectedAgentId]
  );

  const activeProvider = useMemo(
    () => createAIProvider(providerPreference),
    [providerPreference, keyConfigured]
  );

  const activeProjects = useMemo(
    () => (clientId ? projects.filter((p) => p.clientId === clientId) : projects),
    [projects, clientId]
  );

  const qualityReport = useMemo(
    () => (result ? evaluateDraftQuality(result.text) : null),
    [result]
  );

  const handleSelectPreset = (nextPreset: CopilotPresetTask) => {
    setPreset(nextPreset);
    const found = PRESET_DEFINITIONS.find((p) => p.id === nextPreset);
    if (found) setPrompt(found.prompt);
  };

  const handleApplySessionKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionKeyInput.trim()) return;
    setSessionGeminiKey(sessionKeyInput);
    setSessionKeyInput('');
    setKeyConfigured(hasSessionGeminiKey());
    pushToast({
      tone: 'success',
      title: 'Session Gemini key set',
      description: 'Key is held in memory only and will clear automatically when this tab closes.',
    });
  };

  const handleClearKey = () => {
    clearSessionGeminiKey();
    setKeyConfigured(false);
    pushToast({
      tone: 'info',
      title: 'Session key cleared',
      description: 'Switched back to offline local draft mode.',
    });
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    try {
      const response = await runCopilotPrompt({
        prompt,
        preset,
        useKnowledgeRag,
        includeWorkspaceContext,
        allowExternalContextTransmission: consentExternal,
        providerPreference,
        clientId: clientId || undefined,
        projectId: projectId || undefined,
      });
      setResult(response);
      setHandledActionIds({});
      if (response.usedFallbackFromError) {
        pushToast({
          tone: 'warning',
          title: 'Using offline fallback draft',
          description: `Gemini request failed (${response.usedFallbackFromError}). Showing deterministic local draft.`,
        });
      }
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Could not generate draft',
        description: err instanceof Error ? err.message : 'Unexpected Copilot error.',
      });
    } finally {
      setRunning(false);
    }
  };

  const handleCopyOutput = async () => {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      pushToast({
        tone: 'success',
        title: 'Copied to clipboard',
        description: 'Draft text is ready to paste.',
      });
    } catch {
      pushToast({
        tone: 'error',
        title: 'Clipboard unavailable',
        description: 'Select and copy the text manually.',
      });
    }
  };

  const handleActionDecision = async (action: ProposedAgentAction, approved: boolean) => {
    try {
      const outcome = await runActionWithApproval(action, approved);
      setHandledActionIds((prev) => ({
        ...prev,
        [action.id]: approved ? 'approved' : 'rejected',
      }));
      if (outcome.executed && outcome.result) {
        await refresh();
        pushToast({
          tone: 'success',
          title: 'Action executed',
          description: outcome.result.summary,
        });
      } else {
        pushToast({
          tone: 'info',
          title: 'Action dismissed',
          description: 'No workspace records were modified.',
        });
      }
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Action blocked',
        description: err instanceof Error ? err.message : 'Could not execute action.',
      });
    }
  };

  const handleRunWorkforceAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentGoal.trim()) return;
    agentAbortRef.current?.abort();
    const controller = new AbortController();
    agentAbortRef.current = controller;
    setAgentRunning(true);
    try {
      const outcome = await runWorkforceAgent({
        agentId: selectedAgentId,
        goal: agentGoal,
        clientId: clientId || undefined,
        projectId: projectId || undefined,
        providerPreference,
        allowExternalContextTransmission: consentExternal,
        signal: controller.signal,
      });
      setAgentRunResult(outcome);
      setAgentRunHistory((prev) => [outcome, ...prev].slice(0, 8));
      setHandledActionIds({});
      if (outcome.status === 'cancelled') {
        pushToast({ tone: 'info', title: 'Agent run cancelled cleanly' });
      } else if (outcome.status === 'failed') {
        pushToast({ tone: 'error', title: 'Agent run failed', description: outcome.errorMessage });
      }
    } finally {
      agentAbortRef.current = null;
      setAgentRunning(false);
    }
  };

  const handleCancelWorkforceAgent = () => {
    agentAbortRef.current?.abort();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Copilot"
        description="Draft proposals, client emails, and run least-privilege AI Workforce agents offline or with Gemini 4 Hydrogen."
        actions={
          onNavigate && (
            <Button variant="outline" onClick={() => onNavigate('knowledge')}>
              Open Knowledge Hub
            </Button>
          )
        }
      />

      <Tabs
        activeId={activeTab}
        onChange={(id) => setActiveTab(id as 'studio' | 'workforce')}
        items={[
          { id: 'studio', label: 'Copilot Studio' },
          { id: 'workforce', label: `AI Workforce (${AGENT_WORKFORCE_REGISTRY.length} Agents)` },
        ]}
      />

      <Card>
        <CardHeader
          title="Provider & Security Mode"
          description="SOLODESK AI never stores API keys in browser storage, IndexedDB, or JSON backups."
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone={activeProvider.isConfigured() && activeProvider.id !== 'mock' ? 'success' : 'neutral'}>
                {activeProvider.id === 'gemini' && keyConfigured
                  ? `Gemini 4 Hydrogen (${maskApiKey(getSessionGeminiKey())})`
                  : activeProvider.label}
              </Badge>
              {onNavigate && (
                <Button size="sm" variant="outline" onClick={() => onNavigate('settings-ai')}>
                  Configure Providers
                </Button>
              )}
            </div>
          }
        />

        <div className="mb-4 max-w-xs">
          <Select
            label="AI Adapter Preference"
            value={providerPreference}
            onChange={(e) => setProviderPreference(e.target.value as 'auto' | AIProviderId)}
            options={[
              { value: 'auto', label: 'Auto (Gemini → OpenAI → Ollama → Offline)' },
              { value: 'gemini', label: 'Gemini 4 Hydrogen' },
              { value: 'openai_compatible', label: 'OpenAI-Compatible Endpoint' },
              { value: 'ollama', label: 'Local Ollama' },
              { value: 'mock', label: 'Offline Deterministic Templates' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
          <form onSubmit={handleApplySessionKey} className="lg:col-span-7 flex flex-col sm:flex-row gap-2.5 sm:items-end">
            <div className="flex-1">
              <Input
                type="password"
                label="Optional Session Gemini API Key (Memory-Only)"
                placeholder="Paste Gemini API key for gemini-4-hydrogen..."
                leftIcon={<KeyRound className="w-4 h-4" />}
                value={sessionKeyInput}
                onChange={(e) => setSessionKeyInput(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" disabled={!sessionKeyInput.trim()}>
              Set Session Key
            </Button>
            {keyConfigured && (
              <Button type="button" variant="outline" onClick={handleClearKey}>
                Clear Key
              </Button>
            )}
          </form>

          <div className="lg:col-span-5 p-3 rounded-lg bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Browser BYOK Notice</p>
              <p className="mt-0.5 leading-relaxed">
                Keys stay strictly in JS memory for this tab session. Never paste secrets on shared devices.
              </p>
            </div>
          </div>
        </div>
      </Card>

      {activeTab === 'workforce' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <Card>
              <CardHeader
                title="Staged 15-Agent AI Workforce"
                description="Least-privilege tool scopes enforced across Read-Only, Draft-Only, and Approval-Required tiers."
              />
              <div className="space-y-3">
                <Select
                  label="Autonomy Class Filter"
                  value={agentClassFilter}
                  onChange={(e) => setAgentClassFilter(e.target.value as 'all' | AgentAutonomyClass)}
                  options={[
                    { value: 'all', label: `All Agents (${AGENT_WORKFORCE_REGISTRY.length})` },
                    { value: 'read_only', label: 'Class 1 · Read-Only (7)' },
                    { value: 'draft_only', label: 'Class 2 · Draft-Only (6)' },
                    { value: 'approval_required', label: 'Class 3 · Approval-Required (2)' },
                  ]}
                />

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {filteredAgents.map((agent) => {
                    const active = agent.id === selectedAgentId;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => setSelectedAgentId(agent.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors cursor-pointer ${
                          active
                            ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 dark:border-blue-500'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-[#101827]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">
                            {agent.name}
                          </span>
                          <Badge
                            tone={
                              agent.autonomyClass === 'read_only'
                                ? 'info'
                                : agent.autonomyClass === 'draft_only'
                                  ? 'neutral'
                                  : 'warning'
                            }
                          >
                            {agent.autonomyClass.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                          {agent.roleSummary}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <Card>
              <CardHeader
                title={selectedAgent.name}
                description={selectedAgent.roleSummary}
                action={
                  <Badge
                    tone={
                      selectedAgent.autonomyClass === 'read_only'
                        ? 'info'
                        : selectedAgent.autonomyClass === 'draft_only'
                          ? 'neutral'
                          : 'warning'
                    }
                  >
                    {selectedAgent.autonomyClass}
                  </Badge>
                }
              />

              <form onSubmit={handleRunWorkforceAgent} className="space-y-4">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#101827]/70 text-xs space-y-1">
                  <p className="font-semibold text-slate-700 dark:text-slate-200">
                    Allowlisted Tools ({selectedAgent.allowedTools.length})
                  </p>
                  <p className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    {selectedAgent.allowedTools.join(', ')}
                  </p>
                  {selectedAgent.canDelegateTo && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Scoped Sub-Agents (intersection enforced): {selectedAgent.canDelegateTo.join(', ')}
                    </p>
                  )}
                </div>

                <Textarea
                  label="Agent Goal / Prompt"
                  required
                  rows={3}
                  value={agentGoal}
                  onChange={(e) => setAgentGoal(e.target.value)}
                />

                <div className="flex items-center gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    loading={agentRunning}
                    icon={<Play className="w-4 h-4" />}
                  >
                    Run {selectedAgent.name}
                  </Button>
                  {agentRunning && (
                    <Button
                      type="button"
                      variant="outline"
                      icon={<Square className="w-3.5 h-3.5" />}
                      onClick={handleCancelWorkforceAgent}
                    >
                      Cancel Run
                    </Button>
                  )}
                </div>
              </form>

              {agentRunResult && (
                <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Badge tone={agentRunResult.status === 'completed' ? 'success' : 'warning'}>
                        {agentRunResult.status}
                      </Badge>
                      <span className="font-mono tabular-nums text-slate-500">
                        {agentRunResult.durationMs} ms · ~{agentRunResult.estimatedTokens} tokens
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500">
                      Tools: {agentRunResult.toolsInvoked.join(', ') || 'none'}
                    </span>
                  </div>

                  <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101827] text-xs whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-100">
                    {agentRunResult.outputText}
                  </div>

                  {agentRunResult.proposedActions.map((action) => {
                    const decision = handledActionIds[action.id];
                    return (
                      <div
                        key={action.id}
                        className="p-3 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold">{action.title}</span>
                            <Badge tone="warning">Requires Approval</Badge>
                          </div>
                          <p className="text-[11px] text-slate-600 dark:text-slate-300">{action.summary}</p>
                        </div>
                        {decision ? (
                          <Badge tone={decision === 'approved' ? 'success' : 'neutral'}>
                            {decision === 'approved' ? 'Executed' : 'Dismissed'}
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleActionDecision(action, false)}
                            >
                              Dismiss
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => void handleActionDecision(action, true)}
                            >
                              Approve & Create
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {agentRunHistory.length > 0 && (
                <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Recent Workforce Runs
                  </p>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800 text-xs">
                    {agentRunHistory.map((h) => (
                      <div key={h.runId} className="py-2 flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                          {h.agentName} — {h.goal}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500 shrink-0">
                          {h.status} · {h.durationMs}ms
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'studio' && (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <Card>
            <CardHeader
              title="Drafting Studio"
              description="Choose a workflow preset and optional local context."
            />
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">
                  Quick Presets
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_DEFINITIONS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectPreset(item.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        preset === item.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-[#101827] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select
                  label="Client Context (Optional)"
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setProjectId('');
                  }}
                  options={[
                    { value: '', label: 'All workspace clients' },
                    ...clients
                      .filter((c) => c.status !== 'archived')
                      .map((c) => ({
                        value: c.id,
                        label: c.company ? `${c.name} (${c.company})` : c.name,
                      })),
                  ]}
                />
                <Select
                  label="Project Context (Optional)"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  options={[
                    { value: '', label: 'No specific project' },
                    ...activeProjects.map((p) => ({
                      value: p.id,
                      label: p.name,
                    })),
                  ]}
                />
              </div>

              <Textarea
                label="Prompt or Rough Notes"
                required
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want to draft..."
              />

              <div className="space-y-2.5 pt-1 text-sm">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useKnowledgeRag}
                    onChange={(e) => setUseKnowledgeRag(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    Ground with local <strong>Knowledge Hub</strong> citations (retrieved offline).
                  </span>
                </label>

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeWorkspaceContext}
                    onChange={(e) => setIncludeWorkspaceContext(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300"
                  />
                  <span className="text-slate-700 dark:text-slate-300 text-xs leading-relaxed">
                    Include verified summary of selected client, project, and invoice counts.
                  </span>
                </label>

                {(activeProvider.id === 'gemini' || activeProvider.id === 'openai_compatible') &&
                  (useKnowledgeRag || includeWorkspaceContext) && (
                  <label className="flex items-start gap-2.5 p-2.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/70 dark:bg-blue-950/30 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentExternal}
                      onChange={(e) => setConsentExternal(e.target.checked)}
                      className="mt-0.5 rounded border-blue-400"
                    />
                    <span className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
                      <strong>External API Consent:</strong> Allow sending the selected workspace summary and matching Knowledge Hub excerpts to {activeProvider.label}.
                    </span>
                  </label>
                )}
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                loading={running}
                icon={<Sparkles className="w-4 h-4" />}
              >
                {activeProvider.isConfigured() && activeProvider.id !== 'mock'
                  ? `Generate with ${activeProvider.label}`
                  : 'Generate Offline Draft'}
              </Button>
            </form>
          </Card>
        </div>

        <div className="lg:col-span-7 space-y-6">
          <Card>
            <CardHeader
              title="Generated Output"
              description={
                result
                  ? `Model: ${result.model} · ${result.isOfflineDraft ? 'Offline deterministic template' : 'Live Gemini response'}`
                  : 'Your draft, citations, and approval-gated actions will appear here.'
              }
              action={
                result && (
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Copy className="w-3.5 h-3.5" />}
                    onClick={() => void handleCopyOutput()}
                  >
                    Copy Draft
                  </Button>
                )
              }
            />

            {!result ? (
              <div className="py-12 text-center space-y-2">
                <Bot className="w-8 h-8 mx-auto text-slate-400" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Ready to draft offline or with Gemini
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  Select a preset on the left, review what local context is included, and generate a draft you can copy straight into proposals, contracts, or emails.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {result.isOfflineDraft && (
                  <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/70 flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                    <WifiOff className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" />
                    <span>
                      Offline / Local Draft Mode active — generated deterministically inside your browser with zero external API calls. Review bracketed fields before sending.
                    </span>
                  </div>
                )}

                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#101827] text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                  {result.text}
                </div>

                {qualityReport && qualityReport.warnings.length > 0 && (
                  <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Review Check ({qualityReport.wordCount} words)</span>
                    </div>
                    {qualityReport.warnings.map((w) => (
                      <p key={w}>• {w}</p>
                    ))}
                  </div>
                )}

                {result.citations.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Knowledge Hub Citations ({result.citations.length})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {result.citations.map((c) => (
                        <div
                          key={`${c.documentId}-${c.chunkIndex}`}
                          className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-[#101827]/60 space-y-1"
                        >
                          <p className="text-xs font-semibold text-slate-900 dark:text-white">
                            [{c.index}] {c.documentTitle}
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">
                            {c.excerpt}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {result.proposedActions.length > 0 && (
                  <div className="space-y-2.5 pt-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Approval-Gated Workspace Actions
                    </p>
                    {result.proposedActions.map((action) => {
                      const decision = handledActionIds[action.id];
                      return (
                        <div
                          key={action.id}
                          className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                {action.title}
                              </span>
                              <Badge tone="warning">Requires Approval</Badge>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                              {action.summary}
                            </p>
                          </div>

                          {decision ? (
                            <Badge tone={decision === 'approved' ? 'success' : 'neutral'}>
                              {decision === 'approved' ? 'Executed' : 'Dismissed'}
                            </Badge>
                          ) : (
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                icon={<X className="w-3.5 h-3.5" />}
                                onClick={() => void handleActionDecision(action, false)}
                              >
                                Dismiss
                              </Button>
                              <Button
                                size="sm"
                                variant="primary"
                                icon={<Check className="w-3.5 h-3.5" />}
                                onClick={() => void handleActionDecision(action, true)}
                              >
                                Approve & Create
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
      )}
    </div>
  );
};
