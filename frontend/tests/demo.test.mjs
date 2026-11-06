import test from 'node:test';
import assert from 'node:assert/strict';
import { demoTransitions } from '../src/demo.ts';
import { validateTimeline, totals, intervals } from '../src/domain.ts';

for (const hour of [0, 8, 14, 23]) {
  test('demo is continuous and useful at hour ' + hour, () => {
    const bornAt = +new Date(1998, 4, 15);
    const now = +new Date(2026, 10, 6, hour, 1);
    let sequence = 0;
    const transitions = demoTransitions(
      bornAt,
      now,
      () => 'test-' + sequence++,
    );
    const account = { bornAt, transitions };
    validateTimeline(account);
    assert.ok(transitions.length > 200);
    assert.ok(transitions.every((e) => e.at <= now));
    assert.equal(
      new Set(transitions.map((e) => e.id)).size,
      transitions.length,
    );
    assert.deepEqual(
      new Set(transitions.map((e) => e.mode)),
      new Set(['unknown', 'focus', 'rest']),
    );
    const all = totals(account, bornAt, now);
    assert.equal(all.unknown + all.focus + all.rest, now - bornAt);
    assert.equal(transitions.at(-1).mode, 'focus');
    assert.ok(
      intervals(account, now).some(
        (e) =>
          e.mode === 'rest' &&
          new Date(e.at).getDate() !== new Date(e.end).getDate(),
      ),
    );
  });
}
