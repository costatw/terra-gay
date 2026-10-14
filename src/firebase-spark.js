// Firebase Spark: chamadas diretas ao Authentication e Firestore, sem Functions.
let promise;
async function backend() {
  if (!promise) promise = (async () => {
    const response = await fetch('/firebase-config.json', { cache: 'no-store' });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      if (['localhost', '127.0.0.1'].includes(location.hostname)) return null;
      throw new Error('A configuração do Firebase ainda não foi publicada.');
    }
    const settings = await response.json();
    if (settings.mode !== 'firebase') return null;
    if (!settings.firebase?.apiKey || !settings.firebase?.projectId) throw new Error('Configuração Firebase incompleta.');
    const [appSDK, a, f] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const app = appSDK.initializeApp(settings.firebase), auth = a.getAuth(app), db = f.getFirestore(app);
    if (settings.emulators && ['localhost', '127.0.0.1'].includes(location.hostname)) {
      a.connectAuthEmulator(auth, settings.emulators.auth, { disableWarnings: true });
      f.connectFirestoreEmulator(db, settings.emulators.firestore.host, settings.emulators.firestore.port);
    }
    await auth.authStateReady();
    return { settings, auth, db, a, f };
  })();
  return promise;
}
export async function isSpark() { return Boolean(await backend()); }
function decode(v) {
  if (v?.toDate) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, value]) => [k, decode(value)]));
  return v;
}
const row = doc => ({ ...decode(doc.data()), id: doc.id });
function errorText(e) {
  const code = e.code || '';
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return 'E-mail ou senha incorretos.';
  if (code.includes('email-already-in-use')) return 'Esse e-mail já está cadastrado. Entre na sua conta.';
  if (code.includes('operation-not-allowed')) return 'Habilite o login por e-mail no console Firebase.';
  if (code.includes('permission-denied')) return 'Sua conta não tem permissão para essa operação. Confira assinatura e perfil.';
  if (code.includes('resource-exhausted')) return 'O limite gratuito foi atingido. Tente depois da renovação da cota.';
  if (code.includes('too-many-requests')) return 'Muitas tentativas. Aguarde alguns minutos.';
  if (/network-request-failed|unavailable/.test(code)) return 'Não foi possível conectar ao Firebase. Confira sua conexão.';
  if (/expired-action-code|invalid-action-code/.test(code)) return 'O link de recuperação expirou ou já foi usado.';
  return e.message || 'Não foi possível concluir. Tente novamente.';
}
async function profile(b, create = false) {
  const user = b.auth.currentUser;
  if (!user) throw new Error('Entre na sua conta para continuar.');
  const ref = b.f.doc(b.db, 'users', user.uid);
  let doc = await b.f.getDoc(ref);
  if (!doc.exists() && create) {
    await b.f.setDoc(ref, { full_name: user.displayName || 'Assinante', email: user.email, role: 'user', subscription_status: 'pending', created_at: b.f.serverTimestamp() });
    doc = await b.f.getDoc(ref);
  }
  if (!doc.exists()) throw new Error('Seu cadastro ainda não tem um perfil. Fale com a equipe.');
  return row(doc);
}
export async function watchAccount(callback) {
  const b = await backend();
  if (!b) return () => {};
  let stopProfile;
  const stop = b.a.onAuthStateChanged(b.auth, user => {
    stopProfile?.();
    if (!user) { callback(null); return; }
    stopProfile = b.f.onSnapshot(b.f.doc(b.db, 'users', user.uid), doc => { if (doc.exists()) callback(row(doc)); }, () => {});
  });
  return () => { stop(); stopProfile?.(); };
}
function readingsQuery(b, user) {
  const constraints = [b.f.where('read_at', '>=', b.f.Timestamp.fromDate(new Date(Date.now() - 30 * 86400000))), b.f.orderBy('read_at', 'desc'), b.f.limit(10000)];
  if (user.role !== 'admin') constraints.unshift(b.f.where('user_id', '==', user.id));
  return b.f.query(b.f.collection(b.db, 'readings'), ...constraints);
}
export async function watchReadings(callback, onError) {
  const b = await backend(), user = await profile(b);
  return b.f.onSnapshot(readingsQuery(b, user), s => callback(s.docs.map(row)), e => onError(errorText(e)));
}
export async function sparkRequest(path, options = {}) {
  const b = await backend();
  if (!b) return null;
  const data = options.body ? JSON.parse(options.body) : {};
  try {
    if (path === '/auth/register') {
      if (!data.full_name?.trim() || data.password?.length < 10) throw new Error('Informe seu nome e uma senha com pelo menos 10 caracteres.');
      const { user } = await b.a.createUserWithEmailAndPassword(b.auth, data.email, data.password);
      await b.a.updateProfile(user, { displayName: data.full_name.trim().slice(0, 100) });
      return { user: await profile(b, true) };
    }
    if (path === '/auth/login') { await b.a.signInWithEmailAndPassword(b.auth, data.email, data.password); return { user: await profile(b, true) }; }
    if (path === '/auth/me') return { user: await profile(b) };
    if (path === '/auth/logout') { await b.a.signOut(b.auth); return { ok: true }; }
    if (path === '/auth/forgot-password') { await b.a.sendPasswordResetEmail(b.auth, data.email); return { ok: true }; }
    if (path === '/auth/reset-password') { await b.a.confirmPasswordReset(b.auth, data.token, data.password); await b.a.signOut(b.auth); return { ok: true }; }
    if (path === '/config') return { emailRecovery: true, checkoutConfigured: Boolean(b.settings.checkoutUrl) };
    if (path === '/contact' || path === '/newsletter') {
      const newsletter = path === '/newsletter';
      if (!data.consent || !data.email || (!newsletter && (!data.name || !data.message))) throw new Error('Preencha os campos obrigatórios e autorize nosso contato.');
      const contact = { name: newsletter ? 'Assinante' : data.name, email: data.email, kind: newsletter ? 'newsletter' : 'contact', consent: true, created_at: b.f.serverTimestamp() };
      for (const key of ['phone', 'organization', 'profile', 'subject', 'preferred_channel', 'message']) contact[key] = data[key] || '';
      await b.f.addDoc(b.f.collection(b.db, 'contacts'), contact);
      return { ok: true };
    }
    const user = await profile(b);
    if (path === '/checkout') return { url: b.settings.checkoutUrl || 'https://wa.me/5511995094324?text=' + encodeURIComponent(`Olá! Quero assinar o plano Terra Nova Mater. Meu cadastro: ${user.email}`), manual: !b.settings.checkoutUrl };
    if (path.startsWith('/readings')) return { readings: (await b.f.getDocs(readingsQuery(b, user))).docs.map(row) };
    if (path === '/devices') {
      const collection = b.f.collection(b.db, 'devices');
      return { devices: (await b.f.getDocs(user.role === 'admin' ? collection : b.f.query(collection, b.f.where('user_id', '==', user.id)))).docs.map(row) };
    }
    if (path === '/admin/users') return { users: (await b.f.getDocs(b.f.query(b.f.collection(b.db, 'users'), b.f.orderBy('created_at', 'desc')))).docs.map(row) };
    if (path.startsWith('/admin/users/')) {
      const id = path.slice('/admin/users/'.length), batch = b.f.writeBatch(b.db);
      batch.update(b.f.doc(b.db, 'users', id), { subscription_status: data.subscription_status });
      batch.set(b.f.doc(b.f.collection(b.db, 'audit')), { actor_id: user.id, action: `subscription:${data.subscription_status}`, target_id: id, created_at: b.f.serverTimestamp() });
      await batch.commit();
      return { user: row(await b.f.getDoc(b.f.doc(b.db, 'users', id))) };
    }
    if (path === '/admin/contacts') return { contacts: (await b.f.getDocs(b.f.query(b.f.collection(b.db, 'contacts'), b.f.orderBy('created_at', 'desc'), b.f.limit(500)))).docs.map(row) };
    if (path === '/admin/devices') {
      if (!/^[\w-]{1,80}$/.test(data.id) || !data.name?.trim() || !data.sender_uid?.trim()) throw new Error('Informe identificação, nome e o UID da conta exclusiva do sensor.');
      const ref = b.f.doc(b.db, 'devices', data.id);
      if ((await b.f.getDoc(ref)).exists()) throw new Error('Esse sensor já está cadastrado.');
      await b.f.setDoc(ref, { name: data.name.trim(), user_id: data.user_id, sender_uid: data.sender_uid.trim(), enabled: true });
      return { ok: true };
    }
    throw new Error('Essa operação não está disponível.');
  } catch (e) { throw new Error(errorText(e)); }
}
