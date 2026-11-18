import { addDaysToDateStr, isDateOverdue, todayDateStr } from '../domain/calculations/dates';
import type { Priority, Project, Task } from '../domain/schemas/entities';

/**
 * Detects whether linking candidateTaskId -> dependsOnTaskId would create a circular dependency.
 */
export function wouldTaskCreateCycle(
  tasks: Task[],
  candidateTaskId: string,
  dependsOnTaskId: string
): boolean {
  if (!candidateTaskId || !dependsOnTaskId) return false;
  if (candidateTaskId === dependsOnTaskId) return true;

  const adj = new Map<string, string[]>();
  for (const task of tasks) {
    adj.set(task.id, [...(task.dependsOnIds ?? [])]);
  }
  const existing = adj.get(candidateTaskId) ?? [];
  if (!existing.includes(dependsOnTaskId)) {
    adj.set(candidateTaskId, [...existing, dependsOnTaskId]);
  }

  // DFS from dependsOnTaskId: if we can reach candidateTaskId, adding candidate -> dependsOn creates a cycle
  const visited = new Set<string>();
  const stack = [dependsOnTaskId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === candidateTaskId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of adj.get(cur) ?? []) {
      if (!visited.has(next)) stack.push(next);
    }
  }
  return false;
}

export interface CriticalPathSummary {
  criticalTaskIds: string[];
  criticalDurationHours: number;
  hasCycle: boolean;
  blockedTasks: Task[];
}

export function computeCriticalPath(tasks: Task[]): CriticalPathSummary {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    dependents.set(t.id, []);
  }

  for (const t of tasks) {
    for (const depId of t.dependsOnIds ?? []) {
      if (!taskMap.has(depId)) continue;
      inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
      dependents.get(depId)!.push(t.id);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const topo: string[] = [];
  const earliestFinish = new Map<string, number>();
  const predecessor = new Map<string, string | null>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    topo.push(id);
    const task = taskMap.get(id)!;
    const duration = Math.max(1, task.estimatedHours || 2);

    let bestPrevFinish = 0;
    let bestPrevId: string | null = null;
    for (const depId of task.dependsOnIds ?? []) {
      const fin = earliestFinish.get(depId);
      if (fin !== undefined && fin > bestPrevFinish) {
        bestPrevFinish = fin;
        bestPrevId = depId;
      }
    }
    earliestFinish.set(id, bestPrevFinish + duration);
    predecessor.set(id, bestPrevId);

    for (const nextId of dependents.get(id) ?? []) {
      const nextDeg = (inDegree.get(nextId) ?? 1) - 1;
      inDegree.set(nextId, nextDeg);
      if (nextDeg === 0) queue.push(nextId);
    }
  }

  const hasCycle = topo.length !== tasks.length;

  let endTaskId: string | null = null;
  let maxHours = 0;
  for (const [id, fin] of earliestFinish.entries()) {
    if (fin > maxHours) {
      maxHours = fin;
      endTaskId = id;
    }
  }

  const criticalTaskIds: string[] = [];
  let cursor = endTaskId;
  while (cursor) {
    criticalTaskIds.unshift(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }

  const blockedTasks = tasks.filter((t) => {
    if (t.status === 'done' || t.status === 'archived') return false;
    return (t.dependsOnIds ?? []).some((depId) => {
      const dep = taskMap.get(depId);
      return dep && dep.status !== 'done';
    });
  });

  return {
    criticalTaskIds,
    criticalDurationHours: Number(maxHours.toFixed(1)),
    hasCycle,
    blockedTasks,
  };
}

export function computeAutoPriorityScore(task: Task, today = todayDateStr()): number {
  const baseWeight: Record<Priority, number> = {
    urgent: 50,
    high: 35,
    medium: 20,
    low: 10,
  };
  let score = baseWeight[task.priority] ?? 20;
  if (task.status === 'done' || task.status === 'archived') return 0;

  if (task.dueDate) {
    if (isDateOverdue(task.dueDate, today)) {
      score += 40;
    } else if (task.dueDate === today) {
      score += 30;
    } else if (task.dueDate <= addDaysToDateStr(today, 3)) {
      score += 18;
    } else if (task.dueDate <= addDaysToDateStr(today, 7)) {
      score += 8;
    }
  }

  if (task.status === 'review') score += 6;
  return Math.min(100, score);
}

export interface ProjectHealthIndicator {
  status: 'healthy' | 'at_risk' | 'critical';
  label: string;
  reasons: string[];
}

export function evaluateProjectHealth(
  project: Project,
  projectTasks: Task[],
  today = todayDateStr()
): ProjectHealthIndicator {
  const reasons: string[] = [];
  const openTasks = projectTasks.filter((t) => t.status !== 'done' && t.status !== 'archived');
  const overdueTasks = openTasks.filter((t) => t.dueDate && isDateOverdue(t.dueDate, today));
  const openHighRisks = (project.risks ?? []).filter(
    (r) => r.status === 'open' && r.severity === 'high'
  );

  if (project.dueDate && project.status !== 'completed' && isDateOverdue(project.dueDate, today)) {
    reasons.push('Project due date has passed.');
  }
  if (overdueTasks.length > 0) {
    reasons.push(`${overdueTasks.length} overdue task(s).`);
  }
  if (openHighRisks.length > 0) {
    reasons.push(`${openHighRisks.length} open high-severity risk(s).`);
  }

  if (reasons.length >= 2 || (project.dueDate && isDateOverdue(project.dueDate, today) && openTasks.length > 0)) {
    return { status: 'critical', label: 'Critical Attention', reasons };
  }
  if (reasons.length === 1) {
    return { status: 'at_risk', label: 'At Risk', reasons };
  }
  return {
    status: 'healthy',
    label: 'On Track',
    reasons: ['Milestones and tasks are tracking cleanly.'],
  };
}

export interface GanttBarItem {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  progress: number;
  status: Project['status'];
  clientId: string;
}

export function buildProjectGanttBars(projects: Project[], today = todayDateStr()): GanttBarItem[] {
  return projects
    .filter((p) => !p.isTemplate && p.status !== 'archived')
    .map((p) => {
      const start = p.startDate || p.createdAt.slice(0, 10) || today;
      const end = p.dueDate && p.dueDate >= start ? p.dueDate : addDaysToDateStr(start, 21);
      return {
        id: p.id,
        label: p.name,
        startDate: start,
        endDate: end,
        progress: p.progress,
        status: p.status,
        clientId: p.clientId,
      };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}
