import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('SOLODESK AI — Chromium End-to-End Verification', () => {
  test('verifies onboarding, desktop & mobile responsiveness, CRM persistence, workflows, timer reload recovery, RAG check, diagnostics, and offline PWA', async ({
    page,
    context,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    const failedUrls: string[] = [];

    page.on('requestfailed', (req) => {
      failedUrls.push(`${req.url()} (${req.failure()?.errorText ?? 'unknown'})`);
    });
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        const locUrl = msg.location()?.url ?? '';
        if (
          !text.includes('fonts.googleapis.com') &&
          !text.includes('fonts.gstatic.com') &&
          !locUrl.includes('fonts.googleapis.com') &&
          !locUrl.includes('fonts.gstatic.com') &&
          !text.includes('ERR_INTERNET_DISCONNECTED')
        ) {
          consoleErrors.push(`${text}${locUrl ? ` (${locUrl})` : ''}`);
        }
      }
    });

    // 1. Verify PWA assets are served cleanly
    const manifestRes = await page.request.get('/manifest.webmanifest');
    expect(manifestRes.status()).toBe(200);
    const manifestJson = await manifestRes.json();
    expect(manifestJson.name).toBe('SOLODESK AI');

    const swRes = await page.request.get('/sw.js');
    expect(swRes.status()).toBe(200);

    // 2. Desktop boot & onboarding with Sample Demo Data
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');

    await expect(page.getByText('Welcome to SOLODESK AI')).toBeVisible();
    await page.getByLabel('Business or Studio Name').fill('Northwind Digital');
    await page.getByRole('button', { name: /Launch Workspace/i }).click();
    await expect(page.getByText('Welcome to SOLODESK AI')).not.toBeVisible();

    // Dashboard metrics visible
    await expect(page.getByRole('heading', { name: /Welcome/i })).toBeVisible();
    await expect(page.getByText('Recorded Income')).toBeVisible();

    // Check zero horizontal overflow on desktop
    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(desktopOverflow).toBe(false);

    // 3. Create Client & verify persistence across full page reload
    await page.goto('/#/clients');
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Add Client/i }).click();
    await page.getByLabel(/Client Name/i).fill('E2E Horizon Labs');
    await page.getByLabel(/Email/i).fill('e2e@horizon.invalid');
    await page.getByRole('button', { name: /Create Client/i }).click();
    await expect(page.getByText('E2E Horizon Labs').first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
    await expect(page.getByText('E2E Horizon Labs').first()).toBeVisible();

    // 4. Proposals -> Accepted Proposal -> Approval-Gated Workflow -> Project & Tasks
    await page.goto('/#/proposals');
    await expect(page.getByRole('heading', { name: 'Proposals', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /New Proposal/i }).click();
    await page.getByLabel('Proposal Title').fill('E2E Cloud Migration');
    await page.getByLabel('Status').selectOption('accepted');
    await page.getByLabel(/Deliverables/i).fill('Architecture Audit\nDeployment Cutover');
    await page.getByRole('button', { name: /Create Proposal/i }).click();

    await page.getByText('E2E Cloud Migration').first().click();
    await page.getByRole('button', { name: /Generate Project & Tasks/i }).click();
    await expect(page.getByText(/Draft Deliverable Tasks/i)).toBeVisible();
    await page.getByRole('button', { name: /Approve & Create/i }).click();
    await expect(page.getByText(/Project & deliverable tasks created/i)).toBeVisible();

    // 5. Projects & Tasks populated from workflow
    await page.goto('/#/projects');
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
    await expect(page.getByText('E2E Cloud Migration').first()).toBeVisible();
    await page.goto('/#/tasks');
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible();
    await expect(page.getByText('Architecture Audit').first()).toBeVisible();

    // 6. Time Tracker persistent live global timer across view navigation and reload
    await page.goto('/#/time-tracker');
    await expect(page.getByRole('heading', { name: 'Time Tracker', exact: true })).toBeVisible();
    await page.getByLabel(/What are you working on/i).fill('E2E Sprint Timer');
    await page.getByRole('button', { name: /Start Timer/i }).click();
    await expect(page.getByText('E2E Sprint Timer').first()).toBeVisible();
    await expect(page.getByTestId('global-timer-indicator')).toBeVisible();

    // Navigate to Dashboard and verify global timer persists continuously in AppShell header
    await page.goto('/#/dashboard');
    await expect(page.getByTestId('global-timer-indicator')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('global-timer-indicator')).toBeVisible();
    await page.getByRole('button', { name: 'Stop global timer' }).click();
    await expect(page.getByTestId('global-timer-indicator')).not.toBeVisible();

    // 6b. Settings > Cloud Sync Auto-sync toggle persists across reload
    await page.goto('/#/settings-cloud-sync');
    await expect(page.getByText('Cloud Sync & Background Behavior')).toBeVisible();
    const autoSyncSwitch = page.getByRole('switch', { name: 'Auto-sync' });
    await expect(autoSyncSwitch).toBeChecked();
    await autoSyncSwitch.click();
    await expect(autoSyncSwitch).not.toBeChecked();
    await page.reload();
    await expect(page.getByRole('switch', { name: 'Auto-sync' })).not.toBeChecked();
    // Restore Auto-sync back to enabled
    await page.getByRole('switch', { name: 'Auto-sync' }).click();
    await expect(page.getByRole('switch', { name: 'Auto-sync' })).toBeChecked();

    // 7. Service Catalog -> Templates & Invoice Quick-Insert
    await page.goto('/#/templates');
    await expect(page.getByRole('heading', { name: 'Templates & Service Catalog', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /New Service Item/i }).click();
    await page.getByLabel('Service Name').fill('E2E UI Architecture');
    await page.getByLabel('Default Unit Price').fill('750');
    await page.getByRole('button', { name: /Save Service Item/i }).click();
    await page.getByRole('tab', { name: /Service Catalog/i }).click();
    await expect(page.getByText('E2E UI Architecture').first()).toBeVisible();

    await page.goto('/#/quotations');
    await expect(page.getByRole('heading', { name: 'Quotations', exact: true })).toBeVisible();
    await page.goto('/#/invoices');
    await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /New Invoice/i }).click();
    await page.getByLabel('Insert from Service Catalog').selectOption({ label: 'E2E UI Architecture ($750.00)' });
    await expect(page.locator('input[value="E2E UI Architecture"]')).toBeVisible();
    await page.getByRole('button', { name: /Cancel/i }).click();

    await page.goto('/#/payments');
    await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible();

    // 7b. Schedule & Follow-Ups + Automation Dry-Run
    await page.goto('/#/communication');
    await expect(page.getByRole('heading', { name: 'Schedule & Client Follow-Ups', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Schedule Meeting/i }).click();
    await page.getByLabel('Meeting Title').fill('E2E Discovery Sync');
    await page.getByRole('button', { name: /Save Meeting/i }).click();
    await expect(page.getByText('E2E Discovery Sync').first()).toBeVisible();

    await page.goto('/#/workflows');
    await expect(page.getByRole('heading', { name: /Automation & Integration Marketplace/i })).toBeVisible();
    await page.getByRole('button', { name: /Run Dry-Run Simulation/i }).click();
    await expect(page.getByText(/Condition Not Met|Condition Passed/i)).toBeVisible();

    await page.goto('/#/reports');
    await expect(page.getByRole('heading', { name: 'Financial Reports', exact: true })).toBeVisible();
    await expect(page.getByText('Project Estimates vs Actuals')).toBeVisible();
    await expect(page.getByText('What-If Financial Scenario Simulator')).toBeVisible();

    // 7c. Focus Mode + Daily Digest + Gantt + Vault + Client Portal + Security Center + Help/RTL
    await page.goto('/#/dashboard');
    await expect(page.getByText('Daily Digest')).toBeVisible();
    await page.getByRole('button', { name: 'Enter Focus Mode' }).click();
    await expect(page.getByRole('heading', { name: 'Focus Mode', exact: true })).toBeVisible();
    await expect(page.getByLabel('Primary Workspace Navigation')).not.toBeVisible();
    await page.getByRole('button', { name: 'Exit Focus Mode' }).first().click();
    await expect(page.getByLabel('Primary Workspace Navigation')).toBeVisible();

    await page.goto('/#/projects');
    await page.getByRole('button', { name: /Gantt Timeline/i }).click();
    await expect(page.getByRole('heading', { name: 'Project Gantt Timeline' })).toBeVisible();

    await page.goto('/#/vault');
    await expect(page.getByRole('heading', { name: /Document Vault/i })).toBeVisible();

    await page.goto('/#/client-portal');
    await expect(page.getByRole('heading', { name: /Client Experience & Scoped Portal/i })).toBeVisible();

    await page.goto('/#/security-center');
    await expect(page.getByRole('heading', { name: /Security, Privacy & Reliability Center/i })).toBeVisible();
    await page.getByRole('button', { name: /Run Non-Destructive Backup Recovery Test/i }).click();
    await expect(page.getByText(/AES-GCM roundtrip integrity/i).first()).toBeVisible();

    await page.goto('/#/help-plans');
    await expect(page.getByRole('heading', { name: /Help, Product Tour, Localization & Plans/i })).toBeVisible();

    // 8. Knowledge Hub: 14 built-in packs, dataset audit, local note, and 25-case Hybrid RAG v2 check
    await page.goto('/#/knowledge');
    await expect(page.getByRole('heading', { name: /Knowledge Hub/i })).toBeVisible();
    await page.getByRole('button', { name: /Load 14 Freelancer Packs/i }).click();
    await expect(page.getByText(/Installed 14 first-party MIT pack/i)).toBeVisible();

    await page.getByRole('button', { name: /Dataset Audit/i }).click();
    await expect(page.getByText('Dataset Registry & License Compliance Audit')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByLabel('Note Title').fill('E2E Payment SOP');
    await page.getByLabel('Collection', { exact: true }).fill('Finance');
    await page.getByLabel('Content').fill('All E2E retainers settle within Net-10 business days.');
    await page.getByRole('button', { name: /Save & Index Note/i }).click();
    await expect(page.getByText('E2E Payment SOP').first()).toBeVisible();

    await page.getByRole('button', { name: /Run Local RAG Check/i }).click();
    await expect(page.getByText(/25\/25 \(100%\)/i)).toBeVisible();

    // 9. AI Copilot offline deterministic draft, 15-Agent AI Workforce tab & zero stored secrets
    await page.goto('/#/ai-copilot');
    await expect(page.getByRole('heading', { name: 'AI Copilot', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Generate Offline Draft/i }).click();
    await expect(page.getByText(/Offline \/ Local Draft Mode active/i)).toBeVisible();

    await page.getByRole('tab', { name: /AI Workforce \(15 Agents\)/i }).click();
    await expect(page.getByText('Staged 15-Agent AI Workforce')).toBeVisible();
    await page.getByRole('button', { name: /Run Workspace Analyst Agent/i }).click();
    await expect(page.getByText(/Workspace Analyst Agent \[READ_ONLY\]/i)).toBeVisible();

    const storageCounts = await page.evaluate(() => ({
      ls: localStorage.length,
      ss: sessionStorage.length,
    }));
    expect(storageCounts.ls).toBe(0);
    expect(storageCounts.ss).toBe(0);

    // 10. Settings Privacy, Sync Card & Live Database Health Check (v5)
    await page.goto('/#/settings-privacy');
    await expect(page.getByText('Database Integrity & Diagnostics')).toBeVisible();
    await expect(page.getByText('Healthy', { exact: true })).toBeVisible();
    await expect(page.getByText('v5', { exact: true })).toBeVisible();
    await expect(page.getByText('Local Database Synchronization & Shortcuts')).toBeVisible();

    // 11. Weekly Digest toggle + Mobile responsiveness check (375x812) with zero horizontal overflow
    await page.goto('/#/dashboard');
    await page.getByRole('button', { name: 'Weekly', exact: true }).click();
    await expect(page.getByText('7-Day Income / Net')).toBeVisible();
    await page.getByRole('button', { name: 'Daily', exact: true }).click();

    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 812 });
      await page.goto('/#/dashboard');
      await expect(page.getByRole('heading', { name: /Welcome/i })).toBeVisible();
      await expect(page.getByText('Daily Digest')).toBeVisible();
      const hasOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(hasOverflow, `Horizontal overflow at ${width}px`).toBe(false);
    }

    // 12. Automated WCAG 2.0 A/AA Accessibility audit via @axe-core/playwright
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const route of ['/#/dashboard', '/#/clients', '/#/ai-copilot']) {
      await page.goto(route);
      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      const criticalViolations = axeResults.violations.filter(
        (v) => v.impact === 'critical'
      );
      expect(criticalViolations, `Critical axe violations on ${route}`).toEqual([]);
    }

    // 13. Isolated External Client Portal token session must NEVER expose admin navigation
    await page.goto('/#/client-portal?token=e2e-isolated-token-check');
    await expect(page.getByText('SOLODESK AI · Scoped Client Portal')).toBeVisible();
    await expect(page.getByLabel('Primary Workspace Navigation')).not.toBeVisible();

    // 14. Offline mode resilience + Offline indicator test
    await page.goto('/#/clients');
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByLabel('Browser is offline; working on local IndexedDB')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
    await expect(page.getByText('E2E Horizon Labs').first()).toBeVisible();
    await context.setOffline(false);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors, `Failed URLs: ${JSON.stringify(failedUrls)}`).toEqual([]);
  });
});
