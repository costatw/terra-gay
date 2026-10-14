import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

test('fluxos reais de conta, assinatura, sensor, isolamento e administração', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'terra-api-'));
  const port = 35000 + process.pid % 10000;
  const password = randomBytes(20).toString('hex');
  const key = randomBytes(32).toString('hex');
  const env = { ...process.env, NODE_ENV: 'production', DATA_DIR: directory, PUBLIC_ORIGIN: 'https://terra.test', PORT: String(port), SENSOR_API_KEY: key,
    SMTP_HOST: '', MAIL_FROM: '', CHECKOUT_URL: '', ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: password };
  const seed = spawnSync(process.execPath, ['server/create-admin.js'], { env, encoding: 'utf8' });
  assert.equal(seed.status, 0, seed.stderr);
  const server = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let logs = '';
  server.stderr.on('data', data => { logs += data; });
  t.after(async () => { const closed = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await closed; rmSync(directory, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`${url}/api/health`)).ok) break; } catch {} if (i === 99) throw new Error(`Servidor não iniciou: ${logs}`); await new Promise(r => setTimeout(r, 50)); }
  async function req(path, { method = 'GET', body, cookie, headers = {} } = {}) {
    const response = await fetch(`${url}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers };
  }
  let adminCookie, userCookie, otherCookie, userId, otherId;
  await t.test('saúde e autenticação sem privilégios escolhidos pelo cliente', async () => {
    assert.equal((await req('/api/health')).data.status, 'ok');
    assert.equal((await req('/api/readings')).status, 401);
    const created = await req('/api/auth/register', { method: 'POST', body: { full_name: 'Ana Terra', email: 'ana@example.test', password, role: 'admin', subscription_status: 'active' } });
    assert.equal(created.status, 200); assert.equal(created.data.user.role, 'user'); assert.equal(created.data.user.subscription_status, 'pending');
    assert.ok(created.headers.get('set-cookie').includes('HttpOnly')); assert.ok(created.headers.get('set-cookie').includes('Secure')); assert.ok(created.headers.get('set-cookie').includes('SameSite=Strict'));
    userCookie = created.cookie; userId = created.data.user.id;
    const other = await req('/api/auth/register', { method: 'POST', body: { full_name: 'Outro território', email: 'other@example.test', password } });
    otherCookie = other.cookie; otherId = other.data.user.id;
    const login = await req('/api/auth/login', { method: 'POST', body: { email: 'admin@example.test', password } });
    assert.equal(login.status, 200); adminCookie = login.cookie;
    assert.equal((await req('/api/auth/login', { method: 'POST', body: { email: 'ana@example.test', password: 'errada' } })).status, 401);
    assert.equal((await req('/api/admin/users', { cookie: userCookie })).status, 403);
    assert.equal((await req(`/api/admin/users/${userId}`, { method: 'PATCH', cookie: userCookie, body: { subscription_status: 'active' } })).status, 403);
  });
  await t.test('contas pendentes bloqueadas e liberação administrativa', async () => {
    assert.equal((await req('/api/readings', { cookie: userCookie })).status, 403);
    assert.equal((await req('/api/devices', { cookie: userCookie })).status, 403);
    assert.equal((await req(`/api/admin/users/${userId}`, { method: 'PATCH', cookie: adminCookie, body: { subscription_status: 'active' } })).status, 200);
    assert.equal((await req(`/api/admin/users/${otherId}`, { method: 'PATCH', cookie: adminCookie, body: { subscription_status: 'active' } })).status, 200);
    const list = await req('/api/admin/users', { cookie: adminCookie });
    assert.equal(list.data.users.length, 3); assert.ok(!JSON.stringify(list.data).includes('password_hash'));
  });
  await t.test('cadastro de sensor e ingestão com chave, validação e indicadores opcionais', async () => {
    for (const [id, user_id] of [['ana-01', userId], ['other-01', otherId]]) assert.equal((await req('/api/admin/devices', { method: 'POST', cookie: adminCookie, body: { id, name: 'Horta', user_id } })).status, 201);
    assert.equal((await req('/api/sensor/readings', { method: 'POST', body: { device_id: 'ana-01', temperatura: 25 } })).status, 401);
    const headers = { 'x-sensor-api-key': key };
    assert.equal((await req('/api/sensor/readings', { method: 'POST', headers, body: { device_id: 'ana-01', umidade: 101 } })).status, 400);
    assert.equal((await req('/api/sensor/readings', { method: 'POST', headers, body: { device_id: 'unknown', temperatura: 25 } })).status, 404);
    assert.equal((await req('/api/sensor/readings', { method: 'POST', headers, body: { device_id: 'ana-01', temperatura: -127 } })).status, 400);
    assert.equal((await req('/functions/receiveSensorData', { method: 'POST', headers, body: { device_id: 'ana-01', temperatura: 24.8 } })).status, 201);
    assert.equal((await req('/api/sensor/readings', { method: 'POST', headers, body: { device_id: 'other-01', temperatura: 30, umidade: 49.2, ph: 6.3 } })).status, 201);
  });
  await t.test('isolamento das leituras entre usuários e visão administrativa', async () => {
    const own = await req('/api/readings', { cookie: userCookie });
    assert.equal(own.data.readings.length, 1); assert.equal(own.data.readings[0].device_id, 'ana-01'); assert.equal(own.data.readings[0].umidade, null); assert.equal(own.data.readings[0].ph, null); assert.equal(own.data.readings[0].nivel_degradacao, null);
    const other = await req('/api/readings', { cookie: otherCookie });
    assert.equal(other.data.readings.length, 1); assert.equal(other.data.readings[0].device_id, 'other-01');
    assert.equal((await req('/api/readings', { cookie: adminCookie })).data.readings.length, 2);
    assert.equal((await req('/api/devices', { cookie: userCookie })).data.devices.length, 1);
    assert.equal((await req('/api/devices', { cookie: adminCookie })).data.devices.length, 2);
    const delta = await req('/api/readings?after=' + encodeURIComponent(own.data.cursor), { cookie: userCookie });
    assert.equal(delta.status, 200); assert.ok(delta.data.readings.every(r => r.user_id === userId));
    assert.equal((await req('/api/readings?after=invalido', { cookie: userCookie })).status, 400);
  });
  await t.test('contato e newsletter persistidos, consentimento obrigatório', async () => {
    assert.equal((await req('/api/contact', { method: 'POST', body: { name: 'Ana', email: 'ana@example.test', message: 'Uma parceria' } })).status, 400);
    assert.equal((await req('/api/contact', { method: 'POST', body: { name: 'Ana', email: 'ana@example.test', message: 'Uma parceria', consent: true } })).status, 201);
    for (let i = 0; i < 2; i++) assert.equal((await req('/api/newsletter', { method: 'POST', body: { email: 'ana@example.test', consent: true } })).status, 201);
    assert.equal((await req('/api/admin/contacts', { cookie: userCookie })).status, 403);
    assert.equal((await req('/api/admin/contacts', { cookie: adminCookie })).data.contacts.length, 2);
    const checkout = await req('/api/checkout', { method: 'POST', cookie: userCookie, body: {} });
    assert.ok(checkout.data.url.startsWith('https://wa.me/')); assert.equal(checkout.data.manual, true);
  });
  await t.test('suspensão aplicada à sessão existente e proteção contra origem externa', async () => {
    assert.equal((await req(`/api/admin/users/${userId}`, { method: 'PATCH', cookie: adminCookie, body: { subscription_status: 'suspended' } })).status, 200);
    assert.equal((await req('/api/readings', { cookie: userCookie })).status, 403);
    assert.equal((await req('/api/auth/logout', { method: 'POST', cookie: userCookie, headers: { Origin: 'https://outro-site.test' }, body: {} })).status, 403);
    assert.equal((await req('/api/auth/me', { cookie: userCookie })).data.user.subscription_status, 'suspended');
  });
  await t.test('recuperação indisponível sem SMTP, token de redefinição único e invalidação de sessões', async () => {
    assert.equal((await req('/api/auth/forgot-password', { method: 'POST', body: { email: 'other@example.test' } })).status, 503);
    const token = randomBytes(32).toString('hex');
    const fixture = new DatabaseSync(join(directory, 'terra.sqlite'));
    fixture.prepare('INSERT INTO password_resets VALUES (?,?,?)').run(createHash('sha256').update(token).digest('hex'), otherId, Date.now() + 60000); fixture.close();
    const password2 = randomBytes(20).toString('hex');
    assert.equal((await req('/api/auth/reset-password', { method: 'POST', body: { token, password: password2 } })).status, 200);
    assert.equal((await req('/api/auth/reset-password', { method: 'POST', body: { token, password: password2 } })).status, 400);
    assert.equal((await req('/api/auth/me', { cookie: otherCookie })).status, 401);
    const login = await req('/api/auth/login', { method: 'POST', body: { email: 'other@example.test', password: password2 } });
    assert.equal(login.status, 200);
    assert.equal((await req('/api/auth/logout', { method: 'POST', cookie: login.cookie, body: {} })).status, 200);
    assert.equal((await req('/api/auth/me', { cookie: login.cookie })).status, 401);
  });
});
