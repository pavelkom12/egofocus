import type { Account, Mode } from './domain';
export type HourBucket = Record<Mode, number> & { total: number };
// Split real elapsed time at local hour boundaries, including repeated DST hours.
export function dailyAverage(
  account: Account,
  start: number,
  end: number,
): HourBucket[] {
  const bins = Array.from({ length: 24 }, () => ({
    focus: 0,
    rest: 0,
    unknown: 0,
    total: 0,
  }));
  for (let i = 0; i < account.transitions.length; i++) {
    const event = account.transitions[i];
    let cursor = Math.max(start, event.at);
    const stop = Math.min(end, account.transitions[i + 1]?.at ?? end);
    while (cursor < stop) {
      const local = new Date(cursor);
      const next =
        cursor +
        (60 - local.getMinutes()) * 60000 -
        local.getSeconds() * 1000 -
        local.getMilliseconds();
      const boundary = Math.min(stop, next);
      const elapsed = boundary - cursor;
      const bin = bins[local.getHours()];
      bin[event.mode] += elapsed;
      bin.total += elapsed;
      cursor = boundary;
    }
  }
  return bins;
}
