import { db, insertRows, selectAll } from './db.ts';
import { safeAudit } from './master.ts';
import { EDITABLE_SETTINGS, setSetting, settings } from './settings.ts';
import type { RouteFn } from './types.ts';
import { clean, err, fill, num, ts, uid } from './util.ts';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const mask = (t: string) => t ? '••••••••' + t.slice(-4) : '';
const token = async (): Promise<string> => {
  const { data, error } = await db.rpc('get_fonnte_token');
  if (error) throw new Error('get_fonnte_token: ' + error.message);
  return data || '';
};
export const appUrl = (): string => Deno.env.get('APP_URL') || '';

export async function fonnte(path: string, payload: Record<string, string> = {}): Promise<{ ok: boolean; text: string; json?: Row }> {
  const tok = await token();
  if (!tok) return { ok: false, text: 'Token Fonnte belum diatur' };
  try {
    const r = await fetch('https://api.fonnte.com/' + path, { method: 'POST', headers: { Authorization: tok }, body: new URLSearchParams(payload) });
    const text = (await r.text()).slice(0, 1000);
    let json: Row = {};
    try { json = JSON.parse(text); } catch { /* bukan JSON */ }
    return { ok: r.status === 200 && json.status === true, text, json };
  } catch (e) { return { ok: false, text: String(e).slice(0, 300) }; }
}

/** Kirim notifikasi idempotent per event_id. Tidak pernah melempar error ke transaksi pemanggil. */
export async function notify(type: string, eventId: string, vars: Record<string, string>, tplKey?: string): Promise<void> {
  try {
    const st = await settings();
    if (st['NOTIF_' + type] !== 'TRUE') return;
    if ((await selectAll('notification_log', (q) => q.eq('event_id', eventId))).length) return;
    const msg = fill(st[tplKey || ('TPL_' + type)], vars);
    const row = { notification_id: uid('NTF'), event_id: eventId, event_type: type, target_group: st.WA_GROUPS, payload_summary: msg.slice(0, 300).replace(/\n/g, ' | '),
      message: msg, status: 'PENDING', provider_response: '', attempt_count: '0', created_at: ts(), sent_at: '' };
    const { error } = await db.from('notification_log').insert(row);
    if (error) { if (error.code === '23505') return; throw new Error('insert notification_log: ' + error.message); } // 23505 = event sudah diproses
    await sendRow(row);
  } catch (e) { console.error('notify ' + eventId + ': ' + e); }
}

export async function sendRow(row: Row): Promise<boolean> {
  const res = row.target_group ? await fonnte('send', { target: row.target_group, message: row.message }) : { ok: false, text: 'Group ID belum diatur' };
  const cur = (await selectAll('notification_log', (q) => q.eq('notification_id', row.notification_id)))[0];
  if (cur) {
    const { error } = await db.from('notification_log').update({ status: res.ok ? 'SENT' : 'FAILED', provider_response: res.text,
      attempt_count: String(num(cur.attempt_count) + 1), ...(res.ok ? { sent_at: ts() } : {}) }).eq('notification_id', row.notification_id);
    if (error) throw new Error('sendRow: ' + error.message);
  }
  return res.ok;
}

const settingsView: RouteFn = async () => {
  const st = await settings();
  const ref = new URL(Deno.env.get('SUPABASE_URL')!).hostname.split('.')[0];
  return { values: Object.fromEntries(EDITABLE_SETTINGS.map((k) => [k, st[k]])), token_masked: mask(await token()),
    root_folder_url: 'https://supabase.com/dashboard/project/' + ref + '/storage/buckets', activated_at: st.ACTIVATED_AT, app_url: appUrl() };
};

const saveSettings: RouteFn = async (s, a) => {
  const st = await settings(), changed: Record<string, { from: string; to: string }> = {};
  for (const k of Object.keys(a.values || {})) {
    if (!EDITABLE_SETTINGS.includes(k)) continue;
    let v = String(a.values[k]);
    if (k.startsWith('NOTIF_')) v = v === 'TRUE' ? 'TRUE' : 'FALSE';
    if (k === 'NOK_FORMAT' && !['POINT', 'ASSET'].includes(v)) v = 'POINT';
    if (k === 'PHOTO_MAX_KB' && !(num(v) >= 200 && num(v) <= 20480)) throw err('Batas foto 200–20480 KB');
    if (k === 'BACKUP_RETENTION_DAYS' && !(num(v) >= 0 && num(v) <= 3650)) throw err('Retensi 0–3650 hari (0 = simpan selamanya)');
    if (st[k] !== v) { changed[k] = { from: st[k], to: v }; await setSetting(k, v, s!.name); }
  }
  if (Object.keys(changed).length) await safeAudit(s, 'UPDATE_SETTINGS', 'SYSTEM_SETTINGS', Object.keys(changed).join(','), null, changed);
  return true;
};

const saveFonnteToken: RouteFn = async (s, a) => {
  const t = String(a.token || '').trim();
  const { error } = await db.rpc('set_fonnte_token', { p_token: t });
  if (error) throw new Error('set_fonnte_token: ' + error.message);
  await safeAudit(s, t ? 'SET_FONNTE_TOKEN' : 'CLEAR_FONNTE_TOKEN', 'VAULT', 'FONNTE_TOKEN', null, null, 'Token tidak dicatat');
  return { token_masked: mask(t) };
};

const testFonnte: RouteFn = async (s) => {
  const dev = await fonnte('device');
  const groups = (await settings()).WA_GROUPS;
  let send: { ok: boolean; text: string } = { ok: false, text: 'Group ID belum diisi' };
  if (groups) {
    send = await fonnte('send', { target: groups, message: '*TES KONEKSI*\nGISTEX Monitoring Sarana Kerja\n' + ts().slice(0, 16) + ' WIB oleh ' + s!.name });
    await insertRows('notification_log', [{ notification_id: uid('NTF'), event_id: uid('TEST'), event_type: 'TEST', target_group: groups, payload_summary: 'Pesan tes',
      message: '', status: send.ok ? 'SENT' : 'FAILED', provider_response: send.text, attempt_count: '1', created_at: ts(), sent_at: send.ok ? ts() : '' }]);
  }
  return { device: dev.json || {}, device_ok: dev.ok, device_text: dev.text, send_ok: send.ok, send_text: send.text };
};

const notifLog: RouteFn = async () => {
  const { data, error } = await db.from('notification_log').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error('notifLog: ' + error.message);
  return data.map((r) => { const o = clean(r); delete o.message; return o; });
};

const retryNotif: RouteFn = async (_s, a) => {
  const rows = (await selectAll('notification_log', (q) => q.eq('status', 'FAILED'))).sort((a, b) => a.created_at.localeCompare(b.created_at)).filter((r) =>
    r.message && (a.notification_id ? r.notification_id === a.notification_id : num(r.attempt_count) < 5));
  const groups = (await settings()).WA_GROUPS;
  let ok = 0;
  for (const r of rows.slice(0, 30)) { if (!r.target_group) r.target_group = groups; if (await sendRow(r)) ok++; }
  return { tried: Math.min(rows.length, 30), sent: ok };
};

export const NOTIFY_ROUTES = { settings: settingsView, saveSettings, saveFonnteToken, testFonnte, notifLog, retryNotif };
