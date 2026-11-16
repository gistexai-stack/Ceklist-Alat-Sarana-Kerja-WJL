import { api, CRON } from './lib/routes.ts';
import { fail } from './lib/util.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(fail('Permintaan tidak valid', 'BAD_REQUEST'), 405);
  let body: unknown;
  try {
    body = JSON.parse((await req.text()) || '[]');
    if (!Array.isArray(body) || typeof body[1] !== 'string') throw new Error('bad body');
  } catch {
    return json(fail('Permintaan tidak valid', 'BAD_REQUEST'));
  }
  const [token, action, args] = body as [string | null, string, Record<string, unknown>];
  if (token === 'CRON') {
    const secret = Deno.env.get('CRON_SECRET');
    if (!secret || req.headers.get('x-cron-secret') !== secret) return json(fail('Forbidden', 'FORBIDDEN'), 403);
    const fn = Object.hasOwn(CRON, action) ? CRON[action] : null;
    if (!fn) return json(fail('Aksi tidak dikenal', 'NOT_FOUND'));
    try {
      return json({ success: true, data: await fn(), message: '', code: 'OK' });
    } catch (e) {
      console.error('cron ' + action + ': ' + ((e as Error)?.stack || e));
      return json(fail('Terjadi kesalahan sistem.', 'ERROR'), 500);
    }
  }
  return json(await api(token || null, action, args || {}));
});
