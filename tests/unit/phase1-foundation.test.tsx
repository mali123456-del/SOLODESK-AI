import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { App } from '../../src/app/App';
import { ConfirmDialog, Input } from '../../src/components/ui';

describe('Phase 1 — Foundation & Design System', () => {
  it('renders SOLODESK AI shell and supports route navigation', async () => {
    window.location.hash = '';
    render(<App />);
    expect(screen.getAllByText(/SOLODESK/i).length).toBeGreaterThan(0);
    const clientsBtn = screen.getAllByRole('button', { name: /^Clients$/i })[0];
    fireEvent.click(clientsBtn);
    expect(window.location.hash).toBe('#/clients');
    expect(await screen.findByRole('heading', { name: 'Clients' })).toBeInTheDocument();
  });

  it('toggles light and dark theme class on documentElement', () => {
    render(<App />);
    const toggle = screen.getByRole('button', { name: /switch to dark mode|switch to light mode/i });
    const hadDark = document.documentElement.classList.contains('dark');
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains('dark')).toBe(!hadDark);
  });

  it('renders accessible form input error state', () => {
    render(<Input label="Client Email" error="Valid email is required" />);
    const input = screen.getByLabelText('Client Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Valid email is required');
  });

  it('supports Escape close and confirmation action in ConfirmDialog', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        onClose={onClose}
        onConfirm={onConfirm}
        title="Archive client"
        description="Are you sure you want to archive this client?"
        confirmLabel="Archive"
        danger
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
