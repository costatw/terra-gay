import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const directory = mkdtempSync(join(tmpdir(), 'terra-browser-'));
const port = 3100;
const password = randomBytes(20).toString('hex');
const key = randomBytes(32).toString('hex');
const env = { ...process.env, NODE_ENV: 'development', PORT: String(port), PUBLIC_ORIGIN: `http://127.0.0.1:${port}`, DATA_DIR: directory, SENSOR_API_KEY: key, ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: password, SMTP_HOST: '', MAIL_FROM: '' };
assert.equal(spawnSync(process.execPath, ['server/create-admin.js'], { env, encoding: 'utf8' }).status, 0);
const server = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'ignore', 'pipe'] });
let browser;
const output = process.env.ARTIFACT_DIR || '/tmp/terra-visual';
mkdirSync(output, { recursive: true });
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/api/health`)).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${port}`;
  await page.goto(base); await page.getByRole('heading', { name: /Cuidar do futuro/ }).waitFor();
  await page.screenshot({ path: join(output, 'inicio-desktop.png'), fullPage: true });
  await page.getByRole('link', { name: 'Explore o painel' }).click();
  await page.getByText('Você está explorando uma demonstração.').waitFor();
  await page.screenshot({ path: join(output, 'painel-desktop.png'), fullPage: true });
  await page.getByRole('link', { name: 'Relatórios', exact: true }).click();
  await page.getByRole('heading', { name: 'Relatórios do seu solo.' }).waitFor();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar relatório' }).click();
  const pdf = await download; await pdf.saveAs(join(output, 'relatorio-demonstracao.pdf'));
  assert.equal(readFileSync(join(output, 'relatorio-demonstracao.pdf')).subarray(0, 4).toString(), '%PDF');
  await page.goto(`${base}/register`);
  await page.getByLabel('Como podemos chamar você?').fill('Ana Terra'); await page.getByLabel('E-mail', { exact: true }).fill('ana@example.test'); await page.getByLabel('Senha', { exact: true }).fill(password); await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Criar minha conta' }).click();
  await page.getByRole('heading', { name: 'A gente está preparando seu espaço.' }).waitFor();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('admin@example.test'); await page.getByLabel('Senha', { exact: true }).fill(password); await page.getByRole('button', { name: 'Entrar no meu espaço' }).click();
  await page.getByRole('link', { name: 'Administração' }).click();
  await page.getByRole('button', { name: 'Liberar', exact: true }).click();
  await page.getByRole('tab', { name: 'Sensores', exact: true }).click();
  await page.getByLabel('Identificação do dispositivo').fill('ana-01'); await page.getByLabel('Nome para reconhecer sua área').fill('Horta da Ana');
  const options = await page.getByLabel('Conta responsável').locator('option').allTextContents();
  const label = options.find(x => x.includes('ana@example.test')); await page.getByLabel('Conta responsável').selectOption({ label });
  await page.getByRole('button', { name: 'Cadastrar sensor' }).click();
  await page.getByRole('cell', { name: 'ana-01', exact: true }).waitFor();
  const ingest = await fetch(`${base}/api/sensor/readings`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sensor-api-key': key }, body: JSON.stringify({ device_id: 'ana-01', temperatura: 24.8 }) }); assert.equal(ingest.status, 201);
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.test'); await page.getByLabel('Senha', { exact: true }).fill(password); await page.getByRole('button', { name: 'Entrar no meu espaço' }).click();
  await page.getByText('24,8 °C', { exact: true }).first().waitFor();
  assert.equal(await page.getByRole('link', { name: 'Administração' }).count(), 0);
  await page.goto(`${base}/contato`); await page.getByLabel('Seu nome', { exact: true }).fill('Ana Terra'); await page.getByLabel('E-mail', { exact: true }).fill('ana@example.test'); await page.getByLabel('Sua mensagem').fill('Gostaria de testar o sensor na minha horta.'); await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Enviar mensagem', exact: true }).click(); await page.getByRole('heading', { name: 'Sua mensagem chegou.' }).waitFor();
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.on('pageerror', error => errors.push(error.message));
  for (const route of ['/', '/assinatura', '/contato', '/demonstracao', '/demonstracao/relatorios', '/demonstracao/leitura', '/login', '/register']) {
    await phone.goto(`${base}${route}`); await phone.waitForTimeout(350);
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, `Overflow em ${route}`);
  }
  await phone.goto(base); await phone.screenshot({ path: join(output, 'inicio-celular.png'), fullPage: true });
  await phone.getByRole('button', { name: 'Abrir menu', exact: true }).click(); await phone.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Assinatura', exact: true }).click(); await phone.getByRole('heading', { name: /Mais perto do solo/ }).waitFor();
  await phone.goto(`${base}/demonstracao`); await phone.screenshot({ path: join(output, 'painel-celular.png'), fullPage: true });
  await phone.getByRole('button', { name: 'Abrir navegação do painel' }).click(); await phone.getByRole('link', { name: 'Relatórios', exact: true }).click(); await phone.getByRole('heading', { name: 'Relatórios do seu solo.' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASSOU: desktop, oito rotas em celular sem overflow, menus, cadastro/login, liberação administrativa, sensor, temperatura real, contato e PDF.');
  console.log(`Capturas e PDF: ${output}`);
} finally {
  await browser?.close();
  const exited = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGTERM'); await exited;
  rmSync(directory, { recursive: true, force: true });
}
