import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Target } from 'lucide-react';
import { useWorkspace } from '../../app/providers/WorkspaceProvider';
import { Button, Card, CardHeader, Input, useToast } from '../../components/ui';
import { formatDisplayDate } from '../../domain/calculations/dates';
import {
  computeDailyTaskGoalProgress,
  validateDailyTaskGoalTarget,
} from '../../services/productivityService';

interface DailyTaskGoalCardProps {
  onOpenTasks?: () => void;
  referenceDate?: string;
}

const CIRCLE_RADIUS = 40;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

export const DailyTaskGoalCard: React.FC<DailyTaskGoalCardProps> = ({
  onOpenTasks,
  referenceDate,
}) => {
  const { tasks, dailyTaskGoalTarget, settings, setDailyTaskGoalTarget } = useWorkspace();
  const { pushToast } = useToast();

  const [targetInput, setTargetInput] = useState(String(dailyTaskGoalTarget));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTargetInput(String(dailyTaskGoalTarget));
  }, [dailyTaskGoalTarget]);

  const timeZone = settings?.workspaceTimeZone?.trim() || undefined;
  const dateFormat = settings?.dateFormat ?? 'DD MMM YYYY';

  const progress = useMemo(
    () =>
      computeDailyTaskGoalProgress({
        tasks,
        target: dailyTaskGoalTarget,
        today: referenceDate,
        timeZone,
      }),
    [tasks, dailyTaskGoalTarget, referenceDate, timeZone]
  );

  const strokeDashoffset = CIRCLE_CIRCUMFERENCE * (1 - progress.ringPercent / 100);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateDailyTaskGoalTarget(targetInput);
    if (!validation.valid) {
      setError(validation.error ?? 'Enter a valid whole number.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await setDailyTaskGoalTarget(validation.value);
      pushToast({
        tone: 'success',
        title: validation.value === 0 ? 'Daily goal cleared' : 'Daily task goal updated',
        description:
          validation.value === 0
            ? 'Daily task target set to 0 (untracked).'
            : `Target set to ${validation.value} completed task(s) per day.`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save daily task target.');
    } finally {
      setSaving(false);
    }
  };

  const accessibleValueText = progress.hasTarget
    ? `${progress.completedToday} of ${progress.target} tasks completed today (${progress.rawPercent}%)`
    : `${progress.completedToday} tasks completed today, no daily target set`;

  return (
    <Card aria-label="Daily Task Completion Goal">
      <CardHeader
        title="Daily Task Goal"
        description={`Completed tasks tracked for ${formatDisplayDate(progress.date, dateFormat)}.`}
        action={
          onOpenTasks && (
            <Button size="sm" variant="ghost" onClick={onOpenTasks}>
              Open Tasks
            </Button>
          )
        }
      />

      <div className="flex flex-col sm:flex-row items-center gap-5">
        <div
          role="progressbar"
          aria-label="Daily task completion goal progress"
          aria-valuenow={progress.completedToday}
          aria-valuemin={0}
          aria-valuemax={progress.hasTarget ? progress.target : 1}
          aria-valuetext={accessibleValueText}
          className="relative w-24 h-24 shrink-0 flex items-center justify-center"
        >
          <svg
            viewBox="0 0 100 100"
            className="w-24 h-24 -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              r={CIRCLE_RADIUS}
              fill="none"
              strokeWidth="8"
              className="stroke-slate-200 dark:stroke-slate-800"
            />
            <circle
              cx="50"
              cy="50"
              r={CIRCLE_RADIUS}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={CIRCLE_CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              className={
                progress.goalReached
                  ? 'stroke-emerald-600 dark:stroke-emerald-400 transition-all'
                  : 'stroke-[#2563EB] dark:stroke-blue-400 transition-all'
              }
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span
              data-testid="daily-task-goal-percent"
              className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white leading-none"
            >
              {progress.ringPercent}%
            </span>
            <span
              data-testid="daily-task-goal-ratio"
              className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-1"
            >
              {progress.completedToday}/{progress.hasTarget ? progress.target : '—'}
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0 w-full space-y-3">
          <div className="text-xs space-y-1">
            {progress.hasTarget ? (
              <>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {progress.completedToday} / {progress.target} tasks completed today ({progress.rawPercent}%)
                </p>
                {progress.goalReached ? (
                  <p className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                    Daily goal reached! Great focus today.
                  </p>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400">
                    {progress.remainingCount} task{progress.remainingCount === 1 ? '' : 's'} remaining to hit today&apos;s goal.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-900 dark:text-white">
                  No daily target set ({progress.completedToday} completed today)
                </p>
                <p className="text-slate-500 dark:text-slate-400">
                  Set a daily target below to track task completions against your goal.
                </p>
              </>
            )}
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-wrap items-end gap-2">
            <div className="w-36">
              <Input
                id="daily-task-goal-input"
                label="Daily task target"
                type="number"
                min={0}
                max={500}
                step={1}
                value={targetInput}
                onChange={(e) => {
                  setTargetInput(e.target.value);
                  if (error) setError(null);
                }}
              />
            </div>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              loading={saving}
              icon={<Target className="w-3.5 h-3.5" />}
            >
              Update Target
            </Button>
          </form>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Resets automatically each calendar day; historical completed tasks remain preserved.
          </p>
        </div>
      </div>
    </Card>
  );
};
