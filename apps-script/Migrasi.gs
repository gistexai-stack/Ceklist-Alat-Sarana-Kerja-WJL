/**
 * Migrasi.gs — SEKALI JALAN: salin data Google Sheets + foto Drive ke Supabase.
 * Tempel sebagai file BARU di proyek Apps Script yang sama dengan Code.gs.
 * Hanya MEMBACA Sheets/Drive; tidak memanggil fungsi tulis Code.gs. Memakai SCHEMA dari Code.gs.
 * Script Properties: SB_URL, SB_SERVICE_KEY (wajib), DB_ID (sudah ada), MIG_FINAL=TRUE (hanya hari cutover).
 * Langkah lengkap: README-migrasi.md
 */

// ---------- Fungsi murni (diuji di Node: apps-script/rowsToPayload.test.js) ----------
// BEGIN rowsToPayload
/** head: nama kolom; values: baris-baris data (tanpa header). Semua nilai jadi string; baris kosong total dilewati. */
function rowsToPayload(head, values) {
  function cell(v) {
    if (v === null || v === undefined) return '';
    if (Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) return '';
      return new Date(v.getTime() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' '); // WIB (UTC+7)
    }
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }
  const out = [];
  values.forEach(function (row) {
    const o = {};
    let any = false;
    head.forEach(function (h, i) {
      o[h] = cell(row[i]);
      if (o[h] !== '') any = true;
    });
    if (any) out.push(o);
  });
  return out;
}
// END rowsToPayload

// ---------- Konstanta ----------
const MIG_BUDGET_MS = 270000;          // berhenti sebelum ~5 menit (batas Apps Script 6 menit)
const MIG_BATCH = 500;
const MIG_PHOTO_MAX = 1024 * 1024;     // > 1 MB dikecilkan lewat thumbnail
const MIG_SKIP_SETTINGS = ['ROOT_FOLDER_ID', 'DB_ID', 'APP_URL'];
const MIG_OPEN = ['PERLU_PERBAIKAN', 'SEDANG_DIPERBAIKI', 'MENUNGGU_SPV', 'MENUNGGU_HEAD'];
const MIG_PHOTO_COLS = [['CHECKLIST_DETAIL', 'photo_file_id'], ['REPAIR_ITEM', 'after_photo_file_id'], ['REPAIR_LOG', 'after_photo_file_id']];
const MIG_FAILED_CAP = 200;            // Script Property maks ~9 KB; sisanya cukup dihitung

// ---------- Helper ----------
function mig_prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }

function mig_cfg_() {
  const url = (mig_prop_('SB_URL') || '').replace(/\/+$/, ''), key = mig_prop_('SB_SERVICE_KEY');
  if (!url || !key) throw new Error('Isi Script Properties SB_URL dan SB_SERVICE_KEY dulu (lihat README-migrasi.md).');
  return { url: url, key: key };
}

/** Panggilan HTTP ke Supabase. Gagal (>= 300) -> throw (isi error dipotong, kunci tidak pernah dicetak). */
function mig_sb_(method, path, opt) {
  const c = mig_cfg_();
  opt = opt || {};
  const headers = Object.assign({ apikey: c.key, Authorization: 'Bearer ' + c.key }, opt.headers || {});
  const r = UrlFetchApp.fetch(c.url + path, { method: method, headers: headers, contentType: opt.contentType, payload: opt.payload, muteHttpExceptions: true });
  if (r.getResponseCode() >= 300) throw new Error(method + ' ' + path.split('?')[0] + ' -> ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
  return r;
}

/** Baris sheet (sudah disaring) sebagai array objek payload. Kolom dipetakan berdasar nama header sheet. */
function mig_rows_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) { Logger.log('PERINGATAN: sheet ' + name + ' tidak ada, dianggap kosong.'); return []; }
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const sheetHead = v[0].map(String), cols = SCHEMA[name], pk = cols[0];
  const idx = cols.map(function (h) { return sheetHead.indexOf(h); });
  const grid = v.slice(1).map(function (r) { return idx.map(function (i) { return i < 0 ? '' : r[i]; }); });
  return rowsToPayload(cols, grid).filter(function (o) {
    if (o[pk] === '') { Logger.log('PERINGATAN: ' + name + ' baris tanpa ' + pk + ' dilewati.'); return false; }
    return !(name === 'SYSTEM_SETTINGS' && MIG_SKIP_SETTINGS.indexOf(o.setting_key) >= 0);
  });
}

function mig_photoIds_(ss) {
  const seen = {};
  MIG_PHOTO_COLS.forEach(function (tc) { mig_rows_(ss, tc[0]).forEach(function (o) { if (o[tc[1]]) seen[o[tc[1]]] = 1; }); });
  return Object.keys(seen).sort();
}

function mig_dupes_(rows, keyFn) {
  const c = {};
  rows.forEach(function (r) { const k = keyFn(r); if (k !== null) c[k] = (c[k] || 0) + 1; });
  return Object.keys(c).filter(function (k) { return c[k] > 1; }).map(function (k) { return '"' + k + '" x' + c[k]; });
}

function mig_state_() {
  const s = mig_prop_('MIG_STATE');
  return s ? JSON.parse(s) : { t: 0, o: 0, p: 0, failed: [], failedN: 0, done: false };
}
function mig_save_(st) { PropertiesService.getScriptProperties().setProperty('MIG_STATE', JSON.stringify(st)); }

function mig_triggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'migrasiJalankan') ScriptApp.deleteTrigger(t); });
}

function mig_count_(table) {
  const r = mig_sb_('get', '/rest/v1/' + table + '?select=*&limit=1', { headers: { Prefer: 'count=exact' } });
  const h = r.getHeaders(), k = Object.keys(h).filter(function (x) { return x.toLowerCase() === 'content-range'; })[0];
  return Number(String(h[k] || '').split('/')[1]);
}

// ---------- 1. Hitung & periksa muat ----------
function migrasiHitung() {
  const t0 = Date.now();
  const ss = SpreadsheetApp.openById(mig_prop_('DB_ID'));
  let dbBytes = 0;
  Logger.log('=== JUMLAH BARIS SHEETS ===');
  Object.keys(SCHEMA).forEach(function (name) {
    const rows = mig_rows_(ss, name), pk = SCHEMA[name][0];
    rows.forEach(function (o) { dbBytes += JSON.stringify(o).length; });
    Logger.log(name + ': ' + rows.length);
    const d = mig_dupes_(rows, function (o) { return o[pk]; });
    if (d.length) Logger.log('  DUPLIKAT ' + pk + ' (hanya 1 baris yang masuk): ' + d.join(', '));
    const extra = { // indeks unik di Supabase; pelanggaran akan membuat upsert GAGAL
      REPAIR_CASE: ['satu kasus terbuka per alat (asset_id)', function (o) { return MIG_OPEN.indexOf(o.status) >= 0 ? o.asset_id : null; }],
      REPAIR_ITEM: ['(case_id, checkpoint_id)', function (o) { return o.case_id + ' | ' + o.checkpoint_id; }],
      NOTIFICATION_LOG: ['event_id', function (o) { return o.event_id; }],
      MASTER_ACCOUNT: ['username', function (o) { return o.username; }]
    }[name];
    if (extra) {
      const e = mig_dupes_(rows, extra[1]);
      if (e.length) Logger.log('  PELANGGARAN INDEKS UNIK ' + extra[0] + ': ' + e.join(', ') + '  -> rapikan di Sheets sebelum migrasi.');
    }
  });

  const ids = mig_photoIds_(ss);
  let n = 0, total = 0, est = 0, missing = 0;
  for (; n < ids.length && Date.now() - t0 < MIG_BUDGET_MS; n++) {
    try {
      const sz = DriveApp.getFileById(ids[n]).getSize();
      total += sz; est += sz > MIG_PHOTO_MAX ? 0.35 * 1048576 : sz;
    } catch (e) { missing++; }
  }
  const scale = n ? ids.length / n : 1; // ponytail: bila waktu habis, sisanya diperkirakan dari rata-rata contoh
  const totalMB = total * scale / 1048576, estMB = est * scale / 1048576;
  const dbMB = dbBytes * 1.5 / 1048576; // perkiraan kasar: teks + indeks/overhead
  Logger.log('=== FOTO ===');
  Logger.log('Foto unik: ' + ids.length + (n < ids.length ? ' (ukuran diperkirakan dari ' + n + ' contoh)' : '') + '; tidak terbaca di Drive: ' + missing);
  Logger.log('Ukuran asli: ' + totalMB.toFixed(1) + ' MB; perkiraan setelah dikecilkan: ' + estMB.toFixed(1) + ' MB');
  Logger.log('Perkiraan database: ' + dbMB.toFixed(1) + ' MB (batas 500 MB)');
  const ok = dbMB <= 500 && estMB <= 1024 * 0.7;
  Logger.log('KESIMPULAN: ' + (ok ? 'MUAT' : 'TIDAK MUAT') + ' (Storage 1 GB, sisakan 30% -> pakai maks ' + (1024 * 0.7).toFixed(0) + ' MB)');
}

// ---------- 2. Salin (dilanjutkan otomatis bila belum selesai) ----------
function migrasiJalankan() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) { Logger.log('Migrasi lain sedang berjalan, dibatalkan.'); return; }
  try {
    mig_triggers_();
    const t0 = Date.now(), ss = SpreadsheetApp.openById(mig_prop_('DB_ID')), names = Object.keys(SCHEMA);
    let st = mig_state_();
    if (st.done) st = { t: 0, o: 0, p: 0, failed: [], failedN: 0, done: false }; // jalankan ulang = mulai dari awal
    const pause = function () {
      mig_save_(st);
      ScriptApp.newTrigger('migrasiJalankan').timeBased().after(60 * 1000).create();
      Logger.log('Dijeda di ' + (names[st.t] || 'FOTO') + ' posisi ' + (st.t < names.length ? st.o : st.p) + '; lanjut otomatis 1 menit lagi.');
    };

    for (; st.t < names.length; st.t++, st.o = 0) {
      const name = names[st.t], pk = SCHEMA[name][0], rows = mig_rows_(ss, name);
      while (st.o < rows.length) {
        if (Date.now() - t0 > MIG_BUDGET_MS) return pause();
        const byPk = {};
        rows.slice(st.o, st.o + MIG_BATCH).forEach(function (o) { byPk[o[pk]] = o; }); // satu baris per PK dalam 1 batch
        mig_sb_('post', '/rest/v1/' + name.toLowerCase() + '?on_conflict=' + pk, {
          contentType: 'application/json', payload: JSON.stringify(Object.keys(byPk).map(function (k) { return byPk[k]; })),
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
        });
        st.o += MIG_BATCH;
        mig_save_(st);
      }
      Logger.log(name + ': ' + rows.length + ' baris disalin.');
    }

    const ids = mig_photoIds_(ss);
    for (; st.p < ids.length; st.p++) {
      if (Date.now() - t0 > MIG_BUDGET_MS) return pause();
      try { mig_uploadPhoto_(ids[st.p]); }
      catch (e) {
        st.failedN++;
        if (st.failed.length < MIG_FAILED_CAP) st.failed.push(ids[st.p]);
        Logger.log('FOTO GAGAL ' + ids[st.p] + ': ' + e.message);
      }
      if (st.p % 10 === 9) mig_save_(st);
    }

    if (mig_prop_('MIG_FINAL') === 'TRUE') {
      const now = Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
      mig_sb_('post', '/rest/v1/system_settings?on_conflict=setting_key', {
        contentType: 'application/json', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        payload: JSON.stringify([{ setting_key: 'MIGRATED_AT', setting_value: now, updated_at: now, updated_by: 'migrasi' }])
      });
      Logger.log('MIG_FINAL=TRUE: MIGRATED_AT ditulis ' + now);
    } else {
      Logger.log('Uji coba (MIG_FINAL bukan TRUE): MIGRATED_AT TIDAK ditulis.');
    }
    st.done = true;
    mig_save_(st);
    Logger.log('SELESAI. Foto gagal: ' + st.failedN + '. Jalankan migrasiLaporan().');
  } finally {
    lock.releaseLock();
  }
}

function mig_uploadPhoto_(id) {
  const f = DriveApp.getFileById(id);
  let bytes, type;
  if (f.getSize() <= MIG_PHOTO_MAX) {
    const b = f.getBlob();
    bytes = b.getBytes(); type = b.getContentType();
  } else {
    const link = Drive.Files.get(id, { fields: 'thumbnailLink' }).thumbnailLink;
    if (!link) throw new Error('tidak ada thumbnail untuk dikecilkan');
    const r = UrlFetchApp.fetch(link.replace(/=s\d+$/, '=s1280'), { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('thumbnail HTTP ' + r.getResponseCode());
    const b = r.getBlob();
    bytes = b.getBytes(); type = b.getContentType();
  }
  mig_sb_('post', '/storage/v1/object/photos/' + encodeURIComponent(id), { contentType: type || 'image/jpeg', payload: bytes, headers: { 'x-upsert': 'true' } });
}

// ---------- 3. Laporan ----------
function migrasiLaporan() {
  const ss = SpreadsheetApp.openById(mig_prop_('DB_ID'));
  Logger.log('TABEL | Sheets (unik) | Supabase | status');
  let bad = 0;
  Object.keys(SCHEMA).forEach(function (name) {
    const pk = SCHEMA[name][0], seen = {};
    mig_rows_(ss, name).forEach(function (o) { seen[o[pk]] = 1; });
    const a = Object.keys(seen).length, b = mig_count_(name.toLowerCase());
    const ok = name === 'SYSTEM_SETTINGS' ? b >= a : a === b; // settings: Supabase boleh lebih (default + MIGRATED_AT)
    if (!ok) bad++;
    Logger.log(name + ' | ' + a + ' | ' + b + ' | ' + (ok ? 'COCOK' : 'BEDA'));
  });
  const st = mig_state_();
  Logger.log('Status migrasi: ' + (st.done ? 'selesai' : 'BELUM selesai (jalankan migrasiJalankan)'));
  Logger.log('Foto gagal: ' + st.failedN + (st.failed.length ? ' -> ' + st.failed.join(', ') : ''));
  Logger.log(bad || st.failedN ? 'ADA YANG PERLU DICEK.' : 'SEMUA COCOK.');
}

// ---------- 4. Bersihkan ----------
function migrasiBersihkan() {
  const p = PropertiesService.getScriptProperties();
  ['SB_SERVICE_KEY', 'MIG_STATE', 'MIG_FINAL'].forEach(function (k) { p.deleteProperty(k); });
  mig_triggers_();
  Logger.log('Bersih: kunci, state, MIG_FINAL, dan trigger migrasi dihapus.');
}
