import { toWorkspaceDateStr } from '../../domain/calculations/dates';
import { appSettingsSchema, type Task } from '../../domain/schemas/entities';
import type { SolodeskDatabase } from '../db';

export interface TaskCompletionMigrationResult {
  ran: boolean;
  backfilledCount: number;
  skippedCount: number;
}

function isValidTimestampString(value: string | undefined | null): value is string {
  if (!value || !value.trim()) return false;
  return toWorkspaceDateStr(value) !== '';
}

/**
 * Backward-compatible, idempotent one-time migration for legacy `done` tasks
 * that lack an explicit `completedAt` timestamp. Runs once per workspace DB
 * and records `appSettings.taskCompletionBackfilledAt` so subsequent edits or
 * intentionally invalid test timestamps are never silently overwritten.
 */
export async function runTaskCompletionTimestampMigration(
  database: SolodeskDatabase
): Promise<TaskCompletionMigrationResult> {
  const existingSettings = await database.appSettings.get('default');
  if (existingSettings?.taskCompletionBackfilledAt) {
    return { ran: false, backfilledCount: 0, skippedCount: 0 };
  }

  let backfilledCount = 0;
  let skippedCount = 0;
  const now = new Date().toISOString();

  await database.transaction('rw', [database.tasks, database.appSettings], async () => {
    const latestSettings = await database.appSettings.get('default');
    if (latestSettings?.taskCompletionBackfilledAt) return;
    const settings = latestSettings ?? appSettingsSchema.parse({ id: 'default', updatedAt: now });

    const allTasks = await database.tasks.toArray();
    for (const task of allTasks) {
      if (task.status !== 'done') continue;
      if (isValidTimestampString(task.completedAt)) continue;

      const candidate = isValidTimestampString(task.createdAt)
        ? isValidTimestampString(task.updatedAt) && task.updatedAt >= task.createdAt
          ? task.updatedAt
          : task.createdAt
        : isValidTimestampString(task.updatedAt)
          ? task.updatedAt
          : '';

      if (!candidate) {
        skippedCount += 1;
        continue;
      }

      const patched: Task = {
        ...task,
        completedAt: candidate,
      };
      await database.tasks.put(patched);
      backfilledCount += 1;
    }

    const afterTasksLatest = (await database.appSettings.get('default')) ?? settings;
    await database.appSettings.put(
      appSettingsSchema.parse({
        ...afterTasksLatest,
        id: 'default',
        taskCompletionBackfilledAt: now,
        updatedAt: now,
      })
    );
  });

  return {
    ran: true,
    backfilledCount,
    skippedCount,
  };
}
