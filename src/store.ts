import { defaults, type State } from './core';
import { seed } from './data';

let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise((resolve, reject) => {
    const request = indexedDB.open('liquid-lab', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

export async function read(): Promise<State> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction('state').objectStore('state').get('main');
    request.onsuccess = () => resolve(request.result ?? { questions: seed(), settings: structuredClone(defaults), active: null, history: [] });
    request.onerror = () => reject(request.error);
  });
}

export async function save(state: State): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('state', 'readwrite');
    transaction.objectStore('state').put(state, 'main');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
