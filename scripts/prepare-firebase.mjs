import { mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
const target = resolve('firebase-functions/server');
mkdirSync(target, { recursive: true });
for (const file of ['app.js', 'security.js', 'store-firestore.js']) copyFileSync(resolve('server', file), resolve(target, file));
console.log('API preparada para Cloud Functions, sem banco local ou arquivos privados.');
