import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer as createHTTPServer } from 'node:http';
import { createStore } from './store.js';
import { createApp } from './app.js';
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === 'production';
const store = await createStore();
const app = createApp({ store });
const server = createHTTPServer(app);
let vite;
if (!production) {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  if (!existsSync(resolve('dist/index.html'))) throw new Error('Execute npm run build antes de iniciar em produção.');
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
}
server.listen(port, '0.0.0.0', () => console.log(`Terra Nova Mater iniciado na porta ${port}.`));
async function close() { await vite?.close(); server.close(async () => { await store.close(); process.exit(0); }); }
process.on('SIGTERM', close);
process.on('SIGINT', close);
