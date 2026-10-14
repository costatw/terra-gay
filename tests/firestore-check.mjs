import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { firestoreStore } from '../server/store-firestore.js';
import { hashPassword } from '../server/security.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.SENSOR_TEST_KEY) throw new Error('Execute npm run test:firebase para usar emuladores isolados.');
const projectId = 'demo-terra-nova';
const store = firestoreStore({ projectId });
const password = randomBytes(20).toString('hex');
const base = 'http://127.0.0.1:5000';
const admin = await store.createUser({ full_name: 'Administrador do teste', email: 'admin@example.test', password_hash: hashPassword(password), role: 'admin', subscription_status: 'active' });
assert.ok(admin);
async function req(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
try {
  assert.equal((await req('/api/health')).data.status, 'ok');
  const created = await req('/api/auth/register', { method: 'POST', body: { full_name: 'Ana', email: 'ana@example.test', password, role: 'admin', subscription_status: 'active' } });
  assert.equal(created.status, 200); assert.equal(created.data.user.role, 'user'); assert.equal(created.data.user.subscription_status, 'pending'); assert.ok(created.cookie.startsWith('__session='));
  const ana = created.data.user;
  assert.equal((await req('/api/auth/me', { cookie: created.cookie })).data.user.id, ana.id);
  assert.equal((await req('/api/readings', { cookie: created.cookie })).status, 403);
  assert.equal((await req('/api/admin/users', { cookie: created.cookie })).status, 403);
  const adminLogin = await req('/api/auth/login', { method: 'POST', body: { email: 'admin@example.test', password } });
  assert.equal(adminLogin.status, 200);
  assert.equal((await req(`/api/admin/users/${ana.id}`, { method: 'PATCH', cookie: adminLogin.cookie, body: { subscription_status: 'active' } })).status, 200);
  assert.equal((await req('/api/admin/devices', { method: 'POST', cookie: adminLogin.cookie, body: { id: 'ana-01', name: 'Horta', user_id: ana.id } })).status, 201);
  assert.equal((await req('/functions/receiveSensorData', { method: 'POST', headers: { 'x-sensor-api-key': process.env.SENSOR_TEST_KEY }, body: { device_id: 'ana-01', temperatura: 24.8 } })).status, 201);
  const readings = await req('/api/readings', { cookie: created.cookie });
  assert.equal(readings.status, 200); assert.equal(readings.data.readings.length, 1); assert.equal(readings.data.readings[0].user_id, ana.id); assert.equal(readings.data.readings[0].umidade, null);
  const other = await store.createUser({ full_name: 'Outro', email: 'other@example.test', password_hash: hashPassword(password), subscription_status: 'active' });
  const otherLogin = await req('/api/auth/login', { method: 'POST', body: { email: other.email, password } });
  assert.equal((await req('/api/readings', { cookie: otherLogin.cookie })).data.readings.length, 0);
  assert.equal((await req('/api/admin/contacts', { cookie: otherLogin.cookie })).status, 403);
  await req('/api/contact', { method: 'POST', body: { name: 'Ana', email: 'ana@example.test', message: 'Teste', consent: true } });
  for (let i = 0; i < 2; i++) assert.equal((await req('/api/newsletter', { method: 'POST', body: { email: 'ana@example.test', consent: true } })).status, 201);
  assert.equal((await req('/api/admin/contacts', { cookie: adminLogin.cookie })).data.contacts.length, 2);
  const token = randomBytes(32).toString('hex');
  const newPassword = randomBytes(20).toString('hex');
  await store.createReset(createHash('sha256').update(token).digest('hex'), other);
  assert.equal((await req('/api/auth/reset-password', { method: 'POST', body: { token, password: newPassword } })).status, 200);
  assert.equal((await req('/api/auth/reset-password', { method: 'POST', body: { token, password: newPassword } })).status, 400);
  assert.equal((await req('/api/auth/me', { cookie: otherLogin.cookie })).status, 401);
  await req(`/api/admin/users/${ana.id}`, { method: 'PATCH', cookie: adminLogin.cookie, body: { subscription_status: 'suspended' } });
  assert.equal((await req('/api/readings', { cookie: created.cookie })).status, 403);
  assert.equal((await req('/api/auth/logout', { method: 'POST', cookie: adminLogin.cookie, body: {} })).status, 200);
  assert.equal((await req('/api/auth/me', { cookie: adminLogin.cookie })).status, 401);
  const publicRead = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${projectId}/databases/(default)/documents/users`);
  assert.equal(publicRead.status, 403, 'As regras devem impedir acesso direto às contas.');
  console.log('PASSOU: Hosting + Functions + Firestore, cookie __session, assinatura, admin, sensor, isolamento, contatos, senha e regras de acesso.');
} finally { await store.close(); }
