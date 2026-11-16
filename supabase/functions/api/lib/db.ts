import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

export const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Primary key per tabel (urutan stabil untuk paginasi).
export const PK: Record<string, string> = {
  master_asset: 'asset_id', master_checkpoint: 'checkpoint_id', master_person: 'person_id', master_account: 'account_id',
  schedule: 'schedule_id', checklist_header: 'checklist_id', checklist_detail: 'detail_id', repair_case: 'case_id',
  repair_item: 'case_item_id', repair_log: 'log_id', approval: 'approval_id', notification_log: 'notification_id',
  system_settings: 'setting_key', audit_log: 'audit_id', backup_log: 'backup_id', session: 'token', login_fail: 'username',
};

const PAGE = 1000;
// deno-lint-ignore no-explicit-any
export async function selectAll<T = Record<string, any>>(table: string, filter?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0;; from += PAGE) {
    let q = db.from(table).select('*');
    if (filter) q = filter(q);
    const { data, error } = await q.order(PK[table]).range(from, from + PAGE - 1);
    if (error) throw new Error(`selectAll ${table}: ${error.message}`);
    out.push(...(data as T[]));
    if (data.length < PAGE) return out;
  }
}
export async function insertRows(table: string, rows: object[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db.from(table).insert(rows);
  if (error) throw new Error(`insert ${table}: ${error.message}`);
}
export async function upsertRows(table: string, rows: object[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db.from(table).upsert(rows, { onConflict: PK[table] });
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
}
/** Mengembalikan jumlah baris yang berubah (0 = klaim kalah balapan). */
export async function updateWhere(table: string, patch: object, match: Record<string, string>): Promise<number> {
  const { data, error } = await db.from(table).update(patch).match(match).select(PK[table]);
  if (error) throw new Error(`update ${table}: ${error.message}`);
  return data.length;
}
