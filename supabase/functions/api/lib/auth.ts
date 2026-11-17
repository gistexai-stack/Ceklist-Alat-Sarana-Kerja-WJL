import { db, insertRows, selectAll, upsertRows } from './db.ts';
import { audit } from './settings.ts';
import type { RouteFn, Session } from './types.ts';
import { err, GUEST, SESSION_TTL, ts } from './util.ts';

/** Sama dengan hash_() di Code.gs: 300x SHA-256 base64 atas salt+h+salt. */
export async function hash(pw: string, salt: string): Promise<string> {
  let h = String(pw);
  for (let i = 0; i < 300; i++) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + h + salt));
    h = btoa(String.fromCharCode(...new Uint8Array(d)));
  }
  return h;
}

export async function newSession(data: Session): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const now = new Date();
  await db.from('session').delete().lt('expires_at', now.toISOString()); // bersih-bersih sesi kedaluwarsa
  await insertRows('session', [{ token, data, expires_at: new Date(now.getTime() + SESSION_TTL * 1000).toISOString() }]);
  return token;
}

export async function sess(token: string): Promise<Session | null> {
  if (!token) return null;
  const { data, error } = await db.from('session').select('data, expires_at').eq('token', token).maybeSingle();
  if (error) throw new Error('sess: ' + error.message);
  return data && new Date(data.expires_at) > new Date() ? data.data as Session : null;
}

export async function validSess(s: Session): Promise<boolean> {
  if (s.type === 'ACCOUNT') {
    const [a] = await selectAll<{ active: string; role: string }>('master_account', (q) => q.eq('account_id', s.account_id));
    return !!(a && a.active === 'TRUE' && a.role === s.role);
  }
  const [p] = await selectAll<{ active: string; role_type: string }>('master_person', (q) => q.eq('person_id', s.person_id));
  return !!(p && p.active === 'TRUE' && p.role_type === s.role);
}

export const resolve = async (token: string): Promise<Session | null> => {
  const s = await sess(token);
  return s && await validSess(s) ? s : null;
};

const LOCK_MS = 600_000;
const login: RouteFn = async (_s, a) => {
  const username = String(a.username || '').trim().toLowerCase();
  const { data: lf } = await db.from('login_fail').select('fails, until').eq('username', username).maybeSingle();
  const fails = lf && new Date(lf.until) > new Date() ? lf.fails as number : 0;
  if (fails >= 5) throw err('Terlalu banyak percobaan gagal. Coba lagi 10 menit lagi.', 'LOCKED');
  const [acc] = await selectAll('master_account', (q) => q.eq('username', username));
  if (!acc || acc.active !== 'TRUE' || await hash(a.password || '', acc.salt) !== acc.password_hash) {
    await upsertRows('login_fail', [{ username, fails: fails + 1, until: new Date(Date.now() + LOCK_MS).toISOString() }]);
    throw err('Username atau password salah', 'AUTH_FAIL');
  }
  await db.from('login_fail').delete().eq('username', username);
  const me: Session = { type: 'ACCOUNT', role: acc.role, name: acc.display_name, account_id: acc.account_id, username: acc.username };
  await db.from('master_account').update({ last_login_at: ts() }).eq('account_id', acc.account_id);
  return { token: await newSession(me), me };
};

const guestLogin: RouteFn = async (_s, a) => {
  if (!GUEST.includes(a.role)) throw err('Role tamu tidak valid');
  const [p] = await selectAll('master_person', (q) => q.eq('person_id', String(a.person_id)));
  if (!p || p.active !== 'TRUE' || p.role_type !== a.role) throw err('Nama tidak terdaftar/aktif untuk role ini');
  const me: Session = { type: 'GUEST', role: a.role, name: p.display_name, person_id: p.person_id };
  return { token: await newSession(me), me };
};

const logout: RouteFn = async (_s, _a, token) => {
  await db.from('session').delete().eq('token', token);
  return true;
};

const changePassword: RouteFn = async (s, a) => {
  if (String(a.newPassword || '').length < 6) throw err('Password baru minimal 6 karakter');
  const [acc] = await selectAll('master_account', (q) => q.eq('account_id', s!.account_id));
  if (await hash(a.oldPassword || '', acc.salt) !== acc.password_hash) throw err('Password lama salah');
  const salt = crypto.randomUUID();
  await upsertRows('master_account', [{ ...acc, salt, password_hash: await hash(a.newPassword, salt), updated_at: ts() }]);
  try { await audit(s, 'CHANGE_PASSWORD', 'ACCOUNT', acc.account_id, null, null, 'Ganti password sendiri'); } catch (e) { console.error('audit CHANGE_PASSWORD: ' + e); }
  return true;
};

export const AUTH_ROUTES = { login, guestLogin, logout, changePassword };
