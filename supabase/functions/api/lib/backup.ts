import * as XLSX from 'npm:xlsx@0.18.5';
import { db, insertRows, PK, selectAll, updateWhere } from './db.ts';
import { audit, settings } from './settings.ts';
import type { RouteFn, Session } from './types.ts';
import { clean, err, num, ts, uid } from './util.ts';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DAY = 86400;

/** Satu sheet per tabel aplikasi (tanpa session/login_fail); password_hash/salt ikut agar bisa dipulihkan. */
async function buildWorkbook(): Promise<Uint8Array> {
  const wb = XLSX.utils.book_new();
  for (const t of Object.keys(PK).filter((k) => k !== 'session' && k !== 'login_fail')) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(await selectAll(t)), t);
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
}

const signed = async (path: string): Promise<string> => {
  const { data, error } = await db.storage.from('backups').createSignedUrl(path, DAY);
  if (error) throw new Error('signed url: ' + error.message);
  return data.signedUrl;
};

export async function backup(type: 'AUTO' | 'MANUAL', s: Session | null): Promise<{ file_name: string; url: string }> {
  const d = new Date(), w = ts(d); // WIB: yyyy-MM-dd HH:mm:ss
  const name = `DB_BACKUP_${w.slice(0, 10)}_${w.slice(11, 13)}${w.slice(14, 16)}_${type}.xlsx`;
  const path = `${w.slice(0, 4)}/${w.slice(5, 7)}/${name}`;
  const row = { backup_id: uid('BKP'), type, created_at: w, file_id: '', file_name: name, size_bytes: '', status: 'OK', message: '', trashed_at: '' };
  try {
    const bytes = await buildWorkbook();
    const { error } = await db.storage.from('backups').upload(path, bytes, { contentType: XLSX_TYPE, upsert: true });
    if (error) throw new Error(error.message);
    row.file_id = path; row.size_bytes = String(bytes.length);
  } catch (e) { row.status = 'FAILED'; row.message = String(e).slice(0, 300); }
  await insertRows('backup_log', [row]);
  const days = num((await settings()).BACKUP_RETENTION_DAYS);
  if (days > 0) {
    const cut = ts(new Date(d.getTime() - days * 864e5));
    for (const r of await selectAll('backup_log', (q) => q.eq('status', 'OK').eq('trashed_at', '').neq('file_id', '').lt('created_at', cut))) {
      const { error } = await db.storage.from('backups').remove([r.file_id]);
      await updateWhere('backup_log', error ? { message: 'Gagal hapus: ' + error.message } : { trashed_at: ts() }, { backup_id: r.backup_id });
    }
  }
  if (s) try { await audit(s, 'BACKUP_MANUAL', 'BACKUP', row.backup_id, null, { file: name, status: row.status }, row.message); } catch (e) { console.error(e); }
  if (row.status !== 'OK') throw err('Backup gagal: ' + row.message);
  return { file_name: name, url: await signed(path) };
}

const backupNow: RouteFn = (s) => backup('MANUAL', s);

const backupLog: RouteFn = async () => {
  const { data, error } = await db.from('backup_log').select('*').order('created_at', { ascending: false }).limit(100);
  if (error) throw new Error('backupLog: ' + error.message);
  return await Promise.all(data.map(async (r) => {
    const o = clean(r);
    if (r.status === 'OK' && !r.trashed_at && r.file_id) o.url = await signed(r.file_id);
    return o;
  }));
};

export const BACKUP_ROUTES = { backupNow, backupLog };
