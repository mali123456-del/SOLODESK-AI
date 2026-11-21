import type { TimerWorkerCommand, TimerWorkerEvent } from '../workers/timerWorker';

export type BackgroundTimerMode = 'web-worker' | 'fallback';

export interface BackgroundTimerSnapshot {
  nowMs: number;
  elapsedSeconds: number;
  mode: BackgroundTimerMode;
}

export interface BackgroundTimerController {
  readonly mode: BackgroundTimerMode;
  start: (startTimeIso: string) => void;
  sync: () => void;
  stop: () => void;
  dispose: () => void;
}

export function computeElapsedSecondsFromIso(startTimeIso: string, nowMs = Date.now()): number {
  const started = Date.parse(startTimeIso);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((nowMs - started) / 1000));
}

export function createBackgroundTimerController(
  onTick: (snapshot: BackgroundTimerSnapshot) => void,
  options?: {
    workerFactory?: () => Worker;
    intervalMs?: number;
  }
): BackgroundTimerController {
  const intervalMs = Math.max(250, Math.min(5000, options?.intervalMs ?? 1000));
  let worker: Worker | null = null;
  let fallbackIntervalId: ReturnType<typeof setInterval> | null = null;
  let activeStartTimeIso: string | null = null;
  let currentMode: BackgroundTimerMode = 'fallback';
  let disposed = false;

  const clearFallback = () => {
    if (fallbackIntervalId !== null) {
      clearInterval(fallbackIntervalId);
      fallbackIntervalId = null;
    }
  };

  const emitLocalTick = () => {
    if (disposed || !activeStartTimeIso) return;
    const nowMs = Date.now();
    onTick({
      nowMs,
      elapsedSeconds: computeElapsedSecondsFromIso(activeStartTimeIso, nowMs),
      mode: currentMode,
    });
  };

  const startFallback = () => {
    currentMode = 'fallback';
    clearFallback();
    if (!activeStartTimeIso || disposed) return;
    emitLocalTick();
    fallbackIntervalId = setInterval(emitLocalTick, intervalMs);
  };

  const initWorkerIfAvailable = () => {
    if (disposed || worker) return;
    const hasWorkerApi = typeof Worker !== 'undefined' || Boolean(options?.workerFactory);
    if (!hasWorkerApi) {
      currentMode = 'fallback';
      return;
    }

    try {
      const created = options?.workerFactory
        ? options.workerFactory()
        : new Worker(new URL('../workers/timerWorker.ts', import.meta.url), {
            type: 'module',
          });

      created.onmessage = (event: MessageEvent<TimerWorkerEvent>) => {
        if (disposed) return;
        const data = event.data;
        if (data?.type === 'TICK') {
          onTick({
            nowMs: data.nowMs,
            elapsedSeconds: data.elapsedSeconds,
            mode: 'web-worker',
          });
        }
      };

      created.onerror = () => {
        if (disposed) return;
        try {
          created.terminate();
        } catch {
          // Ignore worker cleanup errors
        }
        worker = null;
        startFallback();
      };

      worker = created;
      currentMode = 'web-worker';
    } catch {
      worker = null;
      currentMode = 'fallback';
    }
  };

  initWorkerIfAvailable();

  const handleVisibilityChange = () => {
    if (disposed || !activeStartTimeIso) return;
    if (worker && currentMode === 'web-worker') {
      const cmd: TimerWorkerCommand = { type: 'SYNC' };
      worker.postMessage(cmd);
    } else {
      emitLocalTick();
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }

  return {
    get mode() {
      return currentMode;
    },
    start(startTimeIso: string) {
      if (disposed) return;
      activeStartTimeIso = startTimeIso;
      if (worker && currentMode === 'web-worker') {
        clearFallback();
        const cmd: TimerWorkerCommand = {
          type: 'START',
          startTimeIso,
          intervalMs,
        };
        worker.postMessage(cmd);
        emitLocalTick();
      } else {
        startFallback();
      }
    },
    sync() {
      if (disposed || !activeStartTimeIso) return;
      if (worker && currentMode === 'web-worker') {
        const cmd: TimerWorkerCommand = { type: 'SYNC' };
        worker.postMessage(cmd);
      } else {
        emitLocalTick();
      }
    },
    stop() {
      activeStartTimeIso = null;
      clearFallback();
      if (worker && currentMode === 'web-worker') {
        const cmd: TimerWorkerCommand = { type: 'STOP' };
        worker.postMessage(cmd);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      activeStartTimeIso = null;
      clearFallback();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (worker) {
        try {
          const cmd: TimerWorkerCommand = { type: 'STOP' };
          worker.postMessage(cmd);
          worker.terminate();
        } catch {
          // Ignore termination errors
        }
        worker = null;
      }
    },
  };
}
