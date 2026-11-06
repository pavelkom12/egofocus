import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyAverage } from '../src/statistics.ts';
const at = (day, hour, minute = 0) => +new Date(2026, 10, day, hour, minute);
const account = (...events) => ({
  transitions: events.map(([time, mode], id) => ({
    id: String(id),
    at: time,
    mode,
  })),
});
test('averages equal hours across days, preserving all states', () => {
  const bins = dailyAverage(
    account(
      [at(4, 0), 'unknown'],
      [at(4, 9), 'focus'],
      [at(4, 10), 'unknown'],
      [at(5, 9), 'rest'],
    ),
    at(4, 0),
    at(5, 10),
  );
  assert.equal(bins[9].focus, 3600000);
  assert.equal(bins[9].rest, 3600000);
  assert.equal(bins[9].total, 7200000);
});
test('future hours are absent, not unknown', () => {
  const bins = dailyAverage(
    account([at(6, 0), 'focus']),
    at(6, 0),
    at(6, 9, 30),
  );
  assert.equal(bins[9].total, 1800000);
  assert.equal(bins[10].total, 0);
  assert.equal(bins[10].unknown, 0);
});
test('partial hours and transitions conserve elapsed time', () => {
  const bins = dailyAverage(
    account(
      [at(6, 0), 'unknown'],
      [at(6, 1, 15), 'focus'],
      [at(6, 1, 45), 'rest'],
    ),
    at(6, 0, 30),
    at(6, 2, 10),
  );
  assert.equal(bins[1].focus, 1800000);
  assert.equal(bins[1].rest, 900000);
  assert.equal(
    bins.reduce((n, b) => n + b.total, 0),
    100 * 60000,
  );
  for (const bin of bins)
    assert.equal(bin.total, bin.focus + bin.rest + bin.unknown);
});
test('clips history at both boundaries and handles an empty range', () => {
  const a = account([at(1, 0), 'unknown'], [at(2, 0), 'focus']);
  assert.equal(dailyAverage(a, at(2, 9), at(2, 10))[9].focus, 3600000);
  assert.ok(dailyAverage(a, at(2, 10), at(2, 10)).every((b) => b.total === 0));
});
