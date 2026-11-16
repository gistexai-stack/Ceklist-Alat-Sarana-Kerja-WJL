import { assertEquals } from 'jsr:@std/assert@1';
import { addDays, fill, opDate, pts, shiftOf, ts } from './util.ts';

Deno.test('opDate: batas 07:00 WIB', () => {
  assertEquals(opDate(new Date('2026-11-16T23:59:00Z')), '2026-11-16');
  assertEquals(opDate(new Date('2026-11-17T00:00:00Z')), '2026-11-17');
});
Deno.test('shiftOf: batas shift WIB', () => {
  // 07:00, 14:59, 15:00, 22:59, 23:00, 06:59 WIB
  const utc = ['2026-11-16T00:00:00Z', '2026-11-16T07:59:00Z', '2026-11-16T08:00:00Z', '2026-11-16T15:59:00Z', '2026-11-16T16:00:00Z', '2026-11-16T23:59:00Z'];
  assertEquals(utc.map((s) => shiftOf(new Date(s))), ['1', '1', '2', '2', '3', '3']);
});
Deno.test('ts/pts roundtrip', () => {
  assertEquals(ts(new Date('2026-11-16T01:02:03Z')), '2026-11-16 08:02:03');
  assertEquals(pts('2026-11-16 08:02:03')!.toISOString(), '2026-11-16T01:02:03.000Z');
});
Deno.test('addDays', () => assertEquals(addDays('2026-11-30', 1), '2026-12-01'));
Deno.test('fill', () => assertEquals(fill('{a}-{b}', { a: 'x', b: '' }), 'x--'));
