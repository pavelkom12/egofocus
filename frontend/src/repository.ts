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
  commitHistory,
  parseBirthday,
  switchMode,
  validateTimeline,
} from './domain';
import * as storage from './storage';
import { demoTransitions } from './demo';

const normalized = (name: string) => name.trim().toLocaleLowerCase('ru-RU');
function validateUsername(name: string) {
  if (!/^[a-zа-яё0-9_.]{3,24}$/i.test(name))
    throw new Error('Имя: 3–24 буквы, цифры, точки или подчёркивания.');
}
async function passwordHash(
  password: string,
  salt: string,
  iterations: number,
) {
  return bytesToHex(
    await pbkdf2Async(sha256, password, salt, {
      c: iterations,
      dkLen: 32,
      asyncTick: 8,
    }),
  );
}
async function credential(password: string) {
  if (password.length < 8 || password.length > 128)
    throw new Error('Пароль должен содержать от 8 до 128 символов.');
  const salt = bytesToHex(await Crypto.getRandomBytesAsync(32));
  const iterations = 600000;
  return {
    salt,
    iterations,
    hash: await passwordHash(password, salt, iterations),
  };
}
function equal(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export function current(db: Database): Account | undefined {
  return db.accounts.find((a) => a.id === db.session);
}
function requireAccount(db: Database, id: string) {
  if (db.session !== id) throw new Error('Сеанс завершён. Войдите снова.');
  const account = db.accounts.find((a) => a.id === id);
  if (!account) throw new Error('Профиль не найден.');
  return account;
}
function replace(db: Database, account: Account): Database {
  validateTimeline(account);
  return {
    ...db,
    accounts: db.accounts.map((a) => (a.id === account.id ? account : a)),
  };
}
export const repository = {
  saveHistory(
    id: string,
    revision: number,
    events: Transition[],
    limit: number,
  ) {
    return storage.mutate((db) =>
      replace(
        db,
        commitHistory(
          requireAccount(db, id),
          revision,
          events,
          limit,
          Date.now(),
        ),
      ),
    );
  },
  async createDemo() {
    const secret = await credential('demo12345');
    return storage.mutate((db) => {
      let username = 'demo';
      let suffix = 2;
      while (db.accounts.some((a) => a.username === username))
        username = 'demo' + suffix++;
      const now = Date.now();
      const bornAt = parseBirthday('15.05.1998', now);
      const account: Account = {
        id: Crypto.randomUUID(),
        username,
        email: '',
        birthday: '15.05.1998',
        bornAt,
        credential: secret,
        metric: 'percentage',
        revision: 1,
        updatedAt: now,
        transitions: demoTransitions(bornAt, now, () => Crypto.randomUUID()),
      };
      validateTimeline(account);
      return {
        ...db,
        accounts: [...db.accounts, account],
        session: account.id,
      };
    });
  },
  async load() {
    const db = await storage.read();
    if (db.schemaVersion !== 1)
      throw new Error('Версия данных не поддерживается. Обновите приложение.');
    db.accounts.forEach(validateTimeline);
    return db;
  },
  async register(username: string, password: string, birthday: string) {
    username = normalized(username);
    validateUsername(username);
    const bornAt = parseBirthday(birthday);
    const secret = await credential(password);
    const id = Crypto.randomUUID();
    return storage.mutate((db) => {
      if (db.accounts.some((a) => a.username === username))
        throw new Error('Это имя пользователя уже занято на этом устройстве.');
      const account: Account = {
        id,
        username,
        birthday: birthday.trim(),
        bornAt,
        email: '',
        credential: secret,
        transitions: [{ id: Crypto.randomUUID(), at: bornAt, mode: 'unknown' }],
        metric: 'percentage',
        revision: 1,
        updatedAt: Date.now(),
      };
      return { ...db, accounts: [...db.accounts, account], session: id };
    });
  },
  async login(username: string, password: string) {
    const db = await storage.read();
    const account = db.accounts.find(
      (a) => a.username === normalized(username),
    );
    if (
      !account ||
      !equal(
        await passwordHash(
          password,
          account.credential.salt,
          account.credential.iterations,
        ),
        account.credential.hash,
      )
    )
      throw new Error('Неверное имя пользователя или пароль.');
    return storage.mutate((latest) => {
      const found = latest.accounts.find(
        (a) =>
          a.id === account.id && a.credential.hash === account.credential.hash,
      );
      if (!found) throw new Error('Данные входа изменились. Повторите вход.');
      return { ...latest, session: found.id };
    });
  },
  logout: () => storage.mutate((db) => ({ ...db, session: null })),
  switch(id: string, target: Mode) {
    return storage.mutate((db) =>
      replace(
        db,
        switchMode(
          requireAccount(db, id),
          target,
          Date.now(),
          Crypto.randomUUID(),
        ),
      ),
    );
  },
  async profile(id: string, username: string, email: string, metric: Metric) {
    username = normalized(username);
    email = email.trim();
    validateUsername(username);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new Error('Проверьте адрес электронной почты.');
    return storage.mutate((db) => {
      const a = requireAccount(db, id);
      if (
        db.accounts.some(
          (other) => other.id !== id && other.username === username,
        )
      )
        throw new Error('Это имя уже занято.');
      return replace(db, {
        ...a,
        username,
        email,
        metric,
        revision: a.revision + 1,
        updatedAt: Date.now(),
      });
    });
  },
  async password(id: string, oldPassword: string, newPassword: string) {
    const db = await storage.read();
    const a = requireAccount(db, id);
    if (
      !equal(
        await passwordHash(
          oldPassword,
          a.credential.salt,
          a.credential.iterations,
        ),
        a.credential.hash,
      )
    )
      throw new Error('Текущий пароль неверен.');
    const secret = await credential(newPassword);
    return storage.mutate((latest) => {
      const latestAccount = requireAccount(latest, id);
      if (latestAccount.credential.hash !== a.credential.hash)
        throw new Error('Пароль уже изменился. Повторите действие.');
      return replace(latest, {
        ...latestAccount,
        credential: secret,
        revision: latestAccount.revision + 1,
        updatedAt: Date.now(),
      });
    });
  },
};
