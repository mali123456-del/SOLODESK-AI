import Big from 'big.js';

export type DateFormatPreference = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'DD MMM YYYY';

const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isValidDateOnly(value: string): boolean {
  const m = DATE_ONLY_REGEX.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export function todayDateStr(now = new Date(), timeZone?: string): string {
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(now);
      const y = parts.find((p) => p.type === 'year')?.value;
      const m = parts.find((p) => p.type === 'month')?.value;
      const d = parts.find((p) => p.type === 'day')?.value;
      if (y && m && d) return `${y}-${m}-${d}`;
    } catch {
      // Fall back to runtime local calendar date if timezone string is invalid
    }
  }
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toWorkspaceDateStr(value: string | undefined | null, timeZone?: string): string {
  if (!value) return '';
  if (DATE_ONLY_REGEX.test(value)) {
    return isValidDateOnly(value) ? value : '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return todayDateStr(parsed, timeZone);
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  if (!isValidDateOnly(dateStr)) {
    throw new Error(`Invalid calendar date: ${dateStr}`);
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  // UTC arithmetic guarantees DST transitions never shift the calendar day
  const utc = Date.UTC(y, m - 1, d + days);
  const next = new Date(utc);
  const ny = next.getUTCFullYear();
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(next.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

export function compareDateStr(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function isDateOverdue(dueDateStr: string | undefined | null, referenceDate = todayDateStr()): boolean {
  if (!dueDateStr || !isValidDateOnly(dueDateStr)) return false;
  return dueDateStr < referenceDate;
}

export function formatDisplayDate(
  input: string | undefined | null,
  format: DateFormatPreference = 'DD MMM YYYY'
): string {
  if (!input) return '—';
  let datePart = input;
  if (!isValidDateOnly(input)) {
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return '—';
    const y = parsed.getUTCFullYear();
    const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const d = String(parsed.getUTCDate()).padStart(2, '0');
    datePart = `${y}-${m}-${d}`;
  }

  const [yStr, mStr, dStr] = datePart.split('-');
  const monthIdx = Number(mStr) - 1;

  switch (format) {
    case 'YYYY-MM-DD':
      return `${yStr}-${mStr}-${dStr}`;
    case 'DD/MM/YYYY':
      return `${dStr}/${mStr}/${yStr}`;
    case 'MM/DD/YYYY':
      return `${mStr}/${dStr}/${yStr}`;
    case 'DD MMM YYYY':
    default:
      return `${Number(dStr)} ${MONTHS_SHORT[monthIdx] ?? mStr} ${yStr}`;
  }
}

export function getMonthKey(dateStr: string): string {
  if (isValidDateOnly(dateStr)) return dateStr.slice(0, 7);
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return 'Unknown';
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatDurationHMS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function secondsToDecimalHours(totalSeconds: number): number {
  const safe = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  return Number(new Big(safe).div(3600).round(2, Big.roundHalfUp).toFixed(2));
}

export function calculateTimeAmount(durationSeconds: number, hourlyRate: number): number {
  const hours = new Big(Math.max(0, durationSeconds)).div(3600);
  const rate = new Big(Math.max(0, hourlyRate));
  return Number(hours.times(rate).round(2, Big.roundHalfUp).toFixed(2));
}
