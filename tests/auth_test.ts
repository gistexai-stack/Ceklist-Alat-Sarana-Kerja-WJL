import { assert, assertEquals } from 'jsr:@std/assert@1';
import { call, PASSWORD, seed, svc } from './api_helpers.ts';

const step = async (name: string, fn: () => Promise<void>) => { await seed(); await fn(); void name; };
const login = (u: string, p = PASSWORD) => call(null, 'login', { username: u, password: p });
const tokenOf = async (u: string) => (await login(u)).data.token as string;

Deno.test('login sukses', async () => {
  await step('', async () => {
    const r = await login('admin');
    assertEquals(r.success, true);
    assertEquals(r.data.me.role, 'ADMIN');
    assertEquals(r.data.token.length, 72);
    const { data } = await svc.from('master_account').select('last_login_at').eq('username', 'admin').single();
    assert(data!.last_login_at);
  });
});

Deno.test('password salah AUTH_FAIL; 5x salah lalu benar LOCKED', async () => {
  await step('', async () => {
    assertEquals((await login('spv', 'salah')).code, 'AUTH_FAIL');
    for (let i = 0; i < 4; i++) await login('spv', 'salah');
    const r = await login('spv');
    assertEquals(r.code, 'LOCKED');
  });
});

Deno.test('login sukses menghapus hitungan gagal', async () => {
  await step('', async () => {
    for (let i = 0; i < 4; i++) await login('head', 'salah');
    assertEquals((await login('head')).success, true);
    for (let i = 0; i < 4; i++) await login('head', 'salah');
    assertEquals((await login('head')).success, true);
  });
});

Deno.test('guestLogin', async () => {
  await step('', async () => {
    const ok = await call(null, 'guestLogin', { role: 'PIC', person_id: 'PRS-PIC1' });
    assertEquals(ok.data.me.type, 'GUEST');
    assertEquals(ok.data.token.length, 72);
    assertEquals((await call(null, 'guestLogin', { role: 'UTILITY', person_id: 'PRS-PIC1' })).success, false);
    assertEquals((await call(null, 'guestLogin', { role: 'ADMIN', person_id: 'PRS-PIC1' })).success, false);
  });
});

Deno.test('sesi: valid vs tidak valid', async () => {
  await step('', async () => {
    const t = await tokenOf('admin');
    assertEquals((await call(t, 'changePassword', { oldPassword: 'x', newPassword: 'abcdef' })).code, 'VALIDATION');
    assertEquals((await call('ngawur', 'changePassword', { oldPassword: 'x', newPassword: 'abcdef' })).code, 'AUTH');
    assertEquals((await call(null, 'changePassword', {})).code, 'AUTH');
  });
});

Deno.test('logout mencabut sesi', async () => {
  await step('', async () => {
    const t = await tokenOf('admin');
    assertEquals((await call(t, 'logout')).data, true);
    assertEquals((await call(t, 'changePassword', { oldPassword: 'x', newPassword: 'abcdef' })).code, 'AUTH');
  });
});

Deno.test('akun dinonaktifkan -> AUTH', async () => {
  await step('', async () => {
    const t = await tokenOf('spv');
    await svc.from('master_account').update({ active: 'FALSE' }).eq('username', 'spv');
    assertEquals((await call(t, 'changePassword', { oldPassword: 'x', newPassword: 'abcdef' })).code, 'AUTH');
  });
});

Deno.test('sesi kedaluwarsa -> AUTH', async () => {
  await step('', async () => {
    const t = await tokenOf('admin');
    await svc.from('session').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('token', t);
    assertEquals((await call(t, 'changePassword', { oldPassword: 'x', newPassword: 'abcdef' })).code, 'AUTH');
  });
});

Deno.test('changePassword', async () => {
  await step('', async () => {
    const t = await tokenOf('admin');
    assertEquals((await call(t, 'changePassword', { oldPassword: 'x', newPassword: 'abc' })).message, 'Password baru minimal 6 karakter');
    const bad = await call(t, 'changePassword', { oldPassword: 'salah', newPassword: 'baru1234' });
    assertEquals([bad.success, bad.message], [false, 'Password lama salah']);
    assertEquals((await call(t, 'changePassword', { oldPassword: PASSWORD, newPassword: 'baru1234' })).data, true);
    assertEquals((await login('admin', 'baru1234')).success, true);
    assertEquals((await login('admin')).code, 'AUTH_FAIL');
  });
});
