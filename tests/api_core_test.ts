import { assert, assertEquals } from 'jsr:@std/assert@1';
import { API_URL, call, seed } from './api_helpers.ts';

await seed();

Deno.test('publicInfo tanpa token', async () => {
  const r = await call(null, 'publicInfo');
  assertEquals(r.success, true);
  assertEquals(r.data.installed, true);
  assertEquals(r.data.persons.PIC.length, 2);
  assertEquals(r.data.persons.PIC[0].name, 'Agus'); // urut nama
  assertEquals(r.data.ready, { ok: true, unmapped: 0, total: 5 });
});

Deno.test('aksi tak dikenal', async () => {
  assertEquals((await call(null, 'nope')).code, 'NOT_FOUND');
});

Deno.test('body bukan JSON', async () => {
  const r = await (await fetch(API_URL, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'bukan json' })).json();
  assertEquals(r.code, 'BAD_REQUEST');
});

Deno.test('aksi butuh login tanpa token -> AUTH', async () => {
  assertEquals((await call(null, 'dashboard')).code, 'AUTH');
});

Deno.test('OPTIONS -> 204 + CORS', async () => {
  const r = await fetch(API_URL, { method: 'OPTIONS' });
  await r.body?.cancel();
  assertEquals(r.status, 204);
  assertEquals(r.headers.get('access-control-allow-origin'), '*');
});

Deno.test('cron dengan secret salah -> 403', async () => {
  const r = await fetch(API_URL, { method: 'POST', headers: { 'content-type': 'text/plain', 'x-cron-secret': 'salah' }, body: JSON.stringify(['CRON', 'x', {}]) });
  await r.body?.cancel();
  assert(r.status === 403);
});
