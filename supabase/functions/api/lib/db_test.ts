import { assertEquals } from 'jsr:@std/assert@1';
import { assertDestructiveAllowed } from '../../../../tests/guard.ts';
import { db, insertRows, selectAll, updateWhere } from './db.ts';

Deno.test('selectAll membaca > 1.000 baris; updateWhere hanya klaim sekali', async () => {
  assertDestructiveAllowed();
  const p = 'T2-' + crypto.randomUUID().slice(0, 8) + '-';
  const rows = Array.from({ length: 1205 }, (_, i) => ({ schedule_id: p + String(i).padStart(5, '0'), asset_id: 'T2' }));
  try {
    for (let i = 0; i < rows.length; i += 500) await insertRows('schedule', rows.slice(i, i + 500));
    assertEquals((await selectAll('schedule', (q) => q.like('schedule_id', p + '%'))).length, 1205);
    assertEquals(await updateWhere('schedule', { status: 'X' }, { schedule_id: p + '00000', status: '' }), 1);
    assertEquals(await updateWhere('schedule', { status: 'Y' }, { schedule_id: p + '00000', status: '' }), 0);
  } finally {
    await db.from('schedule').delete().like('schedule_id', p + '%');
  }
});
