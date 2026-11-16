import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { db } from '../../src/database/db';
import { repositories } from '../../src/database/repositories/dexieRepositories';
import { ToastProvider } from '../../src/components/ui';
import { WorkspaceProvider } from '../../src/app/providers/WorkspaceProvider';
import { ClientsView } from '../../src/features/clients/ClientsView';
import { ProjectsView } from '../../src/features/projects/ProjectsView';
import { TasksView } from '../../src/features/tasks/TasksView';

async function clearDb() {
  await db.transaction(
    'rw',
    [
      db.businessProfile,
      db.appSettings,
      db.clients,
      db.projects,
      db.tasks,
      db.proposals,
      db.quotations,
      db.contracts,
      db.invoices,
      db.payments,
      db.financeEntries,
      db.timeEntries,
      db.templates,
      db.knowledgeDocs,
      db.documentChunks,
      db.activities,
      db.notifications,
    ],
    async () => {
      await Promise.all([
        db.businessProfile.clear(),
        db.appSettings.clear(),
        db.clients.clear(),
        db.projects.clear(),
        db.tasks.clear(),
        db.proposals.clear(),
        db.quotations.clear(),
        db.contracts.clear(),
        db.invoices.clear(),
        db.payments.clear(),
        db.financeEntries.clear(),
        db.timeEntries.clear(),
        db.templates.clear(),
        db.knowledgeDocs.clear(),
        db.documentChunks.clear(),
        db.activities.clear(),
        db.notifications.clear(),
      ]);
    }
  );
}

function renderWithWorkspace(ui: React.ReactNode) {
  return render(
    <ToastProvider>
      <WorkspaceProvider>{ui}</WorkspaceProvider>
    </ToastProvider>
  );
}

describe('Phase 3 & 4: Clients, Projects, Tasks UI & Persistence', () => {
  beforeEach(async () => {
    await clearDb();
  });

  it('creates a client and warns when a potential duplicate is typed', async () => {
    await repositories.createClient({
      name: 'Nadia Karim',
      company: 'Karim Textiles',
      email: 'nadia@karim.example',
      phone: '',
      website: '',
      location: 'Lahore',
      status: 'active',
      category: 'E-commerce',
      tags: ['Retainer'],
      notes: '',
      isDemo: false,
    });

    renderWithWorkspace(<ClientsView />);

    expect(await screen.findByText('Nadia Karim')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /add client/i }));
    const nameInput = await screen.findByLabelText(/client name/i);
    fireEvent.change(nameInput, { target: { value: 'Nadia Karim' } });

    expect(await screen.findByText(/potential duplicate detected/i)).toBeInTheDocument();
  });

  it('toggles a project milestone and updates completion progress', async () => {
    const client = await repositories.createClient({
      name: 'Omar Farooq',
      company: 'Farooq Logistics',
      email: 'omar@farooq.example',
      phone: '',
      website: '',
      location: 'Karachi',
      status: 'active',
      category: 'Logistics',
      tags: [],
      notes: '',
      isDemo: false,
    });

    await repositories.createProject({
      clientId: client.id,
      name: 'Fleet Dashboard',
      description: 'Dispatch monitoring panel',
      status: 'active',
      priority: 'high',
      startDate: '2026-11-01',
      dueDate: '2026-12-15',
      budget: 2000,
      agreedValue: 2500,
      currency: 'USD',
      hourlyRate: 60,
      progress: 0,
      milestones: [
        { id: 'ms_1', title: 'Wireframes', dueDate: '2026-11-10', completed: false },
        { id: 'ms_2', title: 'Production Release', dueDate: '2026-12-10', completed: false },
      ],
      notes: '',
      isDemo: false,
    });

    renderWithWorkspace(<ProjectsView />);

    const projectRow = await screen.findByText('Fleet Dashboard');
    fireEvent.click(projectRow);

    const msBtn = await screen.findByRole('button', { name: /wireframes/i });
    fireEvent.click(msBtn);

    await waitFor(async () => {
      const updated = await repositories.listProjects();
      expect(updated[0].progress).toBe(50);
    });
  });

  it('switches between Task List and Kanban views and completes a task', async () => {
    await repositories.createTask({
      title: 'Finalize invoice PDF layout',
      description: '',
      projectId: '',
      clientId: '',
      priority: 'high',
      status: 'todo',
      dueDate: '2026-11-20',
      tags: ['UI'],
      subtasks: [],
      completedAt: '',
      isDemo: false,
    });

    renderWithWorkspace(<TasksView />);

    expect(await screen.findByText('Finalize invoice PDF layout')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /kanban/i }));
    expect(await screen.findByText('To Do')).toBeInTheDocument();
    expect(screen.getByText('In Review')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /list/i }));
    const completeBtn = await screen.findByRole('button', {
      name: /complete finalize invoice pdf layout/i,
    });
    fireEvent.click(completeBtn);

    await waitFor(async () => {
      const all = await repositories.listTasks();
      expect(all[0].status).toBe('done');
    });
  });
});
