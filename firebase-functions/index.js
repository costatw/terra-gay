import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { createApp } from './server/app.js';
import { firestoreStore } from './server/store-firestore.js';

const sensorKey = defineSecret('SENSOR_API_KEY');
const smtpPassword = defineSecret('SMTP_PASSWORD');
let app;
export const terraApi = onRequest({
  region: 'southamerica-east1',
  memory: '512MiB',
  maxInstances: 3,
  concurrency: 20,
  timeoutSeconds: 60,
  invoker: 'public',
  secrets: [sensorKey, ...(process.env.SMTP_HOST ? [smtpPassword] : [])]
}, (req, res) => {
  if (!app) {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) throw new Error('Projeto Firebase nao identificado.');
    const origin = process.env.PUBLIC_ORIGIN || `https://${projectId}.web.app`;
    process.env.SENSOR_API_KEY = sensorKey.value();
    if (process.env.SMTP_HOST) process.env.SMTP_PASSWORD = smtpPassword.value();
    // Firebase Hosting somente encaminha o cookie __session para a funcao.
    process.env.SESSION_COOKIE_NAME = '__session';
    process.env.TRUST_PROXY = '1';
    const store = firestoreStore({ projectId });
    app = createApp({ store, production: process.env.FUNCTIONS_EMULATOR !== 'true', origin,
      allowedOrigins: [`https://${projectId}.firebaseapp.com`, ...(process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)] });
  }
  return app(req, res);
});
