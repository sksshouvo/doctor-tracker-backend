/** Timezone-aware date helpers built on Intl (no moment / date-fns-tz dependency). */

export type Range = '7d' | '30d' | '90d' | '12m';
export type Granularity = 'day' | 'month';

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a timezone. */
export function zonedParts(date: Date, tz: string) {
  const o: Record<string, number> = {};
  for (const p of dtf(tz).formatToParts(date))
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  return { y: o.year!, m: o.month!, d: o.day!, h: o.hour!, mi: o.minute!, s: o.second! };
}

/** tz offset (ms) at an instant: local wall-clock minus UTC. */
function offsetAt(ts: number, tz: string): number {
  const p = zonedParts(new Date(ts), tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ts / 1000) * 1000;
}

/** Converts a local wall-clock date (00:00 of y-m-d) in `tz` to a UTC instant. */
export function localMidnightToUtc(y: number, m: number, d: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  let ts = guess - offsetAt(guess, tz);
  ts = guess - offsetAt(ts, tz); // re-check around DST transitions
  return new Date(ts);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Shifts a calendar date by n days using pure calendar math. */
function addDays(y: number, m: number, d: number, n: number) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

function addMonths(y: number, m: number, n: number) {
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1 };
}

export function startOfDayUtc(date: Date, tz: string): Date {
  const p = zonedParts(date, tz);
  return localMidnightToUtc(p.y, p.m, p.d, tz);
}

export function endOfTodayUtc(tz: string, now = new Date()): Date {
  const p = zonedParts(now, tz);
  const n = addDays(p.y, p.m, p.d, 1);
  return new Date(localMidnightToUtc(n.y, n.m, n.d, tz).getTime() - 1);
}

/** Inclusive `YYYY-MM-DD` day range in `tz` -> `{ $gte, $lt }` in UTC. */
export function dayRangeToUtc(from: string | undefined, to: string | undefined, tz: string) {
  const range: { $gte?: Date; $lt?: Date } = {};
  if (from) {
    const [y, m, d] = from.split('-').map(Number) as [number, number, number];
    range.$gte = localMidnightToUtc(y, m, d, tz);
  }
  if (to) {
    const [y, m, d] = to.split('-').map(Number) as [number, number, number];
    const n = addDays(y, m, d, 1);
    range.$lt = localMidnightToUtc(n.y, n.m, n.d, tz);
  }
  return range;
}

export type Window = {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  granularity: Granularity;
  unitCount: number;
  keys: string[]; // every bucket key (YYYY-MM-DD or YYYY-MM-01) in order
};

/** Resolves a preset range into the current window, the previous equal-length window and bucket keys. */
export function rangeToWindow(range: Range, tz: string, now = new Date()): Window {
  const p = zonedParts(now, tz);
  const keys: string[] = [];

  if (range === '12m') {
    const first = addMonths(p.y, p.m, -11);
    for (let i = 0; i < 12; i++) {
      const t = addMonths(first.y, first.m, i);
      keys.push(`${t.y}-${pad(t.m)}-01`);
    }
    const prevFirst = addMonths(first.y, first.m, -12);
    const next = addMonths(p.y, p.m, 1);
    return {
      start: localMidnightToUtc(first.y, first.m, 1, tz),
      end: localMidnightToUtc(next.y, next.m, 1, tz),
      prevStart: localMidnightToUtc(prevFirst.y, prevFirst.m, 1, tz),
      prevEnd: localMidnightToUtc(first.y, first.m, 1, tz),
      granularity: 'month',
      unitCount: 12,
      keys,
    };
  }

  const n = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const first = addDays(p.y, p.m, p.d, -(n - 1));
  const prevFirst = addDays(p.y, p.m, p.d, -(2 * n - 1));
  const next = addDays(p.y, p.m, p.d, 1);
  for (let i = 0; i < n; i++) {
    const t = addDays(first.y, first.m, first.d, i);
    keys.push(`${t.y}-${pad(t.m)}-${pad(t.d)}`);
  }
  return {
    start: localMidnightToUtc(first.y, first.m, first.d, tz),
    end: localMidnightToUtc(next.y, next.m, next.d, tz),
    prevStart: localMidnightToUtc(prevFirst.y, prevFirst.m, prevFirst.d, tz),
    prevEnd: localMidnightToUtc(first.y, first.m, first.d, tz),
    granularity: 'day',
    unitCount: n,
    keys,
  };
}

/** Formats an instant as a bucket key in the given timezone. */
export function bucketKey(date: Date, tz: string, granularity: Granularity): string {
  const p = zonedParts(date, tz);
  return granularity === 'month' ? `${p.y}-${pad(p.m)}-01` : `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Zero-fills every bucket in the window. */
export function fillBuckets(
  points: { date: Date; count: number }[],
  window: Window,
  tz: string,
): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const pt of points) {
    const k = bucketKey(pt.date, tz, window.granularity);
    counts.set(k, (counts.get(k) ?? 0) + pt.count);
  }
  return window.keys.map((date) => ({ date, count: counts.get(date) ?? 0 }));
}
