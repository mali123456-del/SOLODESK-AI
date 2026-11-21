import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../../src/app/App';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import { clearSessionGeminiKey } from '../../src/ai/providers/providerFactory';

async function clearDb() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

describe('Phase 10-12: Settings, Localization, AI Key Memory-Only & Marketing View', () => {
  beforeEach(async () => {
    await clearDb();
    clearSessionGeminiKey();
    localStorage.clear();
    sessionStorage.clear();
    await repositories.saveSettings({ onboardingCompleted: true });
    window.location.hash = '#/dashboard';
  });

  it('persists business profile and currency localization settings to IndexedDB', async () => {
    render(<App />);

    const profileLink = await screen.findByRole('button', { name: 'Business Profile' }, { timeout: 5000 });
    fireEvent.click(profileLink);

    const nameInput = await screen.findByLabelText(/Studio \/ Business Name/i, {}, { timeout: 5000 });
    fireEvent.change(nameInput, { target: { value: 'Crescent Design Works' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Business Profile' }));

    await waitFor(
      async () => {
        const saved = await repositories.getBusinessProfile();
        expect(saved.businessName).toBe('Crescent Design Works');
      },
      { timeout: 5000 }
    );
    expect(await screen.findByText(/Business profile saved/i, {}, { timeout: 5000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Currency & Dates' }));
    const currencySelect = await screen.findByLabelText(/Default Currency/i, {}, { timeout: 5000 });
    fireEvent.change(currencySelect, { target: { value: 'PKR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Localization & Defaults' }));

    await waitFor(
      async () => {
        const savedSettings = await repositories.getSettings();
        expect(savedSettings.defaultCurrency).toBe('PKR');
      },
      { timeout: 5000 }
    );
  });

  it('navigates cleanly to Product & Pricing Overview (marketing view) and back', async () => {
    render(<App />);

    const overviewButtons = await screen.findAllByRole(
      'button',
      {
        name: /Product & Pricing Overview/i,
      },
      { timeout: 5000 }
    );
    fireEvent.click(overviewButtons[0]);

    expect(
      await screen.findByRole(
        'heading',
        { name: /Your Work\. Your Clients\. All in One Place\./i },
        { timeout: 5000 }
      )
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Go to Dashboard/i }));
    expect(
      await screen.findByRole('heading', { name: /Welcome/i }, { timeout: 5000 })
    ).toBeInTheDocument();
  });
});
