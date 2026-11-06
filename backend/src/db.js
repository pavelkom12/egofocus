import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
export const pool = new pg.Pool({ max: 10, connectionTimeoutMillis: 5000 });
pool.on('error', (err) => console.error('PostgreSQL pool:', err.message));
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
export async function migrate() {
  const directory = new URL('../migrations/', import.meta.url);
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(518024)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY)',
    );
    const files = (await readdir(directory))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const applied = await client.query(
        'SELECT 1 FROM schema_migrations WHERE filename=$1',
        [file],
      );
      if (applied.rowCount) continue;
      await client.query(await readFile(new URL(file, directory), 'utf8'));
      await client.query('INSERT INTO schema_migrations VALUES ($1)', [file]);
    }
  });
}
