import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBirthday,
  validateTimeline,
  switchMode,
  intervals,
  totals,
  rangeStart,
  startOfDay,
  dayLabel,
  timer,
} from '../src/domain.ts';

const account = (bornAt = 1000) => ({
  id: 'user',
  username: 'test',
  email: '',
  birthday: '01.01.2000',
  bornAt,
  credential: { salt: 'unused', hash: 'unused', iterations: 1 },
  metric: 'percentage',
  revision: 1,
  updatedAt: bornAt,
  transitions: [{ id: 'birth', at: bornAt, mode: 'unknown' }],
});
test('all time is covered from birth through the open current state', () => {
  let a = account();
  a = switchMode(a, 'focus', 5000, 'focus');
  a = switchMode(a, 'rest', 9000, 'rest');
  const rows = intervals(a, 15000);
  assert.deepEqual(
    rows.map((r) => [r.at, r.end]),
    [
      [1000, 5000],
      [5000, 9000],
      [9000, 15000],
    ],
  );
  assert.deepEqual(totals(a, 1000, 15000), {
    unknown: 4000,
    focus: 4000,
    rest: 6000,
  });
});
test('repeated desired state does not create duplicate records', () => {
  const a = switchMode(account(), 'focus', 5000, 'focus');
  assert.strictEqual(switchMode(a, 'focus', 6000, 'duplicate'), a);
});
test('clock reversal and simultaneous different states are rejected', () => {
  const a = switchMode(account(), 'focus', 5000, 'focus');
  assert.throws(() => switchMode(a, 'rest', 4999, 'rest'));
  assert.throws(() => switchMode(a, 'rest', 5000, 'rest'));
});
test('invalid history cannot be accepted', () => {
  const a = account();
  assert.throws(() => validateTimeline({ ...a, transitions: [] }));
  assert.throws(() =>
    validateTimeline({
      ...a,
      transitions: [{ id: 'birth', at: 1001, mode: 'unknown' }],
    }),
  );
  assert.throws(() =>
    validateTimeline({
      ...a,
      transitions: [...a.transitions, { id: 'birth', at: 2000, mode: 'focus' }],
    }),
  );
  assert.throws(() =>
    validateTimeline({
      ...a,
      transitions: [...a.transitions, { id: 'new', at: 2000, mode: 'unknown' }],
    }),
  );
});
test('midnight clips durations accurately without splitting the source history', () => {
  const midnight = +new Date(2026, 10, 6);
  const a = switchMode(
    account(midnight - 86400000),
    'focus',
    midnight - 10000,
    'focus',
  );
  assert.equal(totals(a, midnight, midnight + 20000).focus, 20000);
  assert.equal(a.transitions.length, 2);
});
test('reload and long gaps preserve elapsed time without JS timer ticks', () => {
  const a = switchMode(account(), 'focus', 5000, 'focus');
  const restored = JSON.parse(JSON.stringify(a));
  validateTimeline(restored);
  assert.equal(totals(restored, 5000, 5000 + 3 * 86400000).focus, 3 * 86400000);
});
test('birth dates are strict, leap-year aware, and cannot be in the future', () => {
  const now = +new Date(2026, 10, 6);
  assert.equal(parseBirthday('29.02.2000', now), +new Date(2000, 1, 29));
  for (const input of [
    '29.02.2001',
    '31.04.2000',
    '00.01.2000',
    '1.1.2000',
    '01.01.2027',
  ])
    assert.throws(() => parseBirthday(input, now));
});
test('week starts on Monday and ranges never start before birth', () => {
  const now = +new Date(2026, 10, 8, 14);
  const a = account(+new Date(2000, 0, 1));
  assert.equal(rangeStart('week', a, now), +new Date(2026, 10, 2));
  const newborn = account(+new Date(2026, 10, 8));
  assert.equal(rangeStart('week', newborn, now), newborn.bornAt);
});
test('yesterday labels use calendar boundaries', () => {
  const now = +new Date(2026, 10, 6, 12);
  assert.equal(dayLabel(now, now), '');
  assert.equal(dayLabel(+new Date(2026, 10, 5, 22), now), 'Вчера');
  assert.equal(dayLabel(+new Date(2026, 10, 4, 22), now), 'Позавчера');
  assert.equal(startOfDay(now), +new Date(2026, 10, 6));
});
test('long timer displays elapsed minutes, not a wrapping clock', () => {
  assert.equal(timer(3661000), '61:01');
  assert.equal(timer(-100), '00:00');
});
test('arbitrary periods conserve total time including unknown', () => {
  let a = account();
  for (let i = 1; i <= 200; i++)
    a = switchMode(a, i % 2 ? 'focus' : 'rest', 1000 + i * 1500, 'e' + i);
  for (let i = 0; i < 100; i++) {
    const start = 1000 + i * 999;
    const end = start + 91234;
    const result = totals(a, start, end);
    assert.equal(result.focus + result.rest + result.unknown, end - start);
  }
});
test('updates are immutable, preserving the previous snapshot', () => {
  const a = account();
  const b = switchMode(a, 'focus', 5000, 'focus');
  assert.equal(a.transitions.length, 1);
  assert.equal(b.transitions.length, 2);
  assert.equal(b.revision, 2);
});
