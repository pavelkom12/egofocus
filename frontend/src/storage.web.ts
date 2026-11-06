import { type Database, emptyDatabase } from './domain';
let connection: Promise<IDBDatabase> | undefined;
function open() {
  return (connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('egofocus-local', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      connection = undefined;
      reject(
        new Error(
          'Не удалось открыть локальное хранилище. Разрешите сохранение данных в браузере.',
        ),
      );
    };
  }));
}
export async function read(): Promise<Database> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readonly');
    const request = tx.objectStore('state').get('root');
    request.onsuccess = () => resolve(request.result ?? emptyDatabase());
    request.onerror = () => reject(request.error);
  });
}
export async function mutate(
  update: (db: Database) => Database,
): Promise<Database> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('state', 'readwrite');
    const store = tx.objectStore('state');
    const request = store.get('root');
    let result: Database;
    let failure: unknown;
    request.onsuccess = () => {
      try {
        result = update(request.result ?? emptyDatabase());
        store.put(result, 'root');
      } catch (e) {
        failure = e;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        failure ??
          new Error('Не удалось сохранить данные. Изменения не применены.'),
      );
    tx.onerror = () => {
      failure ??= new Error('Локальное хранилище недоступно или переполнено.');
    };
  });
}
