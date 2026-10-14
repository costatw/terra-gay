import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { hashPassword, verifyPassword, publicUser } from './security.js';

export function createApp({ store, production = process.env.NODE_ENV === 'production', port = Number(process.env.PORT || 3000), origin = process.env.PUBLIC_ORIGIN || `http://localhost:${port}`, allowedOrigins = [] } = {}) {
const app = express();
const acceptedOrigins = new Set([origin, ...allowedOrigins]);
const cookieName = process.env.SESSION_COOKIE_NAME || 'terra_session';
if (production && !/^https:\/\//.test(origin)) throw new Error('PUBLIC_ORIGIN deve ser o endereço HTTPS público em produção.');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: production ? {
  directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'], connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"] }
} : false }));
app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => { req.body ??= {}; next(); });
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  // As sessões usam cookie SameSite=Strict; alterações vindas de outro site também são rejeitadas.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin && !acceptedOrigins.has(req.headers.origin)) {
    return res.status(403).json({ error: 'Origem não autorizada.' });
  }
  next();
});
const localLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.' } });
const limiter = store.checkRateLimit ? async (req, res, next) => {
  if (!await store.checkRateLimit(`${req.baseUrl}:${req.ip}`)) return res.status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.' });
  next();
} : localLimiter;
app.use('/api/auth', limiter);
app.use('/api/contact', limiter);
app.use('/api/newsletter', limiter);
const emailOK = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const text = (v, max = 250) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const digest = token => createHash('sha256').update(token).digest('hex');
const sessionCookie = token => `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${production ? '; Secure' : ''}`;
const mailReady = () => Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
const transport = mailReady() ? nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT || 587) === 465, requireTLS: Number(process.env.SMTP_PORT || 587) !== 465,
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined }) : null;
async function authenticate(req, res, next) {
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`));
  const token = cookie?.slice(`${cookieName}=`.length);
  const user = token && await store.sessionUser(digest(token));
  if (!user) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });
  req.user = user;
  next();
}
function active(req, res, next) {
  if (req.user.role !== 'admin' && req.user.subscription_status !== 'active') return res.status(403).json({ error: 'Sua assinatura precisa estar ativa para acessar as leituras.' });
  next();
}
function admin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Essa função é exclusiva da administração.' });
  next();
}
async function createSession(user, res) {
  const token = randomBytes(32).toString('hex');
  await store.createSession(digest(token), user);
  res.set('Set-Cookie', sessionCookie(token)).json({ user: publicUser(user) });
}
app.get('/api/health', async (req, res) => {
  await store.health();
  res.json({ status: 'ok' });
});
app.get('/api/config', (req, res) => res.json({ emailRecovery: mailReady(), checkoutConfigured: Boolean(process.env.CHECKOUT_URL) }));
app.post('/api/auth/register', async (req, res) => {
  const { password } = req.body;
  const email = text(req.body.email).toLowerCase();
  const name = text(req.body.full_name, 100);
  if (!emailOK(email) || !name || typeof password !== 'string' || password.length < 10 || password.length > 128) {
    return res.status(400).json({ error: 'Informe seu nome, um e-mail válido e uma senha de 10 a 128 caracteres.' });
  }
  if (await store.getUserByEmail(email)) return res.status(409).json({ error: 'Esse e-mail já está cadastrado. Entre na sua conta ou recupere a senha.' });
  const user = await store.createUser({ full_name: name, email, password_hash: hashPassword(password) });
  if (!user) return res.status(409).json({ error: 'Esse e-mail já está cadastrado.' });
  await createSession(user, res);
});
app.post('/api/auth/login', async (req, res) => {
  const user = await store.getUserByEmail(text(req.body.email).toLowerCase());
  const password = req.body.password;
  if (typeof password !== 'string' || password.length > 128 || !user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'E-mail ou senha incorretos. Confira e tente novamente.' });
  await createSession(user, res);
});
app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));
app.post('/api/auth/logout', async (req, res) => {
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName}=`));
  if (cookie) await store.deleteSession(digest(cookie.slice(`${cookieName}=`.length)));
  res.set('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${production ? '; Secure' : ''}`).json({ ok: true });
});
app.post('/api/auth/forgot-password', async (req, res) => {
  if (!mailReady()) return res.status(503).json({ error: 'A recuperação por e-mail ainda não foi configurada. Fale com a equipe pelo suporte.' });
  const email = text(req.body.email).toLowerCase();
  if (!emailOK(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  const user = await store.getUserByEmail(email);
  if (user) {
    const token = randomBytes(32).toString('hex');
    await store.createReset(digest(token), user);
    try {
      await transport.sendMail({ from: process.env.MAIL_FROM, to: email, subject: 'Redefina sua senha — Terra Nova Mater',
        text: `Para escolher uma nova senha, acesse: ${origin}/reset-password?token=${token}\nO link vale por uma hora. Se você não pediu a alteração, ignore esta mensagem.` });
    } catch {
      await store.deleteReset(digest(token));
      // A resposta continua igual para não revelar quais e-mails têm conta.
      console.error('Falha no envio de recuperação. Verifique a configuração SMTP.');
    }
  }
  res.json({ message: 'Se houver uma conta com esse e-mail, enviaremos as instruções de recuperação.' });
});
app.post('/api/auth/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (typeof token !== 'string' || token.length > 128 || typeof password !== 'string' || password.length < 10 || password.length > 128) return res.status(400).json({ error: 'Use uma senha de 10 a 128 caracteres e um link válido.' });
  const consumed = await store.consumeReset(digest(token), hashPassword(password));
  if (!consumed) return res.status(400).json({ error: 'Esse link expirou ou já foi usado. Solicite outro.' });
  res.json({ ok: true });
});
app.post('/api/contact', async (req, res) => {
  const b = req.body;
  if (!text(b.name) || !emailOK(b.email) || !text(b.message) || b.consent !== true) return res.status(400).json({ error: 'Preencha nome, e-mail e mensagem e autorize nosso contato.' });
  await store.createContact({ name: text(b.name), email: text(b.email).toLowerCase(), phone: text(b.phone), organization: text(b.organization), profile: text(b.profile), subject: text(b.subject), preferred_channel: text(b.preferred_channel), message: text(b.message, 5000), kind: 'contact' });
  if (transport) transport.sendMail({ from: process.env.MAIL_FROM, to: process.env.CONTACT_EMAIL || 'terra.nova.sustentabilidade@gmail.com',
    replyTo: text(b.email), subject: 'Nova mensagem pelo site Terra Nova Mater', text: `${text(b.name)}\n${text(b.email)}\n${text(b.message, 5000)}` }).catch(() => console.error('Aviso por e-mail não enviado; a mensagem permanece salva no painel.'));
  res.status(201).json({ ok: true });
});
app.post('/api/newsletter', async (req, res) => {
  if (!emailOK(req.body.email) || req.body.consent !== true) return res.status(400).json({ error: 'Informe um e-mail válido e autorize o recebimento das novidades.' });
  const email = text(req.body.email).toLowerCase();
  await store.createContact({ name: text(req.body.name) || 'Assinante', email, profile: text(req.body.profile), kind: 'newsletter' });
  res.status(201).json({ ok: true });
});
app.post('/api/checkout', authenticate, async (req, res) => {
  const link = process.env.CHECKOUT_URL;
  if (link) {
    if (!/^https:\/\//.test(link)) return res.status(503).json({ error: 'O link de pagamento ainda não está configurado corretamente.' });
    return res.json({ url: link });
  }
  res.json({ url: 'https://wa.me/5511995094324?text=' + encodeURIComponent(`Olá! Quero assinar o plano de R$ 40/mês do Terra Nova Mater. Meu cadastro: ${req.user.email}`), manual: true });
});
app.get('/api/readings', authenticate, active, async (req, res) => {
  const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const cursor = new Date(Date.now() - 1000).toISOString();
  const after = req.query.after;
  if (after != null && (typeof after !== 'string' || !Number.isFinite(new Date(after).getTime()))) return res.status(400).json({ error: 'Cursor de atualização inválido.' });
  const rows = await store.listReadings(req.user, since, after ? new Date(after).toISOString() : undefined);
  res.json({ readings: rows, cursor });
});
app.get('/api/devices', authenticate, active, async (req, res) => {
  const rows = await store.listDevices(req.user);
  res.json({ devices: rows });
});
app.get('/api/admin/users', authenticate, admin, async (req, res) => res.json({ users: (await store.listUsers()).map(publicUser) }));
app.patch('/api/admin/users/:id', authenticate, admin, async (req, res) => {
  const status = req.body.subscription_status;
  if (!['pending', 'active', 'suspended'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  const user = await store.getUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Conta não encontrada.' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Contas administrativas não dependem de assinatura.' });
  await store.setSubscription(user.id, status, req.user.id);
  res.json({ user: publicUser({ ...user, subscription_status: status }) });
});
app.get('/api/admin/contacts', authenticate, admin, async (req, res) => res.json({ contacts: await store.listContacts() }));
app.post('/api/admin/devices', authenticate, admin, async (req, res) => {
  const id = text(req.body.id, 80), name = text(req.body.name, 100), userId = String(req.body.user_id || '');
  if (!/^[\w-]{1,80}$/.test(id) || !name || !await store.getUser(userId)) return res.status(400).json({ error: 'Informe identificação válida, nome e proprietário do sensor.' });
  if (!await store.createDevice({ id, name, user_id: userId }, req.user.id)) return res.status(409).json({ error: 'Esse sensor já está cadastrado.' });
  res.status(201).json({ ok: true });
});
async function receiveSensorData(req, res) {
  const expected = process.env.SENSOR_API_KEY;
  if (!expected || expected.length < 24) return res.status(503).json({ error: 'Integração de sensores ainda não configurada.' });
  const given = req.get('x-sensor-api-key') || '';
  if (!timingSafeEqual(createHash('sha256').update(expected).digest(), createHash('sha256').update(given).digest())) return res.status(401).json({ error: 'Chave de sensor inválida.' });
  const b = req.body;
  const device = await store.getDevice(text(b.device_id, 80));
  if (!device) return res.status(404).json({ error: 'Cadastre o dispositivo e vincule-o a um usuário antes de enviar leituras.' });
  const ranges = { umidade: [0, 100], temperatura: [-55, 125], ph: [0, 14], condutividade: [0, 1000] };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (b[key] != null && (typeof b[key] !== 'number' || !Number.isFinite(b[key]) || b[key] < min || b[key] > max)) return res.status(400).json({ error: `Valor inválido para ${key}.` });
  }
  if (b.umidade == null && b.temperatura == null) return res.status(400).json({ error: 'Envie pelo menos temperatura ou umidade.' });
  const date = b.read_at ? new Date(b.read_at) : new Date();
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 300000) return res.status(400).json({ error: 'Data de leitura inválida.' });
  // Temperatura e umidade não permitem diagnosticar a degradação do solo sozinhas.
  const level = ['SAUDAVEL', 'ATENCAO', 'CRITICO'].includes(b.nivel_degradacao) ? b.nivel_degradacao : null;
  const id = await store.createReading({ device_id: device.id, user_id: device.user_id, umidade: b.umidade ?? null, temperatura: b.temperatura ?? null, ph: b.ph ?? null, condutividade: b.condutividade ?? null, nivel_degradacao: level, recomendacao: text(b.recomendacao, 1000) || null, read_at: date.toISOString() });
  res.status(201).json({ ok: true, id });
}
app.post('/api/sensor/readings', receiveSensorData);
app.post('/functions/receiveSensorData', receiveSensorData);
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'JSON inválido.' });
  console.error('Falha interna na requisição:', req.method, req.path);
  res.status(500).json({ error: 'Não foi possível concluir agora. Tente novamente.' });
});
return app;
}
