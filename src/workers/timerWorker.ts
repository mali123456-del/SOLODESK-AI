/// <reference lib="webworker" />

export type TimerWorkerCommand =
  | { type: 'START'; startTimeIso: string; intervalMs?: number }
  | { type: 'SYNC' }
  | { type: 'STOP' };

export type TimerWorkerEvent =
  | { type: 'TICK'; nowMs: number; elapsedSeconds: number; startTimeIso: string }
  | { type: 'STOPPED' };

let activeStartMs: number | null = null;
let activeStartIso = '';
let tickTimerId: number | null = null;

function clearTicker(): void {
  if (tickTimerId !== null) {
    self.clearInterval(tickTimerId);
    tickTimerId = null;
  }
}

function emitTick(): void {
  if (activeStartMs === null) return;
  const nowMs = Date.now();
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - activeStartMs) / 1000));
  const payload: TimerWorkerEvent = {
    type: 'TICK',
    nowMs,
    elapsedSeconds,
    startTimeIso: activeStartIso,
  };
  self.postMessage(payload);
}

self.onmessage = (event: MessageEvent<TimerWorkerCommand>) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'START') {
    clearTicker();
    const parsed = Date.parse(msg.startTimeIso);
    if (!Number.isFinite(parsed)) {
      activeStartMs = null;
      activeStartIso = '';
      return;
    }
    activeStartMs = parsed;
    activeStartIso = msg.startTimeIso;
    const intervalMs = Math.max(250, Math.min(5000, Number(msg.intervalMs) || 1000));
    emitTick();
    tickTimerId = self.setInterval(emitTick, intervalMs);
    return;
  }

  if (msg.type === 'SYNC') {
    emitTick();
    return;
  }

  if (msg.type === 'STOP') {
    clearTicker();
    activeStartMs = null;
    activeStartIso = '';
    const stopped: TimerWorkerEvent = { type: 'STOPPED' };
    self.postMessage(stopped);
  }
};
