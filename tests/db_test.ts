import { createClient } from 'npm:@supabase/supabase-js@2';
import { assert, assertEquals } from 'jsr:@std/assert@1';

const url = Deno.env.get('SUPABASE_URL')!;
const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!);

Deno.test('anon tidak bisa membaca master_account', async () => {
  const id = 'T1-ACC-' + crypto.randomUUID();
  const ins = await svc.from('master_account').insert({ account_id: id, username: id });
  assertEquals(ins.error, null);
  try {
    const { data } = await anon.from('master_account').select('*');
    assertEquals(data?.length ?? 0, 0);
  } finally {
    await svc.from('master_account').delete().eq('account_id', id);
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
  try {
    const s = await svc.rpc('set_fonnte_token', { p_token: 'abc' });
    assertEquals(s.error, null);
    const g = await svc.rpc('get_fonnte_token');
    assertEquals(g.data, 'abc');
    const a = await anon.rpc('get_fonnte_token');
    assert(a.error);
  } finally {
    await svc.rpc('set_fonnte_token', { p_token: '' });
  }
});
