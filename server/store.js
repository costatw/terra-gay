export async function createStore({ backend = process.env.STORAGE_BACKEND || 'sqlite', projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT, databaseId = process.env.FIRESTORE_DATABASE || '(default)' } = {}) {
  if (backend === 'firestore') return (await import('./store-firestore.js')).firestoreStore({ projectId, databaseId });
  if (backend === 'sqlite') return (await import('./store-sqlite.js')).sqliteStore();
  throw new Error('Armazenamento desconhecido. Use sqlite ou firestore.');
}
