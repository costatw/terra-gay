import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const cli = process.env.FIREBASE_BIN || (process.platform === 'win32' ? 'npx.cmd' : 'npx');
const prefix = process.env.FIREBASE_BIN ? [] : ['--yes', 'firebase-tools@15.33.0'];
function run(args, capture = false) {
  const result = spawnSync(cli, [...prefix, ...args], { encoding: 'utf8', stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) console.error('A operação Firebase não foi concluída. Confira login, permissões e acesso de rede.');
    throw new Error(`Firebase não concluiu ${args[0]}.`);
  }
  return capture ? JSON.parse(result.stdout) : undefined;
}
async function main() {
  // Consulta real antes de qualquer criação: não inventa acesso ou projeto.
  let projects;
  try { projects = run(['projects:list', '--json', '--non-interactive'], true).result || []; }
  catch { console.error('Entre na sua conta Google pelo fluxo oficial: npx firebase-tools@15.33.0 login. Não envie tokens ou senhas pelo chat.'); process.exitCode = 1; return; }
  const savedAliases = existsSync('.firebaserc') ? JSON.parse(readFileSync('.firebaserc', 'utf8')) : {};
  const configuredProject = process.env.FIREBASE_PROJECT_ID || savedAliases.projects?.default;
  const proposed = configuredProject || `terra-nova-mater-${randomBytes(3).toString('hex')}`;
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let id;
  try { id = configuredProject || (await prompt.question(`ID do projeto (Enter cria ${proposed}): `)).trim() || proposed; } finally { prompt.close(); }
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(id)) throw new Error('ID inválido. Use de 6 a 30 caracteres: letras minúsculas, números e hífens.');
  if (!projects.some(p => p.projectId === id)) {
    if (configuredProject) throw new Error('O projeto configurado não está acessível com essa conta Google. Confira permissões e conta; nenhum outro projeto será criado.');
    run(['projects:create', id, '--display-name', 'Terra Nova Mater', '--non-interactive']);
    console.log('Projeto criado. Cloud Functions exige faturamento Blaze. Vincule sua conta de faturamento no console antes de concluir o deploy se ainda não estiver habilitado.');
  }
  // Não sobrescreve aliases que o usuário já configurou.
  const aliases = existsSync('.firebaserc') ? JSON.parse(readFileSync('.firebaserc', 'utf8')) : {};
  aliases.projects = { ...aliases.projects, default: id };
  writeFileSync('.firebaserc', JSON.stringify(aliases, null, 2) + '\n');
  const variables = `firebase-functions/.env.${id}`;
  if (!existsSync(variables)) writeFileSync(variables, `PUBLIC_ORIGIN=https://${id}.web.app\n`, { flag: 'wx', mode: 0o600 });
  const databaseInfo = run(['firestore:databases:list', '--project', id, '--json', '--non-interactive'], true).result;
  const databases = Array.isArray(databaseInfo) ? databaseInfo : databaseInfo?.databases || [];
  if (!databases.some(d => d.name?.endsWith('/databases/(default)'))) run(['firestore:databases:create', '(default)', '--location', 'southamerica-east1', '--project', id, '--non-interactive']);
  let secret = process.env.SENSOR_API_KEY;
  if (!secret || secret.length < 24) {
    mkdirSync('.firebase-private', { recursive: true, mode: 0o700 });
    if (existsSync('.firebase-private/sensor.key')) secret = readFileSync('.firebase-private/sensor.key', 'utf8').trim();
    else { secret = randomBytes(32).toString('hex'); writeFileSync('.firebase-private/sensor.key', secret, { flag: 'wx', mode: 0o600 }); }
    console.log('Chave de sensor preparada no arquivo privado .firebase-private/sensor.key; nenhum valor foi exibido.');
  }
  const directory = mkdtempSync(join(tmpdir(), 'terra-secret-'));
  try {
    const file = join(directory, 'sensor.key');
    writeFileSync(file, secret, { mode: 0o600 });
    run(['functions:secrets:set', 'SENSOR_API_KEY', '--data-file', file, '--project', id, '--non-interactive']);
  } finally { rmSync(directory, { recursive: true, force: true }); }
  run(['deploy', '--only', 'firestore,functions,hosting', '--project', id]);
  const publicURL = `https://${id}.web.app`;
  const response = await fetch(`${publicURL}/api/health`);
  if (!response.ok || (await response.json()).status !== 'ok') throw new Error('O deploy terminou, mas a API pública não passou na verificação de saúde. Não considere o site pronto ainda.');
  console.log(`Publicação confirmada; API acessível. Link público: ${publicURL}`);
  console.log('Crie seu administrador no Firestore conforme FIREBASE.md e vincule os sensores à conta antes de usar dados reais.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
