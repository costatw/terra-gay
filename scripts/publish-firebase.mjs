import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const cli = process.env.FIREBASE_BIN || (process.platform === 'win32' ? 'npx.cmd' : 'npx');
const prefix = process.env.FIREBASE_BIN ? [] : ['--yes', 'firebase-tools@15.33.0'];
function run(args, json = false) {
  const result = spawnSync(cli, [...prefix, ...args], { encoding: 'utf8', stdio: json ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Firebase não concluiu ${args[0]}. Confira login e permissões no projeto.`);
  return json ? JSON.parse(result.stdout).result : undefined;
}
async function main() {
  const id = process.env.FIREBASE_PROJECT_ID || JSON.parse(readFileSync('.firebaserc', 'utf8')).projects.default;
  const projects = run(['projects:list', '--json', '--non-interactive'], true);
  if (!projects.some(p => p.projectId === id)) throw new Error('Esse projeto não está acessível com a conta autenticada.');
  const apps = run(['apps:list', 'WEB', '--project', id, '--json', '--non-interactive'], true);
  const app = apps.find(a => a.displayName === 'Terra Nova Mater') || apps[0] || run(['apps:create', 'WEB', 'Terra Nova Mater', '--project', id, '--json', '--non-interactive'], true);
  const sdk = run(['apps:sdkconfig', 'WEB', app.appId, '--project', id, '--json', '--non-interactive'], true).sdkConfig;
  if (sdk?.projectId !== id || !sdk.apiKey) throw new Error('A configuração pública do aplicativo não foi obtida.');
  const path = 'public/firebase-config.json';
  const existing = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  if (existing.firebase?.projectId && existing.firebase.projectId !== id) throw new Error('Já há configuração para outro projeto. Nenhum arquivo foi substituído.');
  const settings = { ...existing, mode: 'firebase', firebase: sdk };
  delete settings.emulators;
  writeFileSync(path, JSON.stringify(settings, null, 2) + '\n');
  console.log('Configuração pública preparada. Nenhuma senha, chave privada ou conta de serviço é necessária no site.');
  const databases = run(['firestore:databases:list', '--project', id, '--json', '--non-interactive'], true);
  const list = Array.isArray(databases) ? databases : databases?.databases || [];
  if (!list.some(d => d.name?.endsWith('/databases/(default)'))) run(['firestore:databases:create', '(default)', '--location', 'southamerica-east1', '--project', id, '--non-interactive']);
  // Não há Functions, Secret Manager, TTL pago ou configuração de faturamento.
  run(['deploy', '--only', 'firestore,hosting', '--project', id]);
  const url = `https://${id}.web.app`;
  const check = await fetch(`${url}/firebase-config.json`);
  if (!check.ok || (await check.json()).firebase?.projectId !== id) throw new Error('Deploy terminou, mas a configuração no domínio público não foi confirmada.');
  const page = await fetch(url);
  if (!page.ok || !(await page.text()).includes('Terra Nova Mater')) throw new Error('A página pública não passou na verificação.');
  console.log(`Hosting publicado e confirmado: ${url}`);
  console.log('Permaneça no plano Spark. Habilite Authentication > E-mail/senha e configure o primeiro administrador conforme FIREBASE.md.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
