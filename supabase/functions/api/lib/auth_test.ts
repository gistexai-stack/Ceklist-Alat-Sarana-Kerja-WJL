import { assertEquals } from 'jsr:@std/assert@1';
import { hash } from './auth.ts';

Deno.test('hash: sama dengan hash_() Code.gs', async () => {
  assertEquals(await hash('rahasia123', '0b7e5c1a-1111-4222-8333-944455556666'), 'UD8BCEAElCl8Qe99+tzOZn1YQAijyLi3fb/VYtcQlnI=');
});
