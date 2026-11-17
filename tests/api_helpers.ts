import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { assertDestructiveAllowed } from './guard.ts';

export { assertDestructiveAllowed };

export type ApiResult = { success: boolean; data: any; message: string; code: string };

export const API_URL = Deno.env.get('API_URL')!;
export const svc = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function call(token: string | null, action: string, args: object = {}): Promise<ApiResult> {
  const r = await fetch(API_URL, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify([token, action, args]) });
  return await r.json();
}

// tabel -> primary key (sama dengan lib/db.ts PK)
const PK: Record<string, string> = {
  master_asset: 'asset_id', master_checkpoint: 'checkpoint_id', master_person: 'person_id', master_account: 'account_id',
  schedule: 'schedule_id', checklist_header: 'checklist_id', checklist_detail: 'detail_id', repair_case: 'case_id',
  repair_item: 'case_item_id', repair_log: 'log_id', approval: 'approval_id', notification_log: 'notification_id',
  system_settings: 'setting_key', audit_log: 'audit_id', backup_log: 'backup_id', session: 'token', login_fail: 'username',
};

export type Fixture = Record<string, Record<string, string>[]>;

/** Hapus SEMUA baris semua tabel lalu insert fixture. Menolak jalan bila ada MIGRATED_AT (data produksi). */
export async function seed(fixture: Fixture = BASE_FIXTURE): Promise<void> {
  assertDestructiveAllowed();
  const g = await svc.from('system_settings').select('setting_key').eq('setting_key', 'MIGRATED_AT');
  if (g.error) throw new Error('guard: ' + g.error.message);
  if (g.data.length) throw new Error('seed() ditolak: MIGRATED_AT ada di system_settings (data produksi)');
  for (const [t, pk] of Object.entries(PK)) {
    const { error } = await svc.from(t).delete().neq(pk, '\u0001__none__');
    if (error) throw new Error(`wipe ${t}: ${error.message}`);
  }
  for (const [t, rows] of Object.entries(fixture)) {
    if (!rows.length) continue;
    const { error } = await svc.from(t).insert(rows);
    if (error) throw new Error(`seed ${t}: ${error.message}`);
  }
}

export const SALT = '0b7e5c1a-1111-4222-8333-944455556666';
export const PASSWORD = 'rahasia123';
/** Sama dengan hash_() di Code.gs: 300x SHA-256 base64 atas salt+h+salt. */
export async function hashPw(pw: string, salt: string): Promise<string> {
  let h = pw;
  for (let i = 0; i < 300; i++) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + h + salt));
    h = btoa(String.fromCharCode(...new Uint8Array(d)));
  }
  return h;
}

const now = '2026-11-16 08:00:00';
const T = 'TRUE';
const hash = await hashPw(PASSWORD, SALT);
const acct = (n: string, role: string) => ({ account_id: 'ACC-' + n.toUpperCase(), username: n, display_name: n, role, password_hash: hash, salt: SALT, active: T, created_at: now, updated_at: now });
const cp = (id: string, asset: string, order: string, dept: string) => ({ checkpoint_id: id, asset_id: asset, point_name: 'Point ' + id, display_order: order, target_label: '', repair_department: dept, active: T, created_at: now, updated_at: now });
const person = (id: string, name: string, role: string) => ({ person_id: id, display_name: name, role_type: role, active: T, created_at: now, updated_at: now });

export const BASE_FIXTURE: Fixture = {
  master_asset: [
    { asset_id: 'AST-DAILY', source_no: '1', asset_name: 'Alat Harian', active: T, schedule_type: 'DAILY', pic_group: '', checker_role: 'PIC', pic_ids: 'PRS-PIC1', activated_at: '', created_at: now, updated_at: now },
    { asset_id: 'AST-SHIFT', source_no: '2', asset_name: 'Alat Shift', active: T, schedule_type: 'SHIFT', pic_group: 'RODA DOFFING', checker_role: 'UTILITY', pic_ids: '', activated_at: '', created_at: now, updated_at: now },
  ],
  master_checkpoint: [
    cp('CP-1', 'AST-DAILY', '1', 'MAINTENANCE'), cp('CP-2', 'AST-DAILY', '2', 'UTILITY'), cp('CP-3', 'AST-DAILY', '3', 'MAINTENANCE'),
    cp('CP-4', 'AST-SHIFT', '1', 'UTILITY'), cp('CP-5', 'AST-SHIFT', '2', 'MAINTENANCE'),
  ],
  master_person: [
    person('PRS-PIC1', 'Budi', 'PIC'), person('PRS-PIC2', 'Agus', 'PIC'),
    person('PRS-MNT1', 'Maman', 'MAINTENANCE'), person('PRS-UTL1', 'Udin', 'UTILITY'),
  ],
  master_account: [acct('admin', 'ADMIN'), acct('spv', 'SPV'), acct('head', 'HEAD')],
};
