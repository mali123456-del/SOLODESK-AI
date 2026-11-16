import { expect, test } from '@playwright/test';

test.describe('SOLODESK AI — Chromium End-to-End Verification', () => {
  test('verifies onboarding, desktop & mobile responsiveness, CRM persistence, workflows, timer reload recovery, RAG check, diagnostics, and offline PWA', async ({
    page,
    context,
  }) => {
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];

    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (
          !text.includes('fonts.googleapis.com') &&
          !text.includes('fonts.gstatic.com') &&
          !text.includes('ERR_INTERNET_DISCONNECTED')
        ) {
          consoleErrors.push(text);
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

    // 6. Time Tracker persistent live timer across reload
    await page.goto('/#/time-tracker');
    await expect(page.getByRole('heading', { name: 'Time Tracker', exact: true })).toBeVisible();
    await page.getByLabel(/What are you working on/i).fill('E2E Sprint Timer');
    await page.getByRole('button', { name: /Start Timer/i }).click();
    await expect(page.getByText('E2E Sprint Timer').first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Time Tracker', exact: true })).toBeVisible();
    await expect(page.getByText('E2E Sprint Timer').first()).toBeVisible();
    await page.getByRole('button', { name: /Stop Timer/i }).click();

    // 7. Invoices, Quotations & Payments rendering cleanly
    await page.goto('/#/quotations');
    await expect(page.getByRole('heading', { name: 'Quotations', exact: true })).toBeVisible();
    await page.goto('/#/invoices');
    await expect(page.getByRole('heading', { name: 'Invoices', exact: true })).toBeVisible();
    await page.goto('/#/payments');
    await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible();

    // 8. Knowledge Hub: local note, offline search, and 6-case RAG check
    await page.goto('/#/knowledge');
    await expect(page.getByRole('heading', { name: 'Knowledge Hub', exact: true })).toBeVisible();
    await page.getByLabel('Note Title').fill('E2E Payment SOP');
    await page.getByLabel('Collection', { exact: true }).fill('Finance');
    await page.getByLabel('Content').fill('All E2E retainers settle within Net-10 business days.');
    await page.getByRole('button', { name: /Save & Index Note/i }).click();
    await expect(page.getByText('E2E Payment SOP').first()).toBeVisible();

    await page.getByRole('button', { name: /Run Local RAG Check/i }).click();
    await expect(page.getByText(/6\/6 \(100%\)/i)).toBeVisible();

    // 9. AI Copilot offline deterministic draft & zero stored secrets
    await page.goto('/#/ai-copilot');
    await expect(page.getByRole('heading', { name: 'AI Copilot', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Generate Offline Draft/i }).click();
    await expect(page.getByText(/Offline \/ Local Draft Mode active/i)).toBeVisible();
    const storageCounts = await page.evaluate(() => ({
      ls: localStorage.length,
      ss: sessionStorage.length,
    }));
    expect(storageCounts.ls).toBe(0);
    expect(storageCounts.ss).toBe(0);

    // 10. Settings Privacy & Live Database Health Check
    await page.goto('/#/settings-privacy');
    await expect(page.getByText('Database Integrity & Diagnostics')).toBeVisible();
    await expect(page.getByText('Healthy', { exact: true })).toBeVisible();
    await expect(page.getByText('v3', { exact: true })).toBeVisible();

    // 11. Mobile responsiveness check (375x812) with zero horizontal overflow
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/#/dashboard');
    await expect(page.getByRole('heading', { name: /Welcome/i })).toBeVisible();
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(mobileOverflow).toBe(false);

    // 12. Offline mode resilience test
    await context.setOffline(true);
    await page.goto('/#/clients');
    await expect(page.getByRole('heading', { name: 'Clients', exact: true })).toBeVisible();
    await expect(page.getByText('E2E Horizon Labs').first()).toBeVisible();
    await context.setOffline(false);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
