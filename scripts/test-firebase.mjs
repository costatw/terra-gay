import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const localEnv = 'firebase-functions/.env.local';
const localSecrets = 'firebase-functions/.secret.local';
if (existsSync(localEnv) || existsSync(localSecrets)) throw new Error('Há configuração local de emulador existente. Preserve seus arquivos e rode o teste em outra configuração isolada.');
writeFileSync(localEnv, 'PUBLIC_ORIGIN=http://127.0.0.1:5000\n', { flag: 'wx', mode: 0o600 });
const key = randomBytes(32).toString('hex');
writeFileSync(localSecrets, `SENSOR_API_KEY=${key}\n`, { flag: 'wx', mode: 0o600 });
const preparation = spawnSync(process.execPath, ['scripts/prepare-firebase.mjs'], { stdio: 'inherit' });
const cli = process.env.FIREBASE_BIN || (process.platform === 'win32' ? 'npx.cmd' : 'npx');
const prefix = process.env.FIREBASE_BIN ? [] : ['--yes', 'firebase-tools@15.33.0'];
try {
  if (preparation.status !== 0) throw new Error('A preparação da API falhou.');
  const child = spawn(cli, [...prefix, 'emulators:exec', '--project', 'demo-terra-nova', '--only', 'hosting,functions,firestore', 'node tests/firestore-check.mjs'], {
    stdio: 'inherit', env: { ...process.env, SENSOR_TEST_KEY: key,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${resolve('scripts/firebase-loopback.cjs')}`.trim(),
      FIREBASE_EMULATORS_PATH: process.env.FIREBASE_EMULATORS_PATH || resolve('.firebase/emulators') }
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => resolve(code == null ? 1 : code));
  });
  process.exitCode = code;
} finally { unlinkSync(localEnv); unlinkSync(localSecrets); }
