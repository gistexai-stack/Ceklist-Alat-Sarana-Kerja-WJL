import { db } from './db.ts';
import { settings } from './settings.ts';
import type { RouteFn } from './types.ts';
import { err, num, uid } from './util.ts';

/** Simpan foto ke bucket privat `photos`; path = id (>= 20 karakter). `url` selalu '' (akses lewat signed URL). */
export async function savePhoto(dataUrl: string, _asset: unknown, _name: string): Promise<{ id: string; url: string }> {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) throw err('Format foto tidak valid (JPG/PNG/WEBP)', 'PHOTO_INVALID');
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0)); } catch { throw err('Format foto tidak valid (JPG/PNG/WEBP)', 'PHOTO_INVALID'); }
  const maxKb = num((await settings()).PHOTO_MAX_KB) || 5120;
  if (bytes.length > maxKb * 1024) throw err('Ukuran foto melebihi batas ' + maxKb + ' KB', 'PHOTO_TOO_BIG');
  const id = uid('PH') + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const { error } = await db.storage.from('photos').upload(id, bytes, { contentType: m[1] });
  if (error) throw new Error('upload foto: ' + error.message);
  return { id, url: '' };
}

export async function trashPhotos(ids: string[]): Promise<void> {
  if (ids.length) await db.storage.from('photos').remove(ids).catch(() => {});
}

export async function photoSignedUrl(id: string, seconds: number): Promise<string> {
  const { data, error } = await db.storage.from('photos').createSignedUrl(id, seconds);
  if (error || !data) throw err('Foto tidak dikenal', 'FORBIDDEN');
  return data.signedUrl;
}

export const photo: RouteFn = (_s, a) => {
  if (!/^[-\w]{20,}$/.test(String(a.id || ''))) throw err('ID foto tidak valid');
  return photoSignedUrl(a.id, 3600);
};
