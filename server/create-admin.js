import { hashPassword } from './security.js';
import { createStore } from './store.js';
if (process.env.STORAGE_BACKEND === 'firestore') {
  console.error('Na versão Firebase Spark, crie sua conta no site e defina role=admin no documento users/{UID} pelo console, conforme FIREBASE.md. Este comando é para o backend SQLite local.');
  process.exit(1);
}
const store = await createStore();
// Os valores vêm do ambiente, nunca de argumentos que ficam no histórico do shell.
const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = 'Administrador' } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 10 || ADMIN_PASSWORD.length > 128) {
  console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo de 10 caracteres) no ambiente. ADMIN_NAME é opcional.');
  process.exit(1);
}
const email = ADMIN_EMAIL.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
if (await store.getUserByEmail(email)) {
  console.error('Essa conta já existe. Nenhuma senha ou permissão foi alterada.');
  process.exit(1);
}
if (!await store.createUser({full_name: ADMIN_NAME, email, password_hash: hashPassword(ADMIN_PASSWORD), role: 'admin', subscription_status: 'active'})) throw new Error('Essa conta já existe.');
await store.close();
console.log('Conta de administrador criada. Você já pode entrar pelo site.');
