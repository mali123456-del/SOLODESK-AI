import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { getAgentDefinition } from '../../src/ai/agents/agentRegistry';
import { auditDatasetRegistry } from '../../src/ai/datasets/registry/datasetRegistry';
import { AI_PROVIDER_REGISTRY } from '../../src/ai/providers/registry';
import { WorkspaceProvider, useWorkspace } from '../../src/app/providers/WorkspaceProvider';
import { ThemeProvider } from '../../src/app/providers/ThemeProvider';
import { ToastProvider } from '../../src/components/ui';
import { db } from '../../src/database/db';
import { SettingsView } from '../../src/features/settings/SettingsView';
import {
  buildAppointmentIcsContent,
  buildMailtoDraftHref,
  CALENDAR_EMAIL_CONNECTOR_CATALOG,
} from '../../src/integrations/calendarEmailAdapter';
import {
  initiateHostedCheckoutSession,
  verifyPaymentWebhookPayload,
} from '../../src/integrations/paymentConnectors';
import { computeSyncBackoffDelayMs } from '../../src/services/cloudSyncService';
import { validateFeatureRegistry } from '../../src/types/featureRegistry';

const GlobalTimerHarness: React.FC = () => {
  const {
    loading,
    runningTimer,
    timerElapsedSeconds,
    startGlobalTimer,
    stopGlobalTimer,
    autoSyncEnabled,
    setAutoSyncEnabled,
  } = useWorkspace();
  const [activeTab, setActiveTab] = React.useState<'tracker' | 'dashboard'>('tracker');

  if (loading) return <div>Loading workspace...</div>;

  return (
    <div>
      <button type="button" onClick={() => setActiveTab('tracker')}>
        Go Tracker
      </button>
      <button type="button" onClick={() => setActiveTab('dashboard')}>
        Go Dashboard
      </button>
      <button
        type="button"
        onClick={() =>
          void startGlobalTimer({
            description: 'Offline Cross-View Sprint',
            hourlyRate: 95,
            billable: true,
          })
        }
      >
        Start Global Harness Timer
      </button>
      <button type="button" onClick={() => void stopGlobalTimer()}>
        Stop Global Harness Timer
      </button>
      <button type="button" onClick={() => void setAutoSyncEnabled(!autoSyncEnabled)}>
        Toggle Auto-sync State
      </button>
      <span data-testid="harness-tab">{activeTab}</span>
      <span data-testid="harness-autosync">{String(autoSyncEnabled)}</span>
      <span data-testid="harness-timer-desc">{runningTimer?.description ?? 'none'}</span>
      <span data-testid="harness-elapsed">{timerElapsedSeconds}</span>
    </div>
  );
};

describe('Phases 36–60: Global Timer, Auto-Sync Toggle, Feature Registry, Connectors & AI Governance', () => {
  beforeEach(async () => {
    await db.appSettings.clear();
    await db.timeEntries.clear();
    await db.securityAuditLogs.clear();
  });

  it('persists global running timer across simulated view switches and toggles Auto-sync in WorkspaceProvider', async () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <WorkspaceProvider>
            <GlobalTimerHarness />
          </WorkspaceProvider>
        </ToastProvider>
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading workspace...')).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('harness-autosync').textContent).toBe('true');
    expect(screen.getByTestId('harness-timer-desc').textContent).toBe('none');

    // Start global timer
    fireEvent.click(screen.getByText('Start Global Harness Timer'));
    await waitFor(() => {
      expect(screen.getByTestId('harness-timer-desc').textContent).toBe(
        'Offline Cross-View Sprint'
      );
    });

    // Navigate between views — timer remains active in WorkspaceProvider
    fireEvent.click(screen.getByText('Go Dashboard'));
    expect(screen.getByTestId('harness-tab').textContent).toBe('dashboard');
    expect(screen.getByTestId('harness-timer-desc').textContent).toBe('Offline Cross-View Sprint');

    // Toggle Auto-sync off and verify persistence in IndexedDB appSettings
    fireEvent.click(screen.getByText('Toggle Auto-sync State'));
    await waitFor(() => {
      expect(screen.getByTestId('harness-autosync').textContent).toBe('false');
    });
    const stored = await db.appSettings.get('default');
    expect(stored?.autoSyncEnabled).toBe(false);

    // Stop global timer
    fireEvent.click(screen.getByText('Stop Global Harness Timer'));
    await waitFor(() => {
      expect(screen.getByTestId('harness-timer-desc').textContent).toBe('none');
    });
  });

  it('renders accessible Auto-sync switch in Settings > Cloud Sync section', async () => {
    render(
      <ThemeProvider>
        <ToastProvider>
          <WorkspaceProvider>
            <SettingsView section="settings-cloud-sync" onNavigate={() => {}} />
          </WorkspaceProvider>
        </ToastProvider>
      </ThemeProvider>
    );

    const toggle = await screen.findByRole('switch', { name: 'Auto-sync' });
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).not.toBeChecked();
    });
  });

  it('validates complete 20-group Feature Panel Registry, sync backoff, AI provider policies, and agent budgets', () => {
    const regCheck = validateFeatureRegistry();
    expect(regCheck.valid).toBe(true);
    expect(regCheck.totalGroups).toBe(20);

    expect(computeSyncBackoffDelayMs(0)).toBe(1500);
    expect(computeSyncBackoffDelayMs(3)).toBe(12_000);
    expect(computeSyncBackoffDelayMs(20)).toBe(60_000);

    expect(AI_PROVIDER_REGISTRY.gemini.rateLimitRpm).toBeGreaterThan(0);
    expect(AI_PROVIDER_REGISTRY.gemini.timeoutMs).toBeGreaterThan(0);

    const orchestrator = getAgentDefinition('solodesk_orchestrator');
    expect(orchestrator.timeoutMs).toBe(25_000);
    expect(orchestrator.tokenBudget).toBe(8192);
    expect(orchestrator.inputSchema).toBeDefined();

    const dsAudit = auditDatasetRegistry();
    expect(
      dsAudit.rejectedEntries.every((e) => e.redistributionStatus === 'prohibited_not_bundled')
    ).toBe(true);
  });

  it('generates offline ICS/mailto artifacts and enforces strict payment webhook & checkout checks', () => {
    const ics = buildAppointmentIcsContent({
      title: 'Architecture Review',
      date: '2026-11-20',
      startTime: '14:30',
      durationMinutes: 45,
      location: 'Video',
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Architecture Review');

    const mailto = buildMailtoDraftHref({
      to: 'client@example.com',
      subject: 'Proposal Ready',
      body: 'Hello team',
    });
    expect(mailto).toContain('mailto:client%40example.com?subject=Proposal%20Ready');
    expect(CALENDAR_EMAIL_CONNECTOR_CATALOG.some((c) => c.mode === 'offline_supported')).toBe(true);

    const checkout = initiateHostedCheckoutSession({
      provider: 'payfast_pk',
      workspaceId: 'ws_1',
      invoiceId: 'inv_1',
      amountCents: 15000,
      currency: 'PKR',
    });
    expect(checkout.blocked).toBe(true);
    expect(checkout.reason).toContain('BLOCKED');

    const seen = new Set<string>(['evt_already_processed']);
    expect(
      verifyPaymentWebhookPayload({
        provider: 'payfast_pk',
        expectedAmountCents: 15000,
        expectedCurrency: 'PKR',
        receivedAmountCents: 15000,
        receivedCurrency: 'PKR',
        eventId: 'evt_already_processed',
        seenEventIds: seen,
        signatureValid: true,
      }).accepted
    ).toBe(false);

    expect(
      verifyPaymentWebhookPayload({
        provider: 'safepay',
        expectedAmountCents: 15000,
        expectedCurrency: 'PKR',
        receivedAmountCents: 12000,
        receivedCurrency: 'PKR',
        eventId: 'evt_fresh_1',
        seenEventIds: seen,
        signatureValid: true,
      }).accepted
    ).toBe(false);

    expect(
      verifyPaymentWebhookPayload({
        provider: 'safepay',
        expectedAmountCents: 15000,
        expectedCurrency: 'PKR',
        receivedAmountCents: 15000,
        receivedCurrency: 'PKR',
        eventId: 'evt_fresh_2',
        seenEventIds: seen,
        signatureValid: true,
      }).accepted
    ).toBe(true);
  });
});
