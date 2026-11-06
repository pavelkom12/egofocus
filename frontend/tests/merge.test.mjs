import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeHistory, mergeValue, MergeConflict } from '../src/merge.ts';

const unknown = { at: 1, id: 'birth', mode: 'unknown' };
const focus = { at: 100, id: 'focus', mode: 'focus' };
const rest = { at: 200, id: 'rest', mode: 'rest' };
const base = [unknown, focus, rest];
test('independent offline and server edits both survive', () => {
  const local = [unknown, { ...focus, at: 80 }, rest];
  const remote = [unknown, focus, rest, { at: 300, id: 'next', mode: 'focus' }];
  const result = mergeHistory(base, local, remote);
  assert.deepEqual(result, [...local, remote[3]]);
  assert.deepEqual(mergeHistory(base, result, remote), result);
});
test('overlap requires a choice only where both sides disagree', () => {
  const local = [unknown, { ...focus, mode: 'rest' }];
  const remote = [unknown, rest, { at: 400, id: 'later', mode: 'focus' }];
  assert.throws(() => mergeHistory(base, local, remote), MergeConflict);
  assert.deepEqual(
    mergeHistory(base, local, remote, 'local').map((e) => [e.at, e.mode]),
    [
      [1, 'unknown'],
      [100, 'rest'],
      [400, 'focus'],
    ],
  );
  assert.deepEqual(mergeHistory(base, local, remote, 'server'), remote);
});
test('independent profile changes preserve both fields', () => {
  assert.equal(mergeValue('', 'local@example.org', ''), 'local@example.org');
  assert.equal(mergeValue('percentage', 'percentage', 'rest'), 'rest');
  assert.throws(() => mergeValue('percentage', 'rest', 'focus'), MergeConflict);
});
