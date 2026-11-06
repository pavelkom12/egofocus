import * as Crypto from 'expo-crypto';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  type Account,
  type Database,
  type Metric,
  type Mode,
  type Transition,
  type SyncBase,
  commitHistory,
  parseBirthday,
  switchMode,
  validateTimeline,
} from './domain';
import { api, ApiError, type AuthResult, snapshot } from './api';
import { mergeHistory, mergeValue, MergeConflict, type Choice } from './merge';
import * as storage from './storage';

export function current(db: Database) {
  return db.accounts.find((a) => a.id === db.session && a.base);
}
const normalized = (s: string) => s.trim().toLocaleLowerCase('ru-RU');
function put(db: Database, a: Account): Database {
  validateTimeline(a);
  return {
    ...db,
    accounts: [...db.accounts.filter((old) => old.id !== a.id), a],
  };
}
function signed(db: Database, id: string) {
  const a = current(db);
  if (!a || a.id !== id || !db.token) throw Error('Войдите снова.');
  return a;
}
function sameHistory(a: Transition[], b: Transition[]) {
  return (
    a.length === b.length &&
    a.every((e, i) => e.at === b[i].at && e.mode === b[i].mode)
  );
}
const fields = ['username', 'email', 'metric'] as const;
function fromServer(remote: Awaited<ReturnType<typeof snapshot>>): Account {
  const { profile: p, transitions } = remote;
  const base: SyncBase = {
    username: p.username,
    email: p.email,
    metric: p.metric,
    revision: p.revision,
    transitions,
  };
  return {
    ...p,
    birthday: p.birthday.split('-').reverse().join('.'),
    transitions,
    base,
    updatedAt: Date.now(),
  };
}
async function authorized(result: AuthResult, password: string) {
  const server = fromServer(await snapshot(result.token));
  if (server.id !== result.profile.id)
    throw Error('Профиль сервера изменился.');
  const local = await storage.read();
  const legacy = local.accounts.find(
    (a) =>
      !a.base &&
      !a.importedTo &&
      a.credential &&
      a.username === server.username &&
      a.bornAt === server.bornAt,
  );
  let importId: string | undefined;
  if (legacy?.credential) {
    const c = legacy.credential;
    const hash = bytesToHex(
      await pbkdf2Async(sha256, password, c.salt, {
        c: c.iterations,
        dkLen: 32,
        asyncTick: 8,
      }),
    );
    if (hash === c.hash) importId = legacy.id;
  }
  await storage.mutate((db) => {
    let account =
      db.accounts.find((a) => a.id === server.id && a.base) || server;
    const old = db.accounts.find((a) => a.id === importId && !a.importedTo);
    if (old && account === server) {
      const initial = {
        ...server.transitions[0],
        at: server.bornAt,
        mode: 'unknown' as const,
      };
      account = {
        ...server,
        transitions: old.transitions,
        email: old.email || server.email,
        metric: old.metric === 'percentage' ? server.metric : old.metric,
        base: {
          ...server.base!,
          email: '',
          metric: 'percentage',
          transitions: [initial],
        },
      };
      db = {
        ...db,
        accounts: db.accounts.map((a) =>
          a.id === old.id ? { ...a, importedTo: server.id } : a,
        ),
      };
    }
    return { ...put(db, account), session: server.id, token: result.token };
  });
  return sync();
}
let pending: Promise<unknown> = Promise.resolve();
function sync(choice?: Choice): Promise<Database> {
  const job = pending.then(() => syncOnce(choice));
  pending = job.catch(() => {});
  return job;
}
async function syncOnce(choice?: Choice): Promise<Database> {
  const db = await storage.read(),
    local = current(db);
  if (!local || !local.base || !db.token) return db;
  const base = local.base,
    token = db.token;
  try {
    const server = fromServer(await snapshot(token));
    if (server.id !== local.id) throw Error('Несовпадение профилей.');
    const merged = {
      username: mergeValue(
        base.username,
        local.username,
        server.username,
        choice,
      ),
      email: mergeValue(base.email, local.email, server.email, choice),
      metric: mergeValue(base.metric, local.metric, server.metric, choice),
    };
    const transitions = mergeHistory(
      base.transitions,
      local.transitions,
      server.transitions,
      choice,
    );
    validateTimeline({ ...local, transitions });
    let revision = server.revision;
    if (fields.some((k) => merged[k] !== server[k])) {
      revision = (
        await api<{ revision: number }>('/profile', token, 'PATCH', {
          ...merged,
          revision,
        })
      ).revision;
    }
    if (!sameHistory(transitions, server.transitions)) {
      revision = (
        await api<{ revision: number }>('/timeline', token, 'PUT', {
          transitions,
          revision,
        })
      ).revision;
    }
    return await storage.mutate((latest) => {
      if (latest.token !== token || latest.session !== local.id) return latest;
      const a = signed(latest, local.id);
      if (a.revision !== local.revision) return latest; // another tab saved after we read its draft
      const modified =
        fields.some((k) => a[k] !== merged[k]) ||
        !sameHistory(a.transitions, transitions);
      return put(latest, {
        ...a,
        ...merged,
        transitions,
        revision: a.revision + (modified ? 1 : 0),
        base: { ...merged, transitions, revision },
      });
    });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      return storage.mutate((latest) =>
        latest.token === token
          ? { ...latest, token: undefined, session: null }
          : latest,
      );
    }
    const latest = await storage.read();
    if (latest.token !== token) return latest;
    return {
      ...latest,
      syncNotice:
        e instanceof Error ? e.message : 'Синхронизация временно недоступна.',
      conflict: e instanceof MergeConflict,
    };
  }
}
async function change(id: string, update: (a: Account) => Account) {
  await storage.mutate((db) => put(db, update(signed(db, id))));
  return sync();
}
export const repository = {
  async load() {
    const db = await storage.read();
    if (db.schemaVersion !== 1)
      throw Error('Обновите приложение для этой версии данных.');
    return db;
  },
  sync,
  login: async (username: string, password: string) =>
    authorized(
      await api<AuthResult>('/auth/login', undefined, 'POST', {
        username: normalized(username),
        password,
      }),
      password,
    ),
  register: async (username: string, password: string, birthday: string) => {
    const bornAt = parseBirthday(birthday);
    return authorized(
      await api<AuthResult>('/auth/register', undefined, 'POST', {
        username: normalized(username),
        password,
        birthday: birthday.trim().split('.').reverse().join('-'),
        utcOffsetMinutes: -new Date(bornAt).getTimezoneOffset(),
      }),
      password,
    );
  },
  async logout() {
    const db = await storage.read();
    if (db.token) {
      try {
        await api('/auth/logout', db.token, 'POST');
      } catch (e) {
        if (!(e instanceof ApiError && [0, 401].includes(e.status))) throw e;
      }
    }
    return storage.mutate((latest) =>
      latest.token === db.token
        ? { ...latest, session: null, token: undefined }
        : latest,
    );
  },
  switch: (id: string, target: Mode) =>
    change(id, (a) => switchMode(a, target, Date.now(), Crypto.randomUUID())),
  saveHistory: (
    id: string,
    revision: number,
    events: Transition[],
    limit: number,
  ) => change(id, (a) => commitHistory(a, revision, events, limit, Date.now())),
  async profile(id: string, username: string, email: string, metric: Metric) {
    username = normalized(username);
    email = email.trim();
    if (!/^[a-zа-яё0-9_.]{3,24}$/i.test(username))
      throw Error('Проверьте имя пользователя.');
    if (
      email.length > 254 ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    )
      throw Error('Проверьте электронную почту.');
    return change(id, (a) => ({
      ...a,
      username,
      email,
      metric,
      revision: a.revision + 1,
      updatedAt: Date.now(),
    }));
  },
  async password(id: string, currentPassword: string, newPassword: string) {
    const db = await storage.read();
    signed(db, id);
    await api('/auth/password', db.token, 'POST', {
      currentPassword,
      newPassword,
    });
    return db;
  },
};
