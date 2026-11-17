// Jalankan: node apps-script/rowsToPayload.test.js
// Memuat hanya fungsi rowsToPayload dari Migrasi.gs (tanpa Apps Script).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'Migrasi.gs'), 'utf8');
const m = src.match(/\/\/ BEGIN rowsToPayload([\s\S]*?)\/\/ END rowsToPayload/);
assert(m, 'penanda BEGIN/END rowsToPayload tidak ditemukan di Migrasi.gs');
const rowsToPayload = new Function(m[1] + '\nreturn rowsToPayload;')();

const head = ['id', 'tgl', 'n', 'kosong', 'nul', 'und', 'ok', 'no', 'teks'];
const out = rowsToPayload(head, [
  ['A1', new Date(Date.UTC(2026, 10, 16, 17, 5, 9)), 42, '', null, undefined, true, false, ' x '],
  ['', '', '', '', '', '', '', '', ''],            // baris kosong total: dilewati
  ['A2', new Date('invalid'), 3.5, 0, '', '', '', '', 'y']
]);
assert.strictEqual(out.length, 2);
assert.deepStrictEqual(out[0], { id: 'A1', tgl: '2026-11-17 00:05:09', n: '42', kosong: '', nul: '', und: '', ok: 'TRUE', no: 'FALSE', teks: ' x ' });
assert.deepStrictEqual(out[1], { id: 'A2', tgl: '', n: '3.5', kosong: '0', nul: '', und: '', ok: '', no: '', teks: 'y' });
console.log('rowsToPayload: OK');
