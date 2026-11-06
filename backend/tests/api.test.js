import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
const schema = 'test_' + randomUUID().replaceAll('-', '');
const admin = new pg.Client();
let app, pool;
before(async () => {
  await admin.connect();
  await admin.query('CREATE SCHEMA ' + schema);
  process.env.PGOPTIONS = '-c search_path=' + schema;
  const db = await import('../src/db.js');
  pool = db.pool;
  await db.migrate();
  await db.migrate();
  const { createApp } = await import('../src/app.js');
  app = await createApp();
});
after(async () => {
  if (app) await app.close();
  if (pool) await pool.end();
  await admin.query('DROP SCHEMA IF EXISTS ' + schema + ' CASCADE');
  await admin.end();
});
async function call(method, path, token, payload) {
  const res = await app.inject({
    method,
    url: '/v1' + path,
    headers: token ? { authorization: 'Bearer ' + token } : {},
    payload,
  });
  return { status: res.statusCode, data: res.body ? res.json() : null };
}
const user = {
  username: 'FocusUser',
  password: 'testing-password',
  birthday: '2000-02-29',
  utcOffsetMinutes: 180,
};
test('registration, sessions and profile updates are scoped to an account', async () => {
  assert.equal((await call('GET', '/profile')).status, 401);
  assert.equal(
    (
      await call('POST', '/auth/register', null, {
        ...user,
        birthday: '2001-02-29',
      })
    ).status,
    400,
  );
  const signed = await call('POST', '/auth/register', null, user);
  assert.equal(signed.status, 201);
  const { token, profile } = signed.data;
  assert.equal(profile.username, 'focususer');
  assert.equal(profile.bornAt, Date.parse('2000-02-28T21:00:00Z'));
  assert.equal((await call('POST', '/auth/register', null, user)).status, 409);
  assert.equal(
    (
      await call('POST', '/auth/login', null, {
        username: user.username,
        password: 'incorrect',
      })
    ).status,
    401,
  );
  const second = await call('POST', '/auth/login', null, {
    username: user.username,
    password: user.password,
  });
  assert.equal(second.status, 200);
  const updated = await call('PATCH', '/profile', token, {
    revision: 1,
    email: 'example@example.org',
    metric: 'focus',
  });
  assert.equal(updated.data.revision, 2);
  assert.equal(
    (await call('PATCH', '/profile', token, { revision: 1, metric: 'rest' }))
      .status,
    409,
  );
  assert.equal(
    (
      await call('POST', '/auth/password', token, {
        currentPassword: user.password,
        newPassword: 'another-test-password',
      })
    ).status,
    204,
  );
  assert.equal((await call('GET', '/profile', second.data.token)).status, 401);
  assert.equal((await call('POST', '/auth/logout', token)).status, 204);
  assert.equal((await call('GET', '/profile', token)).status, 401);
});
test('history persists atomically, rejects stale writers, and stays private', async () => {
  const create = async (username) =>
    (await call('POST', '/auth/register', null, { ...user, username })).data;
  const a = await create('alice'),
    b = await create('bob');
  const snapshot = (await call('GET', '/timeline', a.token)).data;
  const first = snapshot.transitions[0];
  assert.equal(first.at, a.profile.bornAt);
  const history = [
    first,
    { id: randomUUID(), at: Date.now() - 1000, mode: 'focus' },
  ];
  const put = (transitions) =>
    call('PUT', '/timeline', a.token, { revision: 1, transitions });
  assert.equal((await put([history[1]])).status, 400);
  assert.equal(
    (await put([first, { ...history[1], mode: 'unknown' }])).status,
    400,
  );
  assert.equal(
    (await put([first, { ...history[1], id: first.id }])).status,
    400,
  );
  assert.equal(
    (await put([first, { ...history[1], at: Date.now() + 60000 }])).status,
    400,
  );
  assert.deepEqual((await call('GET', '/timeline', a.token)).data, snapshot);
  const results = await Promise.all([put(history), put(history)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.deepEqual((await call('GET', '/timeline', a.token)).data, {
    revision: 2,
    transitions: history,
  });
  const untouched = (await call('GET', '/timeline', b.token)).data;
  assert.equal(untouched.revision, 1);
  assert.equal(untouched.transitions.length, 1);
});
