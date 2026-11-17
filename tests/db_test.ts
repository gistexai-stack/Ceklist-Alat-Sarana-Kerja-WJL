import { createClient } from 'npm:@supabase/supabase-js@2';
import { assert, assertEquals } from 'jsr:@std/assert@1';

import { assertDestructiveAllowed } from './guard.ts';

assertDestructiveAllowed(); // tes ini menulis ke DB (termasuk token Fonnte)

const url = Deno.env.get('SUPABASE_URL')!;
const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!);

Deno.test('anon tidak bisa membaca master_account', async () => {
  const id = 'T1-ACC-' + crypto.randomUUID();
  const anonId = 'T1-ACC-' + crypto.randomUUID();
  const ins = await svc.from('master_account').insert({ account_id: id, username: id });
  assertEquals(ins.error, null);
  try {
    // denied (42501) or empty result; any other error (network/auth) fails
    const sel = await anon.from('master_account').select('*');
    if (sel.error) assertEquals(sel.error.code, '42501');
    else assertEquals(sel.data, []);

    const i = await anon.from('master_account').insert({ account_id: anonId, username: anonId });
    assertEquals(i.error?.code, '42501');

    const u = await anon.from('master_account').update({ username: 'hacked' }).eq('account_id', id);
    assertEquals(u.error?.code, '42501');

    const { data, error } = await svc.from('master_account').select('account_id,username').in('account_id', [id, anonId]);
    assertEquals(error, null);
    assertEquals(data, [{ account_id: id, username: id }]);
  } finally {
    await svc.from('master_account').delete().in('account_id', [id, anonId]);
  }
});

Deno.test('service role bisa insert & baca schedule', async () => {
  const id = 'T1-SCH-' + crypto.randomUUID();
  try {
    const ins = await svc.from('schedule').insert({ schedule_id: id, asset_id: 'A1' });
    assertEquals(ins.error, null);
    const { data, error } = await svc.from('schedule').select('*').eq('schedule_id', id);
    assertEquals(error, null);
    assertEquals(data?.[0].asset_id, 'A1');
  } finally {
    await svc.from('schedule').delete().eq('schedule_id', id);
  }
});

Deno.test('unique kasus terbuka per alat', async () => {
  const a = 'T1-C-' + crypto.randomUUID(), b = 'T1-C-' + crypto.randomUUID();
  const asset = 'T1-AST-' + crypto.randomUUID();
  try {
    const r1 = await svc.from('repair_case').insert({ case_id: a, asset_id: asset, status: 'PERLU_PERBAIKAN' });
    assertEquals(r1.error, null);
    const r2 = await svc.from('repair_case').insert({ case_id: b, asset_id: asset, status: 'PERLU_PERBAIKAN' });
    assertEquals(r2.error?.code, '23505');
  } finally {
    await svc.from('repair_case').delete().in('case_id', [a, b]);
  }
});

Deno.test('fonnte token via vault', async () => {
  const orig = await svc.rpc('get_fonnte_token');
  assertEquals(orig.error, null);
  try {
    const s = await svc.rpc('set_fonnte_token', { p_token: 'abc' });
    assertEquals(s.error, null);
    const g = await svc.rpc('get_fonnte_token');
    assertEquals(g.data, 'abc');
    const a = await anon.rpc('get_fonnte_token');
    assert(a.error);
  } finally {
    await svc.rpc('set_fonnte_token', { p_token: orig.data ?? '' });
  }
});
