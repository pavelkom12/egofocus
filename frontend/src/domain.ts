export type Mode = 'unknown' | 'focus' | 'rest';
export type Metric = 'percentage' | 'focus' | 'rest';
export type Transition = { id: string; at: number; mode: Mode };
export type SyncBase = {
  revision: number;
  username: string;
  email: string;
  metric: Metric;
  transitions: Transition[];
};
export type Account = {
  id: string;
  username: string;
  email: string;
  birthday: string;
  bornAt: number;
  importedTo?: string;
  base?: SyncBase;
  credential?: { salt: string; hash: string; iterations: number };
  metric: Metric;
  transitions: Transition[];
  revision: number;
  updatedAt: number;
};
export type Database = {
  schemaVersion: 1;
  accounts: Account[];
  session: string | null;
  token?: string;
  syncNotice?: string;
  conflict?: boolean;
};
export type Interval = Transition & { end: number };
export const emptyDatabase = (): Database => ({
  schemaVersion: 1,
  accounts: [],
  session: null,
});
export const names: Record<Mode, string> = {
  unknown: 'Нет данных',
  focus: 'Фокус',
  rest: 'Отдых',
};

export function parseBirthday(input: string, now = Date.now()) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(input.trim());
  if (!m) throw new Error('Укажите дату рождения в формате ДД.ММ.ГГГГ.');
  const [, d, mo, y] = m;
  const date = new Date(+y, +mo - 1, +d);
  if (
    +y < 1900 ||
    date.getFullYear() !== +y ||
    date.getMonth() !== +mo - 1 ||
    date.getDate() !== +d ||
    date.getTime() > now
  )
    throw new Error('Проверьте дату рождения.');
  return date.getTime();
}
export function validateTimeline(account: Account) {
  const events = account.transitions;
  if (
    !Number.isFinite(account.bornAt) ||
    !events.length ||
    events[0].at !== account.bornAt
  )
    throw new Error('История должна начинаться с даты рождения.');
  const ids = new Set<string>();
  events.forEach((event, i) => {
    if (
      !event.id ||
      ids.has(event.id) ||
      !Number.isFinite(event.at) ||
      !['unknown', 'focus', 'rest'].includes(event.mode) ||
      (i > 0 &&
        (event.at <= events[i - 1].at || event.mode === events[i - 1].mode))
    )
      throw new Error('История содержит некорректные интервалы.');
    ids.add(event.id);
  });
}
export function switchMode(
  account: Account,
  target: Mode,
  now: number,
  id: string,
): Account {
  validateTimeline(account);
  const last = account.transitions[account.transitions.length - 1];
  if (last.mode === target) return account;
  if (now <= last.at)
    throw new Error('Время устройства изменилось. Проверьте часы и повторите.');
  const next = {
    ...account,
    transitions: [...account.transitions, { id, at: now, mode: target }],
    revision: account.revision + 1,
    updatedAt: now,
  };
  validateTimeline(next);
  return next;
}
export function intervals(account: Account, now: number): Interval[] {
  return account.transitions.map((e, i) => ({
    ...e,
    end: account.transitions[i + 1]?.at ?? Math.max(now, e.at),
  }));
}
export function totals(account: Account, start: number, end: number) {
  const result: Record<Mode, number> = { unknown: 0, focus: 0, rest: 0 };
  for (const item of intervals(account, end)) {
    result[item.mode] += Math.max(
      0,
      Math.min(end, item.end) - Math.max(start, item.at),
    );
  }
  return result;
}
export function startOfDay(time: number) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return +d;
}
export function rangeStart(
  range: 'day' | 'week' | 'all',
  account: Account,
  now: number,
) {
  if (range === 'all') return account.bornAt;
  const d = new Date(startOfDay(now));
  if (range === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return Math.max(+d, account.bornAt);
}
export function duration(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return seconds + ' с';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return mins + ' мин';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + ' ч ' + (mins % 60) + ' мин';
  const days = Math.floor(hours / 24);
  return days.toLocaleString('ru-RU') + ' д ' + (hours % 24) + ' ч';
}
export function timer(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return (
    Math.floor(s / 60)
      .toString()
      .padStart(2, '0') +
    ':' +
    (s % 60).toString().padStart(2, '0')
  );
}
export const clockTime = (time: number) =>
  new Date(time).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
export const fullDate = (time: number) =>
  new Date(time).toLocaleDateString('ru-RU');
export function dayLabel(time: number, now: number) {
  const today = new Date(startOfDay(now));
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const before = new Date(today);
  before.setDate(today.getDate() - 2);
  const day = startOfDay(time);
  if (day === +today) return '';
  if (day === +yesterday) return 'Вчера';
  if (day === +before) return 'Позавчера';
  return new Date(time).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Replace a closed range while preserving all time outside it. */
export function paintRange(
  events: Transition[],
  bornAt: number,
  limit: number,
  from: number,
  to: number,
  mode: Mode,
  id: () => string,
): Transition[] {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < bornAt ||
    to > limit ||
    from >= to ||
    !['focus', 'rest', 'unknown'].includes(mode)
  )
    throw new Error(
      'Проверьте границы интервала: от даты рождения до момента открытия редактора.',
    );
  const after = events.filter((e) => e.at <= to).at(-1);
  if (!after) throw new Error('Некорректная история.');
  const candidates = [
    ...events.filter((e) => e.at < from),
    { id: id(), at: from, mode },
    { id: id(), at: to, mode: after.mode },
    ...events.filter((e) => e.at > to),
  ];
  return candidates.filter(
    (e, i) => i === 0 || e.mode !== candidates[i - 1].mode,
  );
}
export function changedRanges(
  before: Transition[],
  after: Transition[],
  limit: number,
): Interval[] {
  const points = [
    ...new Set(
      [...before, ...after]
        .map((e) => e.at)
        .filter((at) => at < limit)
        .concat(limit),
    ),
  ].sort((a, b) => a - b);
  let a = 0,
    b = 0;
  const result: Interval[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const at = points[i],
      end = points[i + 1];
    while (a + 1 < before.length && before[a + 1].at <= at) a++;
    while (b + 1 < after.length && after[b + 1].at <= at) b++;
    if (before[a].mode !== after[b].mode) {
      const last = result.at(-1);
      if (last && last.end === at && last.mode === before[a].mode)
        last.end = end;
      else result.push({ id: 'before-' + at, at, end, mode: before[a].mode });
    }
  }
  return result;
}
export function commitHistory(
  account: Account,
  revision: number,
  events: Transition[],
  limit: number,
  now: number,
): Account {
  if (account.revision !== revision)
    throw new Error(
      'История изменилась в другом окне. Закройте редактор и откройте снова, чтобы не потерять новые записи.',
    );
  if (limit > now || events.some((e) => e.at > limit))
    throw new Error('Нельзя изменить будущее время.');
  const originalMode = account.transitions
    .filter((e) => e.at <= limit)
    .at(-1)?.mode;
  const updatedMode = events.filter((e) => e.at <= limit).at(-1)?.mode;
  if (originalMode !== updatedMode)
    throw new Error(
      'Редактор не должен менять состояние после момента открытия.',
    );
  const next = {
    ...account,
    transitions: events,
    revision: account.revision + 1,
    updatedAt: now,
  };
  validateTimeline(next);
  return next;
}
