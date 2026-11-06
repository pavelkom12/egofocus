import { openDatabaseAsync } from 'expo-sqlite';
import { type Database, emptyDatabase } from './domain';
const connection = openDatabaseAsync('egofocus.db').then(async (db) => {
  await db.execAsync(
    'PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS local_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)',
  );
  return db;
});
export async function read(): Promise<Database> {
  const db = await connection;
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM local_state WHERE id=1',
  );
  return row ? JSON.parse(row.value) : emptyDatabase();
}
let queue: Promise<unknown> = Promise.resolve();
export function mutate(update: (db: Database) => Database): Promise<Database> {
  const work = queue.then(async () => {
    const db = await connection;
    let result!: Database;
    await db.withExclusiveTransactionAsync(async (tx) => {
      const row = await tx.getFirstAsync<{ value: string }>(
        'SELECT value FROM local_state WHERE id=1',
      );
      result = update(row ? JSON.parse(row.value) : emptyDatabase());
      await tx.runAsync(
        'INSERT INTO local_state(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value',
        JSON.stringify(result),
      );
    });
    return result;
  });
  queue = work.catch(() => {});
  return work;
}
