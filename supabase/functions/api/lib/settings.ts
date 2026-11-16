import { insertRows, selectAll, upsertRows } from './db.ts';
import type { Session } from './types.ts';
import { ts, uid } from './util.ts';

export const DEFAULTS: Record<string, string> = {
  WA_GROUPS: '',
  NOTIF_NOK: 'TRUE', NOTIF_SPV: 'TRUE', NOTIF_HEAD: 'TRUE', NOTIF_REJECT: 'TRUE', NOTIF_DONE: 'TRUE', NOTIF_REMINDER: 'TRUE',
  NOK_FORMAT: 'POINT', // POINT = 1 pesan per point NO OK; ASSET = rangkuman per alat
  TPL_NOK: '*TEMUAN BARU — NO OK*\nAlat: {alat}\nCheckpoint: {checkpoint}\nPemeriksa: {pic}\nWaktu: {waktu} WIB\nKasus: {kasus}\nDepartemen: {departemen}\nCatatan: {catatan}\nDetail: {link}',
  TPL_NOK_ASSET: '*TEMUAN BARU — NO OK*\nAlat: {alat}\nPemeriksa: {pic}\nWaktu: {waktu} WIB\nKasus: {kasus}\nPoint NO OK:\n{daftar}\nDetail: {link}',
  TPL_SPV: '*PERBAIKAN SELESAI — MENUNGGU APPROVAL SPV*\nKasus: {kasus}\nAlat: {alat}\nWaktu: {waktu} WIB\nDetail: {link}',
  TPL_HEAD: '*DISETUJUI SPV — MENUNGGU APPROVAL HEAD*\nKasus: {kasus}\nAlat: {alat}\nSPV: {approver}\nCatatan: {catatan}\nDetail: {link}',
  TPL_REJECT: '*APPROVAL DITOLAK — KEMBALI KE PERBAIKAN*\nKasus: {kasus}\nAlat: {alat}\nDitolak oleh: {approver} ({status})\nAlasan: {catatan}\nItem rework:\n{daftar}\nDetail: {link}',
  TPL_DONE: '*KASUS SELESAI*\nKasus: {kasus}\nAlat: {alat}\nDisetujui Head: {approver}\nWaktu: {waktu} WIB',
  TPL_REMINDER: '*PENGINGAT PERBAIKAN BELUM SELESAI*\nPer {waktu} WIB\n{daftar}\nDetail: {link}',
  PHOTO_MAX_KB: '5120',
  BACKUP_RETENTION_DAYS: '90',
  ACTIVATED_AT: '', LAST_GEN_DATE: '', GEN_DIRTY: '',
};

export const EDITABLE_SETTINGS = ['WA_GROUPS', 'NOTIF_NOK', 'NOTIF_SPV', 'NOTIF_HEAD', 'NOTIF_REJECT', 'NOTIF_DONE', 'NOTIF_REMINDER', 'NOK_FORMAT',
  'TPL_NOK', 'TPL_NOK_ASSET', 'TPL_SPV', 'TPL_HEAD', 'TPL_REJECT', 'TPL_DONE', 'TPL_REMINDER', 'PHOTO_MAX_KB', 'BACKUP_RETENTION_DAYS'];

export async function settings(): Promise<Record<string, string>> {
  const o = { ...DEFAULTS };
  for (const r of await selectAll<{ setting_key: string; setting_value: string }>('system_settings')) o[r.setting_key] = r.setting_value;
  return o;
}

export const setSetting = (key: string, value: string, by?: string): Promise<void> =>
  upsertRows('system_settings', [{ setting_key: key, setting_value: value, updated_at: ts(), updated_by: by || 'SYSTEM' }]);

export const audit = (s: Session | null, action: string, type: string, id: string, before?: unknown, after?: unknown, reason?: string): Promise<void> =>
  insertRows('audit_log', [{
    audit_id: uid('AUD'), actor_type: s ? s.type : 'SYSTEM', actor_id: s ? (s.account_id || s.person_id || '') : '',
    actor_name: s ? s.name : 'SYSTEM', action, entity_type: type, entity_id: id,
    before_json: before ? JSON.stringify(before).slice(0, 45000) : '', after_json: after ? JSON.stringify(after).slice(0, 45000) : '',
    reason: reason || '', created_at: ts(),
  }]);
