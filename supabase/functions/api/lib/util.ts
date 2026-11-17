import type { ApiResult } from './types.ts';

export const SESSION_TTL = 21600; // detik (6 jam)
export const DEPTS = ['PIC', 'MAINTENANCE', 'UTILITY'];
export const LOGGED = ['ADMIN', 'SPV', 'HEAD'];
export const GUEST = ['PIC', 'MAINTENANCE', 'UTILITY'];
export const ALL = LOGGED.concat(GUEST);
export const SHIFTS: Record<string, [number, number]> = { '1': [0, 8], '2': [8, 16], '3': [16, 24] }; // jam sejak 07.00 hari operasional
export const CASE_OPEN = ['PERLU_PERBAIKAN', 'SEDANG_DIPERBAIKI', 'MENUNGGU_SPV', 'MENUNGGU_HEAD'];

// Asia/Jakarta = UTC+7 tetap, tanpa DST: cukup aritmatika offset.
const OFF = 7 * 3600e3;
const wib = (d: Date) => new Date(d.getTime() + OFF).toISOString(); // 'YYYY-MM-DDTHH:mm:ss.sssZ' berisi jam WIB

export const ts = (d: Date = new Date()): string => wib(d).slice(0, 19).replace('T', ' ');
export const pts = (s: string): Date | null => s ? new Date(String(s).replace(' ', 'T') + '+07:00') : null;
export const opDate = (d: Date): string => wib(new Date(d.getTime() - OFF)).slice(0, 10);
export const addDays = (day: string, n: number): string => wib(new Date(pts(day + ' 12:00:00')!.getTime() + n * 864e5)).slice(0, 10);
export function shiftOf(d: Date): '1' | '2' | '3' {
  const h = new Date(d.getTime() + OFF).getUTCHours();
  return h >= 7 && h < 15 ? '1' : (h >= 15 && h < 23 ? '2' : '3');
}
export const hoursBetween = (a: string, b: string): number | '' =>
  a && b ? Math.round((pts(b)!.getTime() - pts(a)!.getTime()) / 36e5 * 10) / 10 : '';
export const pad = (n: number, w: number): string => String(n).padStart(w, '0');
export const uid = (p: string): string => p + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase();
export const ids = (s: string): string[] => String(s || '').split(',').map((x) => x.trim()).filter(String);
export const num = (v: unknown): number => Number(v || 0);
// deno-lint-ignore no-explicit-any
export const clean = (o: Record<string, any>): Record<string, any> => {
  const r = { ...o };
  delete r.password_hash;
  delete r.salt;
  return r;
};
export const fill = (tpl: string, vars: Record<string, string>): string =>
  String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => vars[k] !== undefined && vars[k] !== '' ? vars[k] : '-');

export class UserError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}
/** Kegagalan pasti (galat bisnis / galat Postgres bercode): transaksi dijamin tidak commit. Kegagalan transport = tidak pasti. */
export const isDefiniteFailure = (e: unknown): boolean => e instanceof UserError || !!(e as { pgCode?: string })?.pgCode;
export const err = (message: string, code = 'VALIDATION'): UserError => new UserError(message, code);
export const fail = (message: string, code: string): ApiResult => ({ success: false, data: null, message, code });
