// Tes NON-destruktif: membuktikan guard menolak sebelum ada operasi jaringan.
// Jalankan: deno test --no-check --allow-env --allow-net=127.0.0.1 tests/guard_test.ts (ALLOW_DESTRUCTIVE_TESTS tidak diset).
import { assertRejects, assertThrows } from 'jsr:@std/assert@1';
import { assertDestructiveAllowed } from './guard.ts';

Deno.test('guard menolak bila ALLOW_DESTRUCTIVE_TESTS kosong / salah', () => {
  Deno.env.set('SUPABASE_URL', 'https://abcdefgh.supabase.co');
  Deno.env.delete('ALLOW_DESTRUCTIVE_TESTS');
  assertThrows(() => assertDestructiveAllowed(), Error, 'DITOLAK');
  Deno.env.set('ALLOW_DESTRUCTIVE_TESTS', 'true');
  assertThrows(() => assertDestructiveAllowed(), Error, 'DITOLAK');
  Deno.env.set('ALLOW_DESTRUCTIVE_TESTS', 'abcdefgh');
  assertDestructiveAllowed(); // cocok: lolos
});

Deno.test('seed() menolak sebelum menyentuh jaringan', async () => {
  Deno.env.set('SUPABASE_URL', 'https://127.0.0.1:1'); // tak ada server; bila guard bocor, akan error jaringan, bukan DITOLAK
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'x');
  Deno.env.set('API_URL', 'https://127.0.0.1:1');
  Deno.env.delete('ALLOW_DESTRUCTIVE_TESTS');
  const { seed } = await import('./api_helpers.ts');
  await assertRejects(() => seed(), Error, 'DITOLAK');
});
