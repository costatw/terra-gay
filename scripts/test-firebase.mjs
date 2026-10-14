import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const configPath = 'public/firebase-config.json';
const previous = existsSync(configPath) ? readFileSync(configPath) : null;
const cli = process.env.FIREBASE_BIN || (process.platform === 'win32' ? 'npx.cmd' : 'npx');
const prefix = process.env.FIREBASE_BIN ? [] : ['--yes', 'firebase-tools@15.33.0'];
try {
  writeFileSync(configPath, JSON.stringify({ mode: 'firebase', firebase: { apiKey: 'demo-key', projectId: 'demo-terra-nova', authDomain: 'demo-terra-nova.firebaseapp.com', appId: 'demo-app' }, emulators: { auth: 'http://127.0.0.1:9099', firestore: { host: '127.0.0.1', port: 8080 } } }));
  if (spawnSync('npm', ['run','build'], { stdio: 'inherit' }).status !== 0) throw new Error('Build de teste falhou.');
  const child = spawn(cli, [...prefix,'emulators:exec','--project','demo-terra-nova','--only','hosting,auth,firestore','node tests/spark-check.mjs'], { stdio: 'inherit', env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${resolve('scripts/firebase-loopback.cjs')}`.trim(), FIREBASE_EMULATORS_PATH: process.env.FIREBASE_EMULATORS_PATH || resolve('.firebase/emulators') } });
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code == null ? 1 : code)); });
} finally {
  if (previous) writeFileSync(configPath, previous); else if (existsSync(configPath)) unlinkSync(configPath);
  // A configuração de emuladores também sai do build, mesmo após uma falha.
  const built = 'dist/firebase-config.json';
  if (previous) writeFileSync(built, previous); else if (existsSync(built)) unlinkSync(built);
}
