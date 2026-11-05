import type { Mode, Transition } from './domain';

export function demoTransitions(
  bornAt: number,
  now: number,
  id: () => string,
): Transition[] {
  const candidates: { at: number; mode: Mode }[] = [];
  for (let offset = 27; offset >= 0; offset--) {
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - offset);
    const add = (minutes: number, mode: Mode) => {
      const date = new Date(day);
      date.setMinutes(minutes);
      if (+date > bornAt && +date < now) candidates.push({ at: +date, mode });
    };
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const start = (weekend ? 11 : 9) * 60 + (offset % 4) * 7;
    let minute = start;
    for (let cycle = 0; cycle < (weekend ? 3 : 6); cycle++) {
      add(minute, 'focus');
      minute += 30 + ((offset * 13 + cycle * 11) % 56);
      add(minute, 'rest');
      minute += cycle === 2 ? 65 : 10 + ((offset + cycle) % 18);
    }
    add(22 * 60 + 45, offset % 5 === 0 ? 'rest' : 'unknown');
  }
  // Recent activity makes today's timer and statistics useful even before 09:00.
  for (const [minutes, mode] of [
    [40, 'focus'],
    [15, 'rest'],
    [5, 'focus'],
  ] as const) {
    const at = now - minutes * 60000;
    if (at > bornAt) candidates.push({ at, mode });
  }
  candidates.sort((a, b) => a.at - b.at);
  const events: Transition[] = [{ id: id(), at: bornAt, mode: 'unknown' }];
  for (const candidate of candidates) {
    const last = events[events.length - 1];
    if (candidate.at === last.at || candidate.mode === last.mode) continue;
    events.push({ ...candidate, id: id() });
  }
  return events;
}
