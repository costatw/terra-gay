import { db } from './db.js';

// A mesma API atende o SQLite local e o armazenamento persistente no Firebase.
export function sqliteStore() {
  return {
    kind: 'sqlite',
    async health() { db.prepare('SELECT 1').get(); },
    async getUser(id) { return db.prepare('SELECT * FROM users WHERE id=?').get(id); },
    async getUserByEmail(email) { return db.prepare('SELECT * FROM users WHERE email=?').get(email); },
    async createUser(data) {
      try {
        const r = db.prepare('INSERT INTO users(full_name,email,password_hash,role,subscription_status) VALUES (?,?,?,?,?)')
          .run(data.full_name, data.email, data.password_hash, data.role || 'user', data.subscription_status || 'pending');
        return db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
      } catch (e) { if (e.code?.includes('SQLITE_CONSTRAINT') || e.errcode === 2067) return null; throw e; }
    },
    async createSession(token, user) {
      db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(token, user.id, Date.now() + 7 * 86400000);
    },
    async sessionUser(token) { return db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token=? AND sessions.expires_at>?').get(token, Date.now()); },
    async deleteSession(token) { db.prepare('DELETE FROM sessions WHERE token=?').run(token); },
    async createReset(token, user) {
      db.prepare('DELETE FROM password_resets WHERE user_id=? OR expires_at<?').run(user.id, Date.now());
      db.prepare('INSERT INTO password_resets VALUES (?,?,?)').run(token, user.id, Date.now() + 3600000);
    },
    async deleteReset(token) { db.prepare('DELETE FROM password_resets WHERE token=?').run(token); },
    async consumeReset(token, passwordHash) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const reset = db.prepare('SELECT * FROM password_resets WHERE token=? AND expires_at>?').get(token, Date.now());
        if (!reset) { db.exec('ROLLBACK'); return false; }
        db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(passwordHash, reset.user_id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(reset.user_id);
        db.prepare('DELETE FROM password_resets WHERE user_id=?').run(reset.user_id);
        db.exec('COMMIT'); return true;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async createContact(data) {
      if (data.kind === 'newsletter' && db.prepare("SELECT id FROM contacts WHERE email=? AND kind='newsletter'").get(data.email)) return;
      db.prepare('INSERT INTO contacts(name,email,phone,organization,profile,subject,preferred_channel,message,kind) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(data.name, data.email, data.phone || '', data.organization || '', data.profile || '', data.subject || '', data.preferred_channel || '', data.message || '', data.kind);
    },
    async listReadings(user, since, after) {
      if (after) return user.role === 'admin'
        ? db.prepare('SELECT * FROM readings WHERE read_at>=? AND created_at>=? ORDER BY created_at ASC LIMIT 10000').all(since, after)
        : db.prepare('SELECT * FROM readings WHERE user_id=? AND read_at>=? AND created_at>=? ORDER BY created_at ASC LIMIT 10000').all(user.id, since, after);
      return user.role === 'admin'
        ? db.prepare('SELECT * FROM readings WHERE read_at>=? ORDER BY read_at DESC LIMIT 10000').all(since)
        : db.prepare('SELECT * FROM readings WHERE user_id=? AND read_at>=? ORDER BY read_at DESC LIMIT 10000').all(user.id, since);
    },
    async listDevices(user) { return user.role === 'admin' ? db.prepare('SELECT * FROM devices').all() : db.prepare('SELECT * FROM devices WHERE user_id=?').all(user.id); },
    async listUsers() { return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all(); },
    async setSubscription(id, status, actor) {
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE users SET subscription_status=? WHERE id=?').run(status, id);
        db.prepare('INSERT INTO audit(actor_id,action,target_id) VALUES (?,?,?)').run(actor, `subscription:${status}`, id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async listContacts() { return db.prepare('SELECT * FROM contacts ORDER BY created_at DESC LIMIT 500').all(); },
    async getDevice(id) { return db.prepare('SELECT * FROM devices WHERE id=?').get(id); },
    async createDevice(data, actor) {
      db.exec('BEGIN IMMEDIATE');
      try {
        if (db.prepare('SELECT id FROM devices WHERE id=?').get(data.id)) { db.exec('ROLLBACK'); return false; }
        db.prepare('INSERT INTO devices VALUES (?,?,?)').run(data.id, data.name, Number(data.user_id));
        db.prepare('INSERT INTO audit(actor_id,action,target_id) VALUES (?,?,?)').run(actor, `device:create:${data.id}`, Number(data.user_id));
        db.exec('COMMIT'); return true;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async createReading(data) {
      const r = db.prepare('INSERT INTO readings(device_id,user_id,umidade,temperatura,ph,condutividade,nivel_degradacao,recomendacao,read_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .run(data.device_id, data.user_id, data.umidade, data.temperatura, data.ph, data.condutividade, data.nivel_degradacao, data.recomendacao, data.read_at);
      return Number(r.lastInsertRowid);
    },
    async close() { db.close(); }
  };
}
