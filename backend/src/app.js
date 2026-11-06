import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'node:crypto';
import { pool, transaction } from './db.js';
import { digest, issueSession, matches, passwordHash } from './security.js';

const username = { type: 'string', pattern: '^[a-zA-Zа-яА-ЯёЁ0-9_.]{3,24}$' };
const password = { type: 'string', minLength: 8, maxLength: 128 };
const metric = { enum: ['percentage', 'focus', 'rest'] };
const revision = { type: 'integer', minimum: 1, maximum: 2147483646 };
const fields = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const body = (schema) => ({ schema: { body: schema } });
const authLimit = { rateLimit: { max: 25, timeWindow: '1 minute' } };
const fail = (statusCode, message) =>
  Object.assign(new Error(message), { statusCode });
const view =
  'id, username, email, to_char(birthday,\'YYYY-MM-DD\') AS birthday, born_at::float8 AS "bornAt", metric, revision';
const normalized = (value) => value.toLowerCase();
function birthInstant(birthday, offset) {
  const utc = Date.parse(birthday + 'T00:00:00Z');
  if (
    !Number.isFinite(utc) ||
    new Date(utc).toISOString().slice(0, 10) !== birthday ||
    birthday < '1900-01-01'
  )
    throw fail(400, 'Некорректная дата рождения.');
  const at = utc - offset * 60000;
  if (at > Date.now()) throw fail(400, 'Дата рождения в будущем.');
  return at;
}
async function locked(client, id, expected) {
  const {
    rows: [account],
  } = await client.query(
    'SELECT revision, born_at::float8 AS "bornAt" FROM accounts WHERE id=$1 FOR UPDATE',
    [id],
  );
  if (account.revision !== expected)
    throw fail(409, 'Данные обновились. Загрузите текущую ревизию.');
  return account;
}
export async function createApp() {
  const app = Fastify({
    bodyLimit: 4 * 1024 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false } },
  });
  await app.register(cors, {
    origin: process.env.WEB_ORIGIN || 'http://localhost:8081',
    methods: ['GET', 'POST', 'PATCH', 'PUT'],
  });
  await app.register(rateLimit, { global: false });
  app.setErrorHandler((error, req, reply) => {
    if (error.code === '23505')
      return reply.code(409).send({ error: 'Имя или запись уже существует.' });
    const status = error.statusCode || 500;
    if (status >= 500) req.log.error(error);
    reply
      .code(status)
      .send({ error: status >= 500 ? 'Ошибка сервера.' : error.message });
  });
  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { status: 'ok' };
  });
  app.post(
    '/v1/auth/register',
    {
      ...body(
        fields(
          {
            username,
            password,
            birthday: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            utcOffsetMinutes: { type: 'integer', minimum: -840, maximum: 840 },
          },
          ['username', 'password', 'birthday'],
        ),
      ),
      config: authLimit,
    },
    async (req, reply) => {
      const { birthday, utcOffsetMinutes = 0 } = req.body;
      const bornAt = birthInstant(birthday, utcOffsetMinutes);
      const hash = await passwordHash(req.body.password);
      const id = randomUUID();
      const result = await transaction(async (client) => {
        const {
          rows: [profile],
        } = await client.query(
          'INSERT INTO accounts (id,username,birthday,born_at,password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING ' +
            view,
          [id, normalized(req.body.username), birthday, bornAt, hash],
        );
        await client.query(
          "INSERT INTO transitions VALUES ($1,$2,$3,'unknown')",
          [id, randomUUID(), bornAt],
        );
        return { profile, token: await issueSession(client, id) };
      });
      return reply.code(201).send(result);
    },
  );
  const dummyHash = await passwordHash(randomUUID());
  app.post(
    '/v1/auth/login',
    { ...body(fields({ username, password })), config: authLimit },
    async (req) => {
      const {
        rows: [a],
      } = await pool.query(
        'SELECT id,password_hash FROM accounts WHERE username=$1',
        [normalized(req.body.username)],
      );
      if (
        !(await matches(req.body.password, a?.password_hash || dummyHash)) ||
        !a
      )
        throw fail(401, 'Неверное имя или пароль.');
      return transaction(async (client) => {
        const {
          rows: [profile],
        } = await client.query(
          'SELECT ' +
            view +
            ' FROM accounts WHERE id=$1 AND password_hash=$2 FOR SHARE',
          [a.id, a.password_hash],
        );
        if (!profile) throw fail(401, 'Повторите вход.');
        return { profile, token: await issueSession(client, a.id) };
      });
    },
  );
  await app.register(
    async (user) => {
      user.addHook('preHandler', async (req) => {
        const match = /^Bearer ([\w-]{43})$/.exec(
          req.headers.authorization || '',
        );
        if (!match) throw fail(401, 'Требуется вход.');
        req.tokenHash = digest(match[1]);
        const {
          rows: [s],
        } = await pool.query(
          'SELECT account_id FROM sessions WHERE token_hash=$1 AND expires_at>now()',
          [req.tokenHash],
        );
        if (!s) throw fail(401, 'Сеанс истёк.');
        req.accountId = s.account_id;
      });
      user.post('/auth/logout', async (req, reply) => {
        await pool.query('DELETE FROM sessions WHERE token_hash=$1', [
          req.tokenHash,
        ]);
        return reply.code(204).send();
      });
      user.get(
        '/profile',
        async (req) =>
          (
            await pool.query('SELECT ' + view + ' FROM accounts WHERE id=$1', [
              req.accountId,
            ])
          ).rows[0],
      );
      user.patch(
        '/profile',
        body(
          fields(
            {
              revision,
              username,
              email: {
                type: 'string',
                maxLength: 254,
                pattern: '^(?:|[^\\s@]+@[^\\s@]+\\.[^\\s@]+)$',
              },
              metric,
            },
            ['revision'],
          ),
        ),
        async (req) =>
          transaction(async (client) => {
            await locked(client, req.accountId, req.body.revision);
            const {
              rows: [profile],
            } = await client.query(
              'UPDATE accounts SET username=COALESCE($2,username),email=COALESCE($3,email),metric=COALESCE($4,metric),revision=revision+1 WHERE id=$1 RETURNING ' +
                view,
              [
                req.accountId,
                req.body.username && normalized(req.body.username),
                req.body.email,
                req.body.metric,
              ],
            );
            return profile;
          }),
      );
      user.post(
        '/auth/password',
        {
          ...body(fields({ currentPassword: password, newPassword: password })),
          config: authLimit,
        },
        async (req, reply) => {
          await transaction(async (client) => {
            const {
              rows: [a],
            } = await client.query(
              'SELECT password_hash FROM accounts WHERE id=$1 FOR UPDATE',
              [req.accountId],
            );
            if (!(await matches(req.body.currentPassword, a.password_hash)))
              throw fail(403, 'Текущий пароль неверен.');
            await client.query(
              'UPDATE accounts SET password_hash=$2 WHERE id=$1',
              [req.accountId, await passwordHash(req.body.newPassword)],
            );
            await client.query(
              'DELETE FROM sessions WHERE account_id=$1 AND token_hash<>$2',
              [req.accountId, req.tokenHash],
            );
          });
          return reply.code(204).send();
        },
      );
      user.get('/timeline', async (req) => {
        const {
          rows: [snapshot],
        } = await pool.query(
          `SELECT a.revision,json_agg(json_build_object('id',t.id,'at',t.at,'mode',t.mode) ORDER BY t.at) AS transitions
        FROM accounts a JOIN transitions t ON t.account_id=a.id WHERE a.id=$1 GROUP BY a.id`,
          [req.accountId],
        );
        return snapshot;
      });
      user.put(
        '/timeline',
        body(
          fields({
            revision,
            transitions: {
              type: 'array',
              minItems: 1,
              maxItems: 40000,
              items: fields({
                id: { type: 'string', format: 'uuid' },
                at: {
                  type: 'integer',
                  minimum: Number.MIN_SAFE_INTEGER,
                  maximum: Number.MAX_SAFE_INTEGER,
                },
                mode: { enum: ['unknown', 'focus', 'rest'] },
              }),
            },
          }),
        ),
        async (req) =>
          transaction(async (client) => {
            const { transitions, revision: expected } = req.body;
            const a = await locked(client, req.accountId, expected);
            if (
              transitions[0].at !== a.bornAt ||
              transitions.at(-1).at > Date.now() ||
              new Set(transitions.map((e) => e.id.toLowerCase())).size !==
                transitions.length ||
              transitions.some(
                (e, i) =>
                  i > 0 &&
                  (e.at <= transitions[i - 1].at ||
                    e.mode === transitions[i - 1].mode),
              )
            )
              throw fail(
                400,
                'История должна непрерывно покрывать время от рождения, с уникальными записями по порядку.',
              );
            await client.query('DELETE FROM transitions WHERE account_id=$1', [
              req.accountId,
            ]);
            await client.query(
              'INSERT INTO transitions SELECT $1,t.id,t.at,t.mode FROM jsonb_to_recordset($2::jsonb) AS t(id uuid,at bigint,mode text)',
              [req.accountId, JSON.stringify(transitions)],
            );
            const {
              rows: [updated],
            } = await client.query(
              'UPDATE accounts SET revision=revision+1 WHERE id=$1 RETURNING revision',
              [req.accountId],
            );
            return updated;
          }),
      );
    },
    { prefix: '/v1' },
  );
  return app;
}
