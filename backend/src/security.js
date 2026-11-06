import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
async function key(password, salt) {
  return derive(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
}
export async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + (await key(password, salt)).toString('hex');
}
export async function matches(password, hash) {
  const [salt, expected] = hash.split(':');
  return timingSafeEqual(
    await key(password, salt),
    Buffer.from(expected, 'hex'),
  );
}
export const digest = (value) =>
  createHash('sha256').update(value).digest('hex');
export async function issueSession(client, accountId) {
  const token = randomBytes(32).toString('base64url');
  await client.query(
    "INSERT INTO sessions VALUES ($1,$2,now()+interval '30 days')",
    [digest(token), accountId],
  );
  return token;
}
