import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

// Apenas prepara uma instalacao local nova; nunca substitui a configuracao existente.
if (!existsSync('.env') && !process.env.SENSOR_API_KEY) {
  writeFileSync('.env', `PORT=3000\nPUBLIC_ORIGIN=http://localhost:3000\nDATA_DIR=./data\nSENSOR_API_KEY=${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
  console.log('Configuração local privada criada. Nenhum valor secreto foi exibido.');
} else {
  console.log('Configuração existente preservada.');
}
