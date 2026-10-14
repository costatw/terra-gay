import { createHash } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const hash = input => createHash('sha256').update(input).digest('hex');
const unpack = document => document.exists ? { ...document.data(), id: document.id } : undefined;
const now = () => new Date().toISOString();
export function firestoreStore({ projectId, databaseId = '(default)' } = {}) {
  const adminApp = getApps()[0] || initializeApp(projectId ? { projectId } : undefined);
  const db = getFirestore(adminApp, databaseId);
  const users = db.collection('users');
  const sessions = db.collection('sessions');
  const resets = db.collection('password_resets');
  const devices = db.collection('devices');
  const readings = db.collection('readings');
  const contacts = db.collection('contacts');
  const audit = db.collection('audit');
  return {
    kind: 'firestore',
    async health() { await db.collection('_health').doc('readiness').get(); },
    async getUser(id) { return typeof id === 'string' && /^[a-f0-9]{64}$/.test(id) ? unpack(await users.doc(id).get()) : undefined; },
    async getUserByEmail(email) { return unpack(await users.doc(hash(email)).get()); },
    async createUser(data) {
      const id = hash(data.email);
      const user = { ...data, role: data.role || 'user', subscription_status: data.subscription_status || 'pending', created_at: now() };
      try { await users.doc(id).create(user); return { ...user, id }; } catch (e) { if (e.code === 6) return null; throw e; }
    },
    async createSession(token, user) {
      await sessions.doc(token).create({ user_id: user.id, password_stamp: hash(user.password_hash), expires_at: Date.now() + 7 * 86400000, cleanup_at: new Date(Date.now() + 7 * 86400000) });
    },
    async sessionUser(token) {
      const session = (await sessions.doc(token).get()).data();
      if (!session || session.expires_at <= Date.now()) return undefined;
      const user = unpack(await users.doc(session.user_id).get());
      return user && hash(user.password_hash) === session.password_stamp ? user : undefined;
    },
    async deleteSession(token) { await sessions.doc(token).delete(); },
    async createReset(token, user) {
      await db.runTransaction(async tx => {
        const ref = users.doc(user.id);
        const current = unpack(await tx.get(ref));
        tx.set(resets.doc(token), { user_id: user.id, expires_at: Date.now() + 3600000, cleanup_at: new Date(Date.now() + 3600000), password_stamp: hash(current.password_hash) });
        tx.update(ref, { reset_version: token });
      });
    },
    async deleteReset(token) { await resets.doc(token).delete(); },
    async consumeReset(token, passwordHash) {
      return db.runTransaction(async tx => {
        const resetRef = resets.doc(token);
        const reset = (await tx.get(resetRef)).data();
        if (!reset || reset.expires_at <= Date.now()) return false;
        const userRef = users.doc(reset.user_id);
        const user = (await tx.get(userRef)).data();
        if (!user || user.reset_version !== token || hash(user.password_hash) !== reset.password_stamp) return false;
        tx.update(userRef, { password_hash: passwordHash, reset_version: null });
        tx.delete(resetRef);
        return true;
      });
    },
    async createContact(data) {
      const ref = data.kind === 'newsletter' ? contacts.doc(`newsletter_${hash(data.email)}`) : contacts.doc();
      try { await ref.create({ ...data, created_at: now() }); } catch (e) { if (data.kind === 'newsletter' && e.code === 6) return; throw e; }
    },
    async listReadings(user, since, after) {
      if (after) {
        let query = readings.where('created_at', '>=', after);
        if (user.role !== 'admin') query = query.where('user_id', '==', user.id);
        return (await query.orderBy('created_at', 'asc').limit(10000).get()).docs.map(unpack).filter(r => r.read_at >= since);
      }
      let query = readings.where('read_at', '>=', since);
      if (user.role !== 'admin') query = query.where('user_id', '==', user.id);
      return (await query.orderBy('read_at', 'desc').limit(10000).get()).docs.map(unpack);
    },
    async listDevices(user) { return (await (user.role === 'admin' ? devices : devices.where('user_id', '==', user.id)).get()).docs.map(unpack); },
    async listUsers() { return (await users.orderBy('created_at', 'desc').get()).docs.map(unpack); },
    async setSubscription(id, status, actor) {
      const batch = db.batch();
      batch.update(users.doc(String(id)), { subscription_status: status });
      batch.create(audit.doc(), { actor_id: actor, action: `subscription:${status}`, target_id: id, created_at: now() });
      await batch.commit();
    },
    async listContacts() { return (await contacts.orderBy('created_at', 'desc').limit(500).get()).docs.map(unpack); },
    async getDevice(id) { return /^[\w-]{1,80}$/.test(id) ? unpack(await devices.doc(id).get()) : undefined; },
    async createDevice(data, actor) {
      return db.runTransaction(async tx => {
        const ref = devices.doc(data.id);
        if ((await tx.get(ref)).exists) return false;
        tx.create(ref, { name: data.name, user_id: data.user_id });
        tx.create(audit.doc(), { actor_id: actor, action: `device:create:${data.id}`, target_id: data.user_id, created_at: now() });
        return true;
      });
    },
    async createReading(data) {
      const ref = readings.doc();
      await ref.create({ ...data, created_at: now() });
      return ref.id;
    },
    async checkRateLimit(key) {
      const ref = db.collection('_limits').doc(hash(key));
      const window = 15 * 60000;
      return db.runTransaction(async tx => {
        const data = (await tx.get(ref)).data();
        const fresh = !data || data.expires_at <= Date.now();
        const count = fresh ? 0 : data.count;
        if (count >= 30) return false;
        const expires = fresh ? Date.now() + window : data.expires_at;
        tx.set(ref, { count: count + 1, expires_at: expires, cleanup_at: new Date(expires) });
        return true;
      });
    },
    async close() { await db.terminate(); }
  };
}
