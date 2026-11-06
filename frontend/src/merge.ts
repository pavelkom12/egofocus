import type { Transition } from './domain';
export type Choice = 'local' | 'server';
export class MergeConflict extends Error {}
export function mergeValue<T>(
  base: T,
  local: T,
  remote: T,
  choice?: Choice,
): T {
  if (local === base || local === remote) return remote;
  if (remote === base || choice === 'local') return local;
  if (choice === 'server') return remote;
  throw new MergeConflict(
    'Одни и те же данные изменены на устройстве и сервере.',
  );
}
// Merge by time and state. UUIDs identify boundaries, not the user's choice of state.
export function mergeHistory(
  base: Transition[],
  local: Transition[],
  remote: Transition[],
  choice?: Choice,
): Transition[] {
  const sets = [base, local, remote];
  const points = [
    ...new Set(sets.flatMap((events) => events.map((e) => e.at))),
  ].sort((a, b) => a - b);
  if (!base.length || sets.some((events) => events[0]?.at !== base[0].at))
    throw Error('Начало истории не совпадает с датой рождения.');
  const indices = [0, 0, 0],
    result: Transition[] = [];
  for (const at of points) {
    const events = sets.map((list, i) => {
      while (list[indices[i] + 1]?.at <= at) indices[i]++;
      return list[indices[i]];
    });
    const mode = mergeValue(
      events[0].mode,
      events[1].mode,
      events[2].mode,
      choice,
    );
    if (result.at(-1)?.mode === mode) continue;
    const boundary = [events[2], events[1], events[0]].find(
      (e) => e.at === at,
    )!;
    result.push({ ...boundary, mode });
  }
  return result;
}
