import test from 'node:test';
import assert from 'node:assert/strict';
import {
  paintRange,
  changedRanges,
  commitHistory,
  validateTimeline,
  totals,
} from '../src/domain.ts';
let sequence = 0;
const id = () => 'new-' + sequence++;
const events = [
  { id: 'a', at: 0, mode: 'unknown' },
  { id: 'b', at: 1000, mode: 'focus' },
  { id: 'c', at: 4000, mode: 'rest' },
];
const account = { bornAt: 0, transitions: events, revision: 1, updatedAt: 0 };
test('delete replaces state with unknown and preserves the rest', () => {
  const next = paintRange(events, 0, 10000, 1000, 4000, 'unknown', id);
  assert.deepEqual(
    next.map((e) => [e.at, e.mode]),
    [
      [0, 'unknown'],
      [4000, 'rest'],
    ],
  );
  assert.deepEqual(
    changedRanges(events, next, 10000).map((e) => [e.at, e.end, e.mode]),
    [[1000, 4000, 'focus']],
  );
});
test('arbitrary range may span multiple original records without gaps', () => {
  const next = paintRange(events, 0, 10000, 500, 6000, 'rest', id);
  const updated = commitHistory(account, 1, next, 10000, 11000);
  validateTimeline(updated);
  assert.deepEqual(totals(updated, 0, 10000), {
    unknown: 500,
    focus: 0,
    rest: 9500,
  });
  assert.deepEqual(events[1], { id: 'b', at: 1000, mode: 'focus' });
});
test('partial change splits and restores original state at the end', () => {
  const next = paintRange(events, 0, 10000, 2000, 3000, 'rest', id);
  assert.deepEqual(
    next.map((e) => [e.at, e.mode]),
    [
      [0, 'unknown'],
      [1000, 'focus'],
      [2000, 'rest'],
      [3000, 'focus'],
      [4000, 'rest'],
    ],
  );
});
test('editing at birth and up to the editor limit preserves future state', () => {
  const next = paintRange(events, 0, 10000, 0, 10000, 'focus', id);
  const result = commitHistory(account, 1, next, 10000, 12000);
  assert.equal(result.transitions[0].mode, 'focus');
  assert.equal(result.transitions.at(-1).at, 10000);
  assert.equal(result.transitions.at(-1).mode, 'rest');
});
test('rejects invalid bounds, invalid state and concurrent updates', () => {
  for (const [from, to] of [
    [-1, 1000],
    [1000, 1000],
    [2000, 1000],
    [0, 10001],
    [NaN, 1000],
  ])
    assert.throws(() => paintRange(events, 0, 10000, from, to, 'focus', id));
  assert.throws(() => paintRange(events, 0, 10000, 0, 1000, 'bad', id));
  assert.throws(() =>
    commitHistory({ ...account, revision: 2 }, 1, events, 10000, 11000),
  );
});
test('rejects history that modifies state beyond the editing snapshot', () => {
  assert.throws(() =>
    commitHistory(
      account,
      1,
      [{ id: 'only', at: 0, mode: 'focus' }],
      10000,
      11000,
    ),
  );
  assert.throws(() => commitHistory(account, 1, events, 12000, 11000));
});
test('no semantic changes produce no original-state stripe', () => {
  const next = paintRange(events, 0, 10000, 2000, 3000, 'focus', id);
  assert.equal(changedRanges(events, next, 10000).length, 0);
});
test('many edits preserve coverage and unique ids', () => {
  let draft = events;
  for (let i = 0; i < 60; i++) {
    draft = paintRange(
      draft,
      0,
      10000,
      100 + i * 50,
      9000 - i * 50,
      i % 2 ? 'focus' : 'unknown',
      id,
    );
    validateTimeline({ ...account, transitions: draft });
    const sum = totals({ ...account, transitions: draft }, 0, 10000);
    assert.equal(sum.focus + sum.rest + sum.unknown, 10000);
  }
});
