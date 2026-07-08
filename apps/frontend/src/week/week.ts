/**
 * Pure week/date math on date-only `YYYY-MM-DD` strings (research §5–§6). Monday-start.
 * Isolated from React and the network so it unit-tests exhaustively across week/month/year
 * boundaries (Principle III, SC-005). All arithmetic runs in UTC so it never drifts with the
 * viewer's timezone or DST — a calendar day is the same day everywhere (FR-010).
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Format Y/M/D (1-based month) as `YYYY-MM-DD`. */
function fmt(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Parse a `YYYY-MM-DD` string into a UTC Date at midnight. */
function toUtc(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(dt: Date): string {
  return fmt(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Today's calendar date in the viewer's local reference, as `YYYY-MM-DD`. */
export function todayDate(): string {
  const now = new Date();
  return fmt(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** The Monday (`YYYY-MM-DD`) of the week containing `date`. */
export function startOfWeek(date: string): string {
  const dt = toUtc(date);
  const dow = dt.getUTCDay(); // 0=Sun … 6=Sat
  const daysSinceMonday = (dow + 6) % 7; // Mon→0, Sun→6
  dt.setUTCDate(dt.getUTCDate() - daysSinceMonday);
  return fromUtc(dt);
}

/** The seven `YYYY-MM-DD` dates Monday→Sunday for the week starting at `monday`. */
export function weekDays(monday: string): string[] {
  const start = toUtc(monday);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(start);
    dt.setUTCDate(dt.getUTCDate() + i);
    return fromUtc(dt);
  });
}

/** `monday` shifted by `n` whole weeks (n may be negative). */
export function addWeeks(monday: string, n: number): string {
  const dt = toUtc(monday);
  dt.setUTCDate(dt.getUTCDate() + n * 7);
  return fromUtc(dt);
}

/** True when `date` is today's calendar date. */
export function isToday(date: string): boolean {
  return date === todayDate();
}
