// ===== Koneksi ke backend Google Apps Script (pengganti google.script.run di GitHub/Vercel) =====
// Isi dengan URL Web App Apps Script (Deploy → Manage deployments → URL yang berakhiran /exec).
const API_URL = 'https://script.google.com/macros/s/ISI_DEPLOYMENT_ID/exec';

// ===== MODE DEMO: backend tiruan di browser + data dummy 14 hari =====
// Aktif otomatis selama API_URL belum diisi. Login: admin / spv / head, password demo123 (atau masuk sebagai tamu).
// ponytail: data hanya di memori — reload halaman = data dummy dibuat ulang. Isi API_URL untuk backend asli.
if (/ISI_DEPLOYMENT_ID/.test(API_URL)) (function () {
  let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
  const pick = a => a[Math.floor(rnd() * a.length)];
  const pad = n => String(n).padStart(2, '0');
  const ds = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const ts = d => ds(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00';
  const P = s => new Date(s.length === 10 ? s + 'T00:00:00' : s.replace(' ', 'T'));
  const addH = (s, n) => ts(new Date(P(s).getTime() + n * 36e5));
  const addD = (d, n) => { const x = P(d); x.setDate(x.getDate() + n); return ds(x); };
  const hrs = (a, b) => Math.round((P(b) - P(a)) / 36e5 * 10) / 10;
  const now = () => ts(new Date());
  const later = (a, b) => (a > b ? a : b);
  const uniq = a => [...new Set(a.filter(Boolean))];
  const avg = a => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length * 10) / 10 : null);
  const opInfo = () => { const n = new Date(), h = n.getHours(); return { op: h < 7 ? addD(ds(n), -1) : ds(n), shift: h >= 7 && h < 15 ? '1' : h >= 15 && h < 23 ? '2' : '3' }; };
  const fail = m => { throw new Error(m); };

  // ---------- master ----------
  const PERS = { PIC: ['Asep Saepudin', 'Dedi Kurniawan', 'Rina Marlina', 'Yayan Sopian', 'Siti Nurhaliza', 'Ujang Rahmat'], MAINTENANCE: ['Agus Setiawan', 'Bambang Hermawan', 'Cecep Supriatna', 'Dodi Firmansyah'], UTILITY: ['Eko Prasetyo', 'Fajar Nugraha', 'Gilang Ramadhan'] };
  const M = { assets: [], persons: [], accounts: [] };
  Object.keys(PERS).forEach(r => PERS[r].forEach(n => M.persons.push({ person_id: 'P' + pad(M.persons.length + 1).padStart(3, '0'), display_name: n, role_type: r, active: 'TRUE' })));
  M.accounts = [['admin', 'Administrator', 'ADMIN'], ['spv', 'Hendra Gunawan', 'SPV'], ['head', 'Wawan Setiadi', 'HEAD']].map((a, i) => ({ account_id: 'AC' + (i + 1), username: a[0], display_name: a[1], role: a[2], active: 'TRUE', last_login_at: '' }));
  const PW = { AC1: 'demo123', AC2: 'demo123', AC3: 'demo123' };
  const ASSETS = [
    ['Mesin WJL Tsudakoma Line 1', 'DAILY', 'PIC', '', 'P001,P002', [['Nozzle utama', 'MAINTENANCE'], ['Selang & sambungan air', 'UTILITY'], ['Sensor pakan (feeler)', 'MAINTENANCE'], ['Tension benang lusi', 'PIC']]],
    ['Mesin WJL Tsudakoma Line 2', 'DAILY', 'PIC', '', 'P003', [['Nozzle utama', 'MAINTENANCE'], ['Selang & sambungan air', 'UTILITY'], ['Pisau potong pakan', 'MAINTENANCE'], ['Kebersihan area mesin', 'PIC']]],
    ['Roda Doffing Line 1', 'SHIFT', 'PIC', 'RODA DOFFING', 'P004,P005,P006', [['Roda & bearing', 'MAINTENANCE'], ['Rem roda', 'MAINTENANCE'], ['Rangka troli', 'MAINTENANCE']]],
    ['Roda Doffing Line 2', 'SHIFT', 'PIC', 'RODA DOFFING', 'P004,P005,P006', [['Roda & bearing', 'MAINTENANCE'], ['Rem roda', 'MAINTENANCE'], ['Rangka troli', 'MAINTENANCE']]],
    ['Kompresor Udara Atlas', 'DAILY', 'UTILITY', '', '', [['Tekanan angin (bar)', 'UTILITY'], ['Oli kompresor', 'UTILITY'], ['Filter udara', 'UTILITY']]],
    ['Pompa Air Bersih WJL', 'DAILY', 'UTILITY', '', '', [['Tekanan pompa', 'UTILITY'], ['Kebocoran pipa', 'UTILITY'], ['Panel listrik pompa', 'UTILITY']]],
    ['Mesin Sizing', 'DAILY', 'PIC', '', 'P001,P003', [['Suhu silinder', 'MAINTENANCE'], ['Bak kanji', 'PIC'], ['Rol press', 'MAINTENANCE'], ['Steam trap', 'UTILITY']]],
    ['Kereta Beam', 'DAILY', 'PIC', '', 'P002', [['Roda kereta', 'MAINTENANCE'], ['Pengunci beam', 'MAINTENANCE']]]
  ];
  let nCp = 0;
  ASSETS.forEach((a, i) => M.assets.push({ asset_id: 'A' + String(i + 1).padStart(3, '0'), source_no: String(i + 1), asset_name: a[0], schedule_type: a[1], checker_role: a[2], pic_group: a[3], pic_ids: a[4], active: 'TRUE',
    checkpoints: a[5].map((c, j) => ({ checkpoint_id: 'CP' + String(++nCp).padStart(3, '0'), display_order: j + 1, point_name: c[0], target_label: j % 2 ? '1 MENIT' : '2 MENIT', repair_department: c[1], active: 'TRUE' })) }));
  const asset = id => M.assets.find(a => a.asset_id === id) || fail('Alat tidak ditemukan');
  const cps = a => a.checkpoints.filter(c => c.active === 'TRUE');
  const picIds = a => (a.checker_role === 'UTILITY' ? [] : a.pic_ids.split(',').filter(String));
  const personsFor = a => (a.checker_role === 'UTILITY' ? M.persons.filter(p => p.role_type === 'UTILITY') : picIds(a).map(id => M.persons.find(p => p.person_id === id)).filter(Boolean));
  const ready = () => { const all = M.assets.filter(a => a.active === 'TRUE').flatMap(cps); const un = all.filter(c => !c.repair_department).length; return { ok: un === 0, unmapped: un, total: all.length }; };

  // ---------- data transaksi ----------
  const D = { sch: [], ck: {}, cases: [], audit: [], notif: [], backup: [], photos: {} };
  const SET = { WA_GROUPS: '120363000000000000@g.us', NOTIF_NOK: 'TRUE', NOTIF_SPV: 'TRUE', NOTIF_HEAD: 'TRUE', NOTIF_REJECT: 'TRUE', NOTIF_DONE: 'TRUE', NOTIF_REMINDER: 'FALSE', NOK_FORMAT: 'POINT', PHOTO_MAX_KB: '1500', BACKUP_RETENTION_DAYS: '30',
    TPL_NOK: '⚠️ NO OK: {alat} — {checkpoint}\nPIC: {pic} · {waktu}\nKasus: {kasus} ({departemen})\n{link}', TPL_NOK_ASSET: '⚠️ NO OK {alat}\n{daftar}\n{link}', TPL_SPV: '🔧 {kasus} {alat} selesai diperbaiki, menunggu SPV.\n{link}', TPL_HEAD: '✅ SPV {approver} menyetujui {kasus}, menunggu Head.\n{link}', TPL_REJECT: '❌ {kasus} ditolak {approver}: {catatan}\n{link}', TPL_DONE: '🎉 {kasus} {alat} selesai.', TPL_REMINDER: '⏰ Perbaikan belum selesai:\n{daftar}' };
  let TOKEN = '', nCase = 0, nCk = 0, nItem = 0, nPh = 0;
  const photo = v => { const id = 'PH' + String(++nPh).padStart(5, '0'); D.photos[id] = v; return id; };
  const notif = (type, sum, at) => { const ok = rnd() > 0.08; D.notif.push({ created_at: at, event_type: type, payload_summary: sum, status: ok ? 'SENT' : 'FAILED', attempt_count: ok ? 1 : 3, provider_response: ok ? '{"status":true,"detail":"success! message in queue"}' : '{"status":false,"reason":"device disconnected"}' }); };
  const audit = (me, action, type, id, reason, after) => D.audit.push({ created_at: now(), actor_name: me ? me.name : 'SYSTEM', actor_type: me ? me.type : 'SYSTEM', action, entity_type: type, entity_id: id, reason: reason || '', after_json: after ? JSON.stringify(after) : '' });
  const NOTES = ['Bocor di sambungan', 'Bunyi kasar saat berputar', 'Baut kendor', 'Sensor tidak merespon', 'Aus, perlu ganti', 'Kotor / tersumbat', ''];
  const ACTIONS = ['Ganti seal & kencangkan sambungan', 'Ganti bearing baru', 'Kencangkan baut lalu uji coba', 'Bersihkan & kalibrasi sensor', 'Ganti part aus dengan baru', 'Bersihkan saluran dan uji aliran'];
  const log = (c, ev, actor, at, note, act) => { c.logs.push({ created_at: at, actor_name: actor, event: ev, note: note || '', repair_action: act || '' }); c.last_activity_at = at; };
  const recompute = c => {
    if (c.status !== 'PERLU_PERBAIKAN' && c.status !== 'SEDANG_DIPERBAIKI') return;
    const its = c.items;
    c.status = its.every(i => i.status === 'DONE') ? 'MENUNGGU_SPV' : its.some(i => i.status === 'CLAIMED' || i.status === 'DONE') ? 'SEDANG_DIPERBAIKI' : 'PERLU_PERBAIKAN';
  };
  const reopenItem = i => Object.assign(i, { status: 'OPEN', claimed_by: '', claimed_by_name_snapshot: '', started_at: '', completed_at: '', repair_action: '', after_photo_file_id: '' });
  function addNok(a, cp, at, checker, note, ph) {
    let c = D.cases.find(x => x.asset_id === a.asset_id && x.status !== 'SELESAI');
    if (!c) {
      c = { case_id: 'CASE-' + String(++nCase).padStart(4, '0'), asset_id: a.asset_id, asset_name_snapshot: a.asset_name, status: 'PERLU_PERBAIKAN', cycle_no: 1, rework_count: 0, first_finding_at: at, closed_at: '', last_activity_at: at, base: at, speed: 0.6 + rnd() * 3.5, flaky: rnd() < 0.25, items: [], logs: [], approvals: [] };
      D.cases.push(c);
    } else if (/MENUNGGU/.test(c.status)) {
      c.approvals.forEach(p => { if (p.cycle_no === c.cycle_no) p.valid = false; });
      c.cycle_no++; c.base = at; c.status = 'PERLU_PERBAIKAN';
      log(c, 'REOPEN_NOK', checker, at, cp.point_name);
    }
    let it = c.items.find(i => i.checkpoint_id === cp.checkpoint_id);
    if (!it) c.items.push(it = reopenItem({ case_item_id: 'ITM-' + String(++nItem).padStart(5, '0'), checkpoint_id: cp.checkpoint_id, point_name_snapshot: cp.point_name, department: cp.repair_department, occurrence_count: 0, rework_count: 0, last_reject_note: '', occurrences: [] }));
    else if (it.status === 'DONE') { reopenItem(it); log(c, 'REOPEN_NOK', checker, at, cp.point_name); }
    it.occurrence_count++; it.occurrences.push({ photo: ph, recorded_at: at, checker, note });
    c.last_activity_at = at; recompute(c);
    notif('NOK', a.asset_name + ' — ' + cp.point_name + ' (' + c.case_id + ')', at);
    return c;
  }
  const claim = (c, i, pid, name, at) => { Object.assign(i, { status: 'CLAIMED', claimed_by: pid, claimed_by_name_snapshot: name, started_at: at }); log(c, 'CLAIM', name, at, i.point_name_snapshot); recompute(c); };
  const release = (c, i, actor, at) => { reopenItem(i); log(c, 'RELEASE', actor, at, i.point_name_snapshot); recompute(c); };
  const complete = (c, i, act, ph, at) => {
    Object.assign(i, { status: 'DONE', repair_action: act, completed_at: at, after_photo_file_id: ph });
    log(c, 'DONE', i.claimed_by_name_snapshot, at, i.point_name_snapshot, act); recompute(c);
    if (c.status === 'MENUNGGU_SPV') notif('SPV', c.case_id + ' ' + c.asset_name_snapshot + ' menunggu SPV', at);
  };
  function decide(c, level, dec, who, at, note, ids) {
    c.approvals.push({ level, decision: dec, approver_name: who.name, approver_role: who.role, decided_at: at, cycle_no: c.cycle_no, valid: true, note: note || '' });
    c.last_activity_at = at;
    if (dec === 'APPROVE') {
      if (level === 'SPV') { c.status = 'MENUNGGU_HEAD'; notif('HEAD', c.case_id + ' disetujui SPV ' + who.name, at); }
      else { c.status = 'SELESAI'; c.closed_at = at; notif('DONE', c.case_id + ' ' + c.asset_name_snapshot + ' selesai', at); }
      return;
    }
    c.approvals.forEach(p => { if (p.cycle_no === c.cycle_no && p.decision === 'APPROVE') p.valid = false; });
    c.items.filter(i => ids.includes(i.case_item_id)).forEach(i => { reopenItem(i); i.rework_count++; i.last_reject_note = note; log(c, 'REOPEN_REJECT', who.name, at, i.point_name_snapshot + ' — ' + note); });
    c.rework_count++; c.cycle_no++; c.base = at; c.status = 'PERLU_PERBAIKAN'; recompute(c);
    notif('REJECT', c.case_id + ' ditolak ' + who.name + ': ' + note, at);
  }
  const techFor = dept => pick(M.persons.filter(p => p.role_type === dept));
  const ACC = r => { const a = M.accounts.find(x => x.role === r); return { name: a.display_name, role: r }; };
  // simulasi alur kasus berdasar umur (hanya untuk data dummy awal)
  function advance(c, at) {
    for (let g = 0; g < 8 && c.status !== 'SELESAI'; g++) {
      const age = hrs(c.base, at) / c.speed, t = s => addH(c.base, s * c.speed);
      if (c.status === 'PERLU_PERBAIKAN' && age >= 6) c.items.filter(i => i.status === 'OPEN').forEach(i => { const p = techFor(i.department); claim(c, i, p.person_id, p.display_name, later(t(6), i.occurrences[i.occurrences.length - 1].recorded_at)); });
      else if (c.status === 'SEDANG_DIPERBAIKI' && age >= 26) {
        c.items.filter(i => i.status === 'OPEN').forEach(i => { const p = techFor(i.department); claim(c, i, p.person_id, p.display_name, later(t(20), i.occurrences[i.occurrences.length - 1].recorded_at)); });
        c.items.filter(i => i.status === 'CLAIMED').forEach(i => complete(c, i, pick(ACTIONS), photo([i.point_name_snapshot + ' — sesudah', '#1E7A4F']), later(t(26), addH(i.started_at, 2))));
      } else if (c.status === 'MENUNGGU_SPV' && age >= 34) {
        if (c.flaky && c.cycle_no === 1) decide(c, 'SPV', 'REJECT', ACC('SPV'), t(34), 'Masih belum normal, mohon dicek ulang', [c.items[0].case_item_id]);
        else decide(c, 'SPV', 'APPROVE', ACC('SPV'), t(34), '');
      } else if (c.status === 'MENUNGGU_HEAD' && age >= 44) decide(c, 'HEAD', 'APPROVE', ACC('HEAD'), t(44), 'OK');
      else return;
    }
  }
  const codes = a => (a.schedule_type === 'SHIFT' ? ['1', '2', '3'] : ['']);
  const win = (d, code) => ({ '': [d + ' 07:00:00', addD(d, 1) + ' 07:00:00'], 1: [d + ' 07:00:00', d + ' 15:00:00'], 2: [d + ' 15:00:00', d + ' 23:00:00'], 3: [d + ' 23:00:00', addD(d, 1) + ' 07:00:00'] })[code];
  function submitCk(s, results, checker, at) {
    const a = asset(s.asset_id), id = 'CL-' + String(++nCk).padStart(5, '0');
    const ck = { checklist_id: id, schedule_id: s.schedule_id, asset_id: a.asset_id, asset_name_snapshot: a.asset_name, operational_date: s.date, shift_code: s.shift_code, checker_name_snapshot: checker, submitted_at: at, details: [] };
    let nok = 0, caseId = '';
    results.forEach(r => {
      const cp = a.checkpoints.find(x => x.checkpoint_id === r.checkpoint_id) || fail('Checkpoint tidak dikenal');
      const d = { checkpoint_id: cp.checkpoint_id, point_name_snapshot: cp.point_name, department: cp.repair_department, result: r.result, photo_file_id: r.photo || '', finding_note: r.note || '', case_id: '' };
      if (r.result === 'NO OK') { nok++; d.case_id = caseId = addNok(a, cp, at, checker, d.finding_note, d.photo_file_id).case_id; }
      ck.details.push(d);
    });
    D.ck[id] = ck; Object.assign(s, { status: 'DONE', checklist_id: id, checker, submitted_at: at, nok });
    return { nok, case_id: caseId };
  }
  (function generate() {
    const { op } = opInfo(), t0 = now();
    for (let k = -13; k <= 0; k++) {
      const d = addD(op, k);
      D.cases.forEach(c => advance(c, d + ' 07:00:00'));
      D.backup.push({ created_at: d + ' 02:00:00', type: 'AUTO', file_name: 'Backup_SaranaKerja_' + d, file_id: 'demo', status: 'OK', message: 'Selesai', trashed_at: '' });
      M.assets.forEach(a => codes(a).forEach(code => {
        const [open_at, close_at] = win(d, code);
        const s = { schedule_id: 'SC-' + d.replace(/-/g, '') + '-' + a.asset_id + '-' + (code || 'D'), date: d, asset_id: a.asset_id, shift_code: code, open_at, close_at, status: 'OPEN', checklist_id: '', checker: '', submitted_at: '', nok: 0 };
        D.sch.push(s);
        if (open_at > t0) return;
        const past = close_at <= t0, r = rnd();
        if (past && r < 0.1) { s.status = 'MISSED'; return; }
        if (!past && r < 0.65) return;
        const at = addH(open_at, past ? 0.5 + rnd() * 5 : rnd() * hrs(open_at, t0) * 0.9);
        submitCk(s, cps(a).map(cp => { const bad = rnd() < 0.06; return { checkpoint_id: cp.checkpoint_id, result: bad ? 'NO OK' : 'OK', note: bad ? pick(NOTES) : '', photo: bad ? photo([cp.point_name + ' — temuan', '#B42318']) : '' }; }), pick(personsFor(a)).display_name, at);
      }));
    }
    D.cases.forEach(c => advance(c, t0));
    D.audit.push({ created_at: addD(op, -14) + ' 08:00:00', actor_name: 'Administrator', actor_type: 'ACCOUNT', action: 'INSTALL', entity_type: 'SYSTEM', entity_id: '-', reason: 'Instalasi awal (data demo)', after_json: '' });
  })();

  // ---------- query helpers ----------
  const caseOf = id => D.cases.find(c => c.case_id === id) || fail('Kasus tidak ditemukan');
  const itemOf = id => { for (const c of D.cases) { const i = c.items.find(x => x.case_item_id === id); if (i) return { c, i }; } fail('Item tidak ditemukan'); };
  const ageH = c => hrs(c.first_finding_at, c.closed_at || now());
  const depts = c => uniq(c.items.map(i => i.department)).join(', ');
  const techs = c => uniq(c.items.map(i => i.claimed_by_name_snapshot)).join(', ');
  const isActive = c => c.status !== 'SELESAI';
  const byAge = (a, b) => (a.first_finding_at < b.first_finding_at ? -1 : 1);
  const agg = l => { const done = l.filter(s => s.status === 'DONE').length, missed = l.filter(s => s.status === 'MISSED').length, open = l.filter(s => s.status === 'OPEN').length; return { done, missed, open, compliance: done + missed ? Math.round(done / (done + missed) * 100) : null }; };
  const schF = (from, to, f) => D.sch.filter(s => s.date >= from && s.date <= to && (!f.asset_id || s.asset_id === f.asset_id) && (!f.shift || s.shift_code === f.shift) && (!f.pic_id || picIds(asset(s.asset_id)).includes(f.pic_id)));
  const noks = (sch, f) => sch.filter(s => s.checklist_id).flatMap(s => D.ck[s.checklist_id].details.filter(d => d.result === 'NO OK' && (!f.dept || d.department === f.dept)).map(d => Object.assign({ ck: D.ck[s.checklist_id] }, d)));
  const casesF = f => D.cases.filter(c => (!f.asset_id || c.asset_id === f.asset_id) && (!f.dept || c.items.some(i => i.department === f.dept)) && (!f.status || c.status === f.status));
  const monday = d => { const x = P(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return ds(x); };
  const tok = me => 'demo.' + btoa(unescape(encodeURIComponent(JSON.stringify(me))));
  const pubP = r => M.persons.filter(p => p.role_type === r && p.active === 'TRUE').map(p => ({ id: p.person_id, name: p.display_name }));
  const svg = (label, color, id) => 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="' + color + '"/><text x="50%" y="46%" fill="#fff" font-family="sans-serif" font-size="28" text-anchor="middle">' + label.replace(/[&<>]/g, '') + '</text><text x="50%" y="56%" fill="#fff" opacity=".75" font-family="sans-serif" font-size="18" text-anchor="middle">Foto dummy · ' + id + '</text></svg>');
  const REP_TYPES = { checklist: 'Laporan Checklist', nok: 'Laporan Temuan NO OK', case: 'Laporan Kasus Perbaikan', missed: 'Jadwal Tidak Dikerjakan' };
  function reportData(f) {
    const sch = schF(f.from, f.to, f), sl = s => (s ? 'Shift ' + s : 'Harian');
    if (f.type === 'nok') return { columns: ['Waktu', 'Alat', 'Checkpoint', 'Departemen', 'Pemeriksa', 'Catatan', 'Kasus'], rows: noks(sch, f).map(d => [d.ck.submitted_at.slice(0, 16), d.ck.asset_name_snapshot, d.point_name_snapshot, d.department, d.ck.checker_name_snapshot, d.finding_note, d.case_id]) };
    if (f.type === 'case') return { columns: ['Kasus', 'Alat', 'Status', 'Item', 'Departemen', 'Temuan pertama', 'Ditutup', 'Rework'], rows: casesF(f).filter(c => c.first_finding_at.slice(0, 10) >= f.from && c.first_finding_at.slice(0, 10) <= f.to).map(c => [c.case_id, c.asset_name_snapshot, c.status, c.items.length, depts(c), c.first_finding_at.slice(0, 16), c.closed_at.slice(0, 16), c.rework_count]) };
    if (f.type === 'missed') return { columns: ['Tanggal', 'Jadwal', 'Alat', 'PIC terdaftar'], rows: sch.filter(s => s.status === 'MISSED').map(s => [s.date, sl(s.shift_code), asset(s.asset_id).asset_name, personsFor(asset(s.asset_id)).map(p => p.display_name).join(', ')]) };
    return { columns: ['Tanggal', 'Jadwal', 'Alat', 'Status', 'Pemeriksa', 'Waktu submit', 'OK', 'NO OK'], rows: sch.map(s => { const ck = D.ck[s.checklist_id]; return [s.date, sl(s.shift_code), asset(s.asset_id).asset_name, s.status, s.checker, s.submitted_at.slice(0, 16), ck ? ck.details.length - s.nok : '', ck ? s.nok : '']; }) };
  }
  const needAcc = (me, roles) => { if (!me || me.type !== 'ACCOUNT' || (roles && !roles.includes(me.role))) fail('Tidak punya akses'); };

  // ---------- aksi API ----------
  const H = {
    publicInfo: () => ({ installed: true, persons: { PIC: pubP('PIC'), MAINTENANCE: pubP('MAINTENANCE'), UTILITY: pubP('UTILITY') } }),
    install: () => ({ assets: M.assets.length, checkpoints: nCp, persons: M.persons.length, warnings: [] }),
    login: x => {
      const a = M.accounts.find(y => y.username === String(x.username).trim().toLowerCase() && y.active === 'TRUE');
      if (!a || PW[a.account_id] !== x.password) fail('Username atau password salah (demo: admin / spv / head, password demo123)');
      a.last_login_at = now(); const me = { type: 'ACCOUNT', id: a.account_id, role: a.role, name: a.display_name };
      audit(me, 'LOGIN', 'ACCOUNT', a.account_id); return { token: tok(me), me };
    },
    guestLogin: x => { const p = M.persons.find(y => y.person_id === x.person_id && y.role_type === x.role) || fail('Nama tidak ditemukan'); const me = { type: 'GUEST', id: p.person_id, role: x.role, name: p.display_name }; return { token: tok(me), me }; },
    logout: () => ({}),
    changePassword: (x, me) => { needAcc(me); if (PW[me.id] !== x.oldPassword) fail('Password lama salah'); if (String(x.newPassword).length < 6) fail('Password baru minimal 6 karakter'); PW[me.id] = x.newPassword; return {}; },
    lookups: () => { const o = opInfo(); return { opDate: o.op, shift: o.shift, pendingSpv: D.cases.filter(c => c.status === 'MENUNGGU_SPV').length, pendingHead: D.cases.filter(c => c.status === 'MENUNGGU_HEAD').length, dataFrom: D.sch[0].date, dataTo: o.op, assets: M.assets.filter(a => a.active === 'TRUE').map(a => ({ id: a.asset_id, name: a.asset_name })), pics: pubP('PIC'), ready: ready() }; },
    dashboard: f => {
      const gran = f.gran || 'D', single = f.from === f.to, t = now();
      const sch = schF(f.from, f.to, f), cs = casesF(Object.assign({}, f, { status: '' })), act = cs.filter(isActive), items = act.flatMap(c => c.items);
      const closed = cs.filter(c => c.status === 'SELESAI' && c.closed_at.slice(0, 10) >= f.from && c.closed_at.slice(0, 10) <= f.to);
      const a = agg(sch), nk = noks(sch, f);
      const keyOf = d => (gran === 'M' ? d.slice(0, 8) + '01' : gran === 'W' ? monday(d) : d);
      let tFrom = f.from;
      if (single) { if (gran === 'D') tFrom = addD(f.to, -13); else if (gran === 'W') tFrom = addD(monday(f.to), -77); else { const x = P(f.to); x.setDate(1); x.setMonth(x.getMonth() - 11); tFrom = ds(x); } }
      const keys = []; for (let d = tFrom; d <= f.to; d = addD(d, 1)) if (!keys.includes(keyOf(d))) keys.push(keyOf(d));
      const tSch = schF(tFrom, f.to, f);
      const trend = keys.map(k => { const l = tSch.filter(s => keyOf(s.date) === k); return Object.assign({ date: k, nok: noks(l, f).length }, agg(l)); });
      const cnt = {}; nk.forEach(d => { const k = d.ck.asset_name_snapshot + '|' + d.point_name_snapshot; cnt[k] = (cnt[k] || 0) + 1; });
      const top = Object.keys(cnt).map(k => ({ asset: k.split('|')[0], point: k.split('|')[1], n: cnt[k] })).sort((x, y) => y.n - x.n);
      const allItems = cs.flatMap(c => c.items), work = l => avg(l.filter(i => i.completed_at).map(i => hrs(i.started_at, i.completed_at)));
      return {
        period: { from: f.from, to: f.to, generated_at: t }, gran,
        kpi: { assets: M.assets.filter(x => x.active === 'TRUE').length, scheduled: sch.length, done: a.done, compliance: a.compliance, missed: a.missed, nok_events: nk.length, nok_open_items: items.filter(i => i.status !== 'DONE').length,
          cases_perlu: act.filter(c => c.status === 'PERLU_PERBAIKAN').length, cases_sedang: act.filter(c => c.status === 'SEDANG_DIPERBAIKI').length, items_open: items.filter(i => i.status === 'OPEN').length, items_claimed: items.filter(i => i.status === 'CLAIMED').length,
          wait_spv: act.filter(c => c.status === 'MENUNGGU_SPV').length, wait_head: act.filter(c => c.status === 'MENUNGGU_HEAD').length, closed: closed.length },
        trend, shiftComp: ['1', '2', '3'].map(s => Object.assign({ shift: s }, agg(sch.filter(x => x.shift_code === s)))),
        resolution: { avg_case_h: avg(cs.filter(c => c.closed_at).map(ageH)), avg_work_h: work(allItems) },
        repairStatus: { open: items.filter(i => i.status === 'OPEN').length, claimed: items.filter(i => i.status === 'CLAIMED').length, done_waiting: items.filter(i => i.status === 'DONE').length, closed_cases: closed.length },
        oldest: act.filter(c => !f.status || c.status === f.status).sort(byAge).slice(0, 10).map(c => ({ case_id: c.case_id, asset: c.asset_name_snapshot, points: c.items.map(i => i.point_name_snapshot).join(', '), depts: depts(c), age_h: ageH(c), status: c.status })),
        topCp: top.slice(0, 8), recurring: top.filter(x => x.n >= 2),
        picPerf: M.persons.filter(p => p.role_type === 'PIC' && (!f.pic_id || p.person_id === f.pic_id)).map(p => { const l = sch.filter(s => picIds(asset(s.asset_id)).includes(p.person_id)), g = agg(l); return { name: p.display_name, assigned: l.length, covered: g.done, missed: g.missed, coverage: g.compliance }; }).filter(p => p.assigned),
        deptPerf: ['PIC', 'MAINTENANCE', 'UTILITY'].filter(d => !f.dept || d === f.dept).map(d => { const l = allItems.filter(i => i.department === d); return { dept: d, received: l.length, done: l.filter(i => i.status === 'DONE').length, rework: l.reduce((s, i) => s + i.rework_count, 0), open_now: items.filter(i => i.department === d && i.status !== 'DONE').length, avg_work_h: work(l) }; })
      };
    },
    worklist: (x, me) => {
      const o = opInfo();
      const mine = a => a.active === 'TRUE' && (me.role === 'UTILITY' ? a.checker_role === 'UTILITY' : a.checker_role === 'PIC' && picIds(a).includes(me.id));
      return { ready: true, opDate: o.op, shift: o.shift, items: D.sch.filter(s => s.date === o.op && (s.shift_code === '' || s.shift_code === o.shift) && mine(asset(s.asset_id))).map(s => ({ schedule_id: s.schedule_id, asset_id: s.asset_id, asset_name: asset(s.asset_id).asset_name, shift_code: s.shift_code, points: cps(asset(s.asset_id)).length, close_at: s.close_at, done: s.status === 'DONE' })) };
    },
    checklistForm: x => {
      const s = D.sch.find(y => y.schedule_id === x.schedule_id) || fail('Jadwal tidak ditemukan');
      if (s.status !== 'OPEN') fail('Jadwal ini sudah diperiksa / ditutup');
      const a = asset(s.asset_id), c = D.cases.find(y => y.asset_id === a.asset_id && isActive(y));
      return { schedule_id: s.schedule_id, asset_id: a.asset_id, asset_name: a.asset_name, shift_code: s.shift_code, close_at: s.close_at, case_id: c ? c.case_id : '', points: cps(a).map(cp => ({ checkpoint_id: cp.checkpoint_id, point_name: cp.point_name, target_label: cp.target_label, in_repair: !!(c && c.items.some(i => i.checkpoint_id === cp.checkpoint_id && i.status !== 'DONE')) })) };
    },
    submitChecklist: (x, me) => {
      const s = D.sch.find(y => y.schedule_id === x.schedule_id) || fail('Jadwal tidak ditemukan');
      if (s.status !== 'OPEN') fail('Jadwal ini sudah diperiksa');
      const r = submitCk(s, x.results.map(y => Object.assign({}, y, { photo: y.photo ? photo(y.photo) : '' })), me.name, now());
      audit(me, 'SUBMIT_CHECKLIST', 'CHECKLIST', s.checklist_id, r.nok + ' NO OK'); return r;
    },
    todaySchedules: x => { const date = x.date || opInfo().op; return { date, ready: ready(), rows: D.sch.filter(s => s.date === date).map(s => Object.assign({ asset_name: asset(s.asset_id).asset_name, pics: personsFor(asset(s.asset_id)).map(p => p.display_name).join(', ') }, s)) }; },
    checklistDetail: x => { const ck = D.ck[x.checklist_id] || fail('Checklist tidak ditemukan'); return { header: ck, details: ck.details }; },
    repairQueue: (x, me) => {
      const rows = [];
      D.cases.filter(c => c.status === 'PERLU_PERBAIKAN' || c.status === 'SEDANG_DIPERBAIKI').sort(byAge).forEach(c => c.items.filter(i => i.department === me.role && i.status !== 'DONE').forEach(i => {
        const last = i.occurrences[i.occurrences.length - 1];
        rows.push({ case_id: c.case_id, asset_name: c.asset_name_snapshot, age_h: ageH(c), case_item_id: i.case_item_id, point_name: i.point_name_snapshot, department: i.department, status: i.status, found_at: i.occurrences[0].recorded_at, occurrence: i.occurrence_count, claimed_by: i.claimed_by_name_snapshot, finding_note: last.note, reject_note: i.last_reject_note, rework: i.rework_count, before_photo: last.photo, mine: i.claimed_by === me.id, started_at: i.started_at });
      }));
      return { rows };
    },
    claimItem: (x, me) => {
      const { c, i } = itemOf(x.case_item_id);
      if (me.type !== 'GUEST' || me.role !== i.department) fail('Item ini bukan untuk departemen Anda');
      if (i.status !== 'OPEN') fail('Item sudah diambil teknisi lain');
      claim(c, i, me.id, me.name, now()); return { case_status: c.status };
    },
    releaseItem: (x, me) => { const { c, i } = itemOf(x.case_item_id); if (i.status !== 'CLAIMED') fail('Item tidak sedang dikerjakan'); release(c, i, me.name, now()); audit(me, 'RELEASE', 'CASE_ITEM', i.case_item_id); return { case_status: c.status }; },
    completeItem: (x, me) => {
      const { c, i } = itemOf(x.case_item_id);
      if (i.status !== 'CLAIMED' || i.claimed_by !== me.id) fail('Item ini tidak sedang Anda kerjakan');
      if (!String(x.action || '').trim() || !x.photo) fail('Tindakan & foto sesudah wajib');
      complete(c, i, x.action, photo(x.photo), now()); return { case_status: c.status };
    },
    caseList: f => {
      const q = String(f.q || '').toLowerCase(), size = 20, page = f.page || 1;
      const l = casesF(f).filter(c => (!f.from || c.first_finding_at.slice(0, 10) >= f.from) && (!f.to || c.first_finding_at.slice(0, 10) <= f.to) && (!q || (c.case_id + ' ' + c.asset_name_snapshot).toLowerCase().includes(q)))
        .sort((a, b) => (isActive(b) - isActive(a)) || (isActive(a) ? byAge(a, b) : (a.closed_at < b.closed_at ? 1 : -1)));
      return { total: l.length, page, size, rows: l.slice((page - 1) * size, page * size).map(c => ({ case_id: c.case_id, asset_name_snapshot: c.asset_name_snapshot, status: c.status, done: c.items.filter(i => i.status === 'DONE').length, items: c.items.length, depts: depts(c), first_finding_at: c.first_finding_at, age_h: ageH(c), rework_count: c.rework_count })) };
    },
    caseDetail: (x, me) => {
      const c = caseOf(x.case_id), work = c.status === 'PERLU_PERBAIKAN' || c.status === 'SEDANG_DIPERBAIKI';
      const level = c.status === 'MENUNGGU_SPV' ? 'SPV' : c.status === 'MENUNGGU_HEAD' ? 'HEAD' : '';
      return { case: c, level, approvals: c.approvals, logs: c.logs, can_decide: !!level && me.type === 'ACCOUNT' && (me.role === 'ADMIN' || me.role === level), can_release: work && me.type === 'ACCOUNT' && (me.role === 'ADMIN' || me.role === 'SPV'),
        items: c.items.map(i => Object.assign({ can_claim: work && me.type === 'GUEST' && me.role === i.department && i.status === 'OPEN', can_complete: i.status === 'CLAIMED' && i.claimed_by === me.id }, i)) };
    },
    decide: (x, me) => {
      needAcc(me, ['ADMIN', x.level]);
      const c = caseOf(x.case_id);
      if (c.status !== 'MENUNGGU_' + x.level || c.cycle_no !== x.cycle_no) fail('Status kasus sudah berubah. Muat ulang.');
      if (x.decision === 'REJECT' && (!x.note || !x.item_ids.length)) fail('Alasan & item rework wajib');
      decide(c, x.level, x.decision, { name: me.name, role: me.role }, now(), x.note, x.item_ids || []);
      audit(me, 'APPROVAL_' + x.decision, 'CASE', c.case_id, x.note); return { status: c.status };
    },
    approvalQueue: (x, me) => ({ rows: D.cases.filter(c => (me.role !== 'HEAD' && c.status === 'MENUNGGU_SPV') || (me.role !== 'SPV' && c.status === 'MENUNGGU_HEAD')).sort(byAge).map(c => ({ case_id: c.case_id, asset_name_snapshot: c.asset_name_snapshot, status: c.status, items: c.items.length, technicians: techs(c), first_finding_at: c.first_finding_at, age_h: ageH(c), rework: c.rework_count })) }),
    kanban: x => {
      const date = x.date || opInfo().op, sch = D.sch.filter(s => s.date === date);
      const sc = s => ({ type: 'schedule', checklist_id: s.checklist_id, asset_name: asset(s.asset_id).asset_name, asset_id: s.asset_id, date: s.date, shift: s.shift_code, at: s.submitted_at, who: s.checker || personsFor(asset(s.asset_id)).map(p => p.display_name).join(', '), close_at: s.close_at });
      const cc = c => ({ type: 'case', id: c.case_id, asset_name: c.asset_name_snapshot, asset_id: c.asset_id, age_h: ageH(c), points: c.items.length, depts: depts(c), who: techs(c), rework: c.rework_count });
      const col = st => D.cases.filter(c => c.status === st).sort(byAge).map(cc);
      return { date, missed: sch.filter(s => s.status === 'MISSED').length, columns: [
        { key: 'BELUM', title: 'Belum dicek', cards: sch.filter(s => s.status === 'OPEN').map(sc) }, { key: 'CEK_OK', title: 'Sudah dicek', cards: sch.filter(s => s.status === 'DONE').map(sc) },
        { key: 'PERLU_PERBAIKAN', title: 'Perlu Perbaikan', cards: col('PERLU_PERBAIKAN') }, { key: 'SEDANG_DIPERBAIKI', title: 'Sedang Diperbaiki', cards: col('SEDANG_DIPERBAIKI') },
        { key: 'MENUNGGU_SPV', title: 'Menunggu SPV', cards: col('MENUNGGU_SPV') }, { key: 'MENUNGGU_HEAD', title: 'Menunggu Head', cards: col('MENUNGGU_HEAD') },
        { key: 'SELESAI', title: 'Selesai (7 hari)', cards: D.cases.filter(c => c.status === 'SELESAI' && c.closed_at >= addD(date, -7)).sort((a, b) => (a.closed_at < b.closed_at ? 1 : -1)).map(cc) }] };
    },
    report: f => { const r = reportData(f), size = 50, page = f.page || 1; return { types: REP_TYPES, title: REP_TYPES[f.type] || REP_TYPES.checklist, period: f.from + ' s.d. ' + f.to, total: r.rows.length, columns: r.columns, rows: r.rows.slice((page - 1) * size, page * size), page, size }; },
    exportReport: f => {
      const r = reportData(f), q = v => '"' + String(v).replace(/"/g, '""') + '"';
      const csv = '﻿' + [r.columns].concat(r.rows).map(row => row.map(q).join(',')).join('\r\n');
      return { name: 'laporan-' + (f.type || 'checklist') + '_' + f.from + '_' + f.to + '.csv', mime: 'text/csv', data: btoa(unescape(encodeURIComponent(csv))) };
    },
    masterData: (x, me) => { needAcc(me, ['ADMIN']); return { ready: ready(), activated: true, assets: M.assets, persons: M.persons, accounts: M.accounts }; },
    saveMapping: (x, me) => { needAcc(me, ['ADMIN']); x.changes.forEach(ch => M.assets.forEach(a => a.checkpoints.forEach(c => { if (c.checkpoint_id === ch.checkpoint_id) c.repair_department = ch.dept; }))); audit(me, 'SAVE_MAPPING', 'CHECKPOINT', x.changes.length + ' item'); return { changed: x.changes.length, ready: ready() }; },
    saveAsset: (x, me) => {
      needAcc(me, ['ADMIN']);
      const v = x.asset; if (!String(v.asset_name).trim()) fail('Nama alat wajib diisi');
      let a = v.asset_id && asset(v.asset_id);
      if (!a) M.assets.push(a = { asset_id: 'A' + String(M.assets.length + 1).padStart(3, '0'), source_no: '', checkpoints: [] });
      Object.assign(a, { asset_name: v.asset_name.trim(), schedule_type: v.schedule_type, checker_role: v.checker_role, pic_group: v.pic_group, pic_ids: v.pic_ids.join(','), active: v.active ? 'TRUE' : 'FALSE' });
      a.checkpoints = x.checkpoints.filter(c => c.checkpoint_id || String(c.point_name).trim()).map((c, i) => Object.assign({}, c, { checkpoint_id: c.checkpoint_id || 'CP' + String(++nCp).padStart(3, '0'), display_order: i + 1, active: c.active === 'FALSE' ? 'FALSE' : 'TRUE' }));
      audit(me, 'SAVE_ASSET', 'ASSET', a.asset_id, '', { asset_name: a.asset_name, points: a.checkpoints.length }); return { asset_id: a.asset_id };
    },
    savePerson: (x, me) => {
      needAcc(me, ['ADMIN']); if (!String(x.display_name).trim()) fail('Nama wajib diisi');
      let p = M.persons.find(y => y.person_id === x.person_id);
      if (!p) M.persons.push(p = { person_id: 'P' + String(M.persons.length + 1).padStart(3, '0') });
      Object.assign(p, { display_name: x.display_name.trim(), role_type: x.role_type, active: x.active ? 'TRUE' : 'FALSE' }); audit(me, 'SAVE_PERSON', 'PERSON', p.person_id, '', p); return { person_id: p.person_id };
    },
    saveAccount: (x, me) => {
      needAcc(me, ['ADMIN']);
      const u = String(x.username).trim().toLowerCase(); if (!u || !String(x.display_name).trim()) fail('Username & nama wajib diisi');
      if (M.accounts.some(a => a.username === u && a.account_id !== x.account_id)) fail('Username sudah dipakai');
      let a = M.accounts.find(y => y.account_id === x.account_id);
      if (!a) { if (String(x.password).length < 6) fail('Password minimal 6 karakter'); M.accounts.push(a = { account_id: 'AC' + (M.accounts.length + 1), last_login_at: '' }); PW[a.account_id] = x.password; }
      Object.assign(a, { username: u, display_name: x.display_name.trim(), role: x.role, active: x.active ? 'TRUE' : 'FALSE' }); audit(me, 'SAVE_ACCOUNT', 'ACCOUNT', a.account_id, '', { username: u, role: x.role }); return {};
    },
    resetPassword: (x, me) => { needAcc(me, ['ADMIN']); if (String(x.password).length < 6) fail('Password minimal 6 karakter'); PW[x.account_id] = x.password; audit(me, 'RESET_PASSWORD', 'ACCOUNT', x.account_id); return {}; },
    auditLog: (x, me) => { needAcc(me, ['ADMIN']); return D.audit.slice(-300).reverse(); },
    settings: (x, me) => { needAcc(me, ['ADMIN']); return { values: SET, token_masked: TOKEN ? TOKEN.slice(0, 3) + '••••' + TOKEN.slice(-2) : '', root_folder_url: 'https://drive.google.com/', activated_at: D.sch[0].date + ' 07:00:00' }; },
    saveSettings: (x, me) => { needAcc(me, ['ADMIN']); Object.assign(SET, x.values); audit(me, 'SAVE_SETTINGS', 'SETTINGS', '-'); return {}; },
    saveFonnteToken: (x, me) => { needAcc(me, ['ADMIN']); if (!String(x.token).trim()) fail('Token kosong'); TOKEN = x.token.trim(); return { token_masked: TOKEN.slice(0, 3) + '••••' + TOKEN.slice(-2) }; },
    testFonnte: () => { D.notif.push({ created_at: now(), event_type: 'TEST', payload_summary: 'Pesan tes (demo)', status: 'SENT', attempt_count: 1, provider_response: '{"status":true}' }); return { device_ok: true, device: { device_status: 'connect (demo)' }, device_text: '', send_ok: true, send_text: '' }; },
    backupNow: () => { const name = 'Backup_SaranaKerja_' + now().replace(/[ :]/g, '-').slice(0, 16); D.backup.push({ created_at: now(), type: 'MANUAL', file_name: name, file_id: 'demo', status: 'OK', message: 'Selesai (demo)', trashed_at: '' }); return { file_name: name }; },
    retryNotif: () => { const l = D.notif.filter(n => n.status === 'FAILED'); l.forEach(n => { n.status = 'SENT'; n.attempt_count++; n.provider_response = '{"status":true,"detail":"resent"}'; }); return { sent: l.length, tried: l.length }; },
    notifLog: () => D.notif.slice(-200).reverse(),
    backupLog: () => D.backup.slice(-60).reverse(),
    photo: x => { const p = D.photos[x.id] || fail('Foto tidak ditemukan'); return typeof p === 'string' ? p : svg(p[0], p[1], x.id); }
  };
  const mk = (s, f) => ({ withSuccessHandler: x => mk(x, f), withFailureHandler: x => mk(s, x),
    api: (token, action, args) => setTimeout(() => {
      let r;
      try {
        const me = token ? JSON.parse(decodeURIComponent(escape(atob(token.slice(5))))) : null;
        if (!H[action]) fail('Aksi tidak dikenal: ' + action);
        r = { success: true, data: H[action](args || {}, me) };
      } catch (e) { r = { success: false, message: e.message }; }
      if (s) s(JSON.parse(JSON.stringify(r)));
    }, 120) });
  window.google = { script: { run: mk(null, null) } };
  console.info('[DEMO] Backend tiruan aktif — login admin/spv/head, password demo123');
})();
if (!(window.google && google.script && google.script.run)) {
  // Content-Type text/plain → tanpa preflight CORS; Apps Script membalas JSON dari doPost.
  const mk = (s, f) => ({ withSuccessHandler: x => mk(x, f), withFailureHandler: x => mk(s, x),
    api: (...a) => fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(a), redirect: 'follow' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(r => s && s(r)).catch(e => f && f(e)) });
  window.google = { script: { run: mk(null, null) } };
}

const BOOT = { installed: true, caseParam: (/^CASE-d{1,8}$/.exec(new URLSearchParams(location.search).get('case') || '') || [''])[0] }; // di GAS diisi doGet; di sini dicek ke server saat mulai
const S = { navSeq: 0, forceFresh: false, token: null, me: null, look: null, page: '', dirty: false, charts: [], photos: {}, ck: null };
const ROLE_LABEL = { ADMIN: 'Admin', SPV: 'SPV', HEAD: 'Head', PIC: 'PIC (tamu)', MAINTENANCE: 'Maintenance (tamu)', UTILITY: 'Utility (tamu)' };
const CASE_ST = { PERLU_PERBAIKAN: ['Perlu Perbaikan', 'c-bad'], SEDANG_DIPERBAIKI: ['Sedang Diperbaiki', 'c-warn'], MENUNGGU_SPV: ['Menunggu Approval SPV', 'c-info'], MENUNGGU_HEAD: ['Menunggu Approval Head', 'c-info'], SELESAI: ['Selesai', 'c-ok'] };
const SCH_ST = { OPEN: ['Belum Diperiksa', 'c-warn'], DONE: ['Selesai', 'c-ok'], MISSED: ['Tidak Dikerjakan', 'c-bad'], BATAL: ['Batal', ''] };
const ITEM_ST = { OPEN: ['Belum diambil', 'c-bad'], CLAIMED: ['Sedang dikerjakan', 'c-warn'], DONE: ['Selesai diperbaiki', 'c-ok'] };
const DEPTS = ['PIC', 'MAINTENANCE', 'UTILITY'];
const MENU = [
  { sec: 'Monitoring' },
  { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', roles: ['ADMIN', 'SPV', 'HEAD'] },
  { id: 'kanban', label: 'Monitoring Kanban', icon: 'columns-3', roles: ['ADMIN', 'SPV', 'HEAD'] },
  { sec: 'Operasional' },
  { id: 'checklist', label: 'Checklist', icon: 'clipboard-check', roles: ['ADMIN', 'SPV', 'HEAD', 'PIC', 'UTILITY'] },
  { id: 'perbaikan', label: 'Perbaikan', labelLogged: 'Riwayat Perbaikan', icon: 'wrench', roles: ['ADMIN', 'SPV', 'HEAD', 'PIC', 'MAINTENANCE', 'UTILITY'] },
  { id: 'approval', label: 'Approval', icon: 'badge-check', roles: ['ADMIN', 'SPV', 'HEAD'], badge: true },
  { sec: 'Laporan' },
  { id: 'laporan', label: 'Laporan', icon: 'file-text', roles: ['ADMIN', 'SPV', 'HEAD'] },
  { sec: 'Admin' },
  { id: 'master', label: 'Master Data', icon: 'database', roles: ['ADMIN'] },
  { id: 'pengaturan', label: 'Pengaturan', icon: 'settings', roles: ['ADMIN'] }
];

// ---------- util ----------
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const h = v => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const fDate = d => d ? (+d.slice(8, 10)) + ' ' + MONTHS[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4) : '';
const fTs = t => t ? fDate(t.slice(0, 10)) + ' ' + t.slice(11, 16) : '';
const fAge = hrs => hrs === '' || hrs === null || hrs === undefined ? '' : (hrs < 24 ? Math.round(hrs) + ' jam' : Math.floor(hrs / 24) + ' hr ' + Math.round(hrs % 24) + ' jam');
const shiftLbl = s => s ? 'Shift ' + s : 'Harian';
const chip = (map, k) => { const m = map[k] || [k, '']; return '<span class="chip ' + m[1] + '">' + h(m[0]) + '</span>'; };
const deptChip = d => d ? '<span class="chip c-steel">' + h(d) + '</span>' : '<span class="chip c-warn">Belum dipetakan</span>';
const icons = () => { try { lucide.createIcons(); } catch (e) { /* CDN ikon diblokir: label teks tetap tampil */ } };
const menuLabel = m => (m.labelLogged && S.me && S.me.type === 'ACCOUNT' ? m.labelLogged : m.label);
const opt = (v, l, sel) => '<option value="' + h(v) + '"' + (String(sel) === String(v) ? ' selected' : '') + '>' + h(l) + '</option>';
/** <select data-search> → kotak isian yang bisa diketik untuk mencari lalu dipilih.
 *  Select asli tetap ada (tersembunyi), jadi .value & event 'change' tetap dipakai kode halaman. */
function enhanceSearch(root) {
  $$('select[data-search]', root).forEach(sel => {
    if (sel.dataset.enh) return; sel.dataset.enh = '1';
    const opts = Array.from(sel.options).map(o => ({ v: o.value, l: o.textContent }));
    const all = opts.find(o => o.v === '');
    const wrap = document.createElement('div'); wrap.className = 'cbx';
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel); sel.hidden = true;
    const inp = document.createElement('input');
    inp.className = 'inp cbx-in'; inp.type = 'text'; inp.autocomplete = 'off'; inp.placeholder = all ? all.l : 'Pilih'; inp.title = 'Ketik untuk mencari, lalu pilih';
    if (sel.id) inp.setAttribute('aria-label', sel.closest('label') ? sel.closest('label').firstChild.textContent : sel.id);
    const list = document.createElement('div'); list.className = 'cbx-list'; list.hidden = true;
    wrap.insertBefore(inp, sel); wrap.appendChild(list);
    const label = () => { const o = opts.find(x => x.v === sel.value); return o && o.v !== '' ? o.l : ''; };
    inp.value = label();
    let act = 0, shown = [];
    const draw = () => {
      const q = inp.value.trim().toLowerCase();
      shown = opts.filter(o => o.v === '' || !q || o.l.toLowerCase().indexOf(q) >= 0).slice(0, 150);
      act = Math.min(act, shown.length - 1);
      list.innerHTML = shown.length ? shown.map((o, i) => '<button type="button" tabindex="-1" class="' + (i === act ? 'act' : '') + '" data-i="' + i + '">' + h(o.l) + '</button>').join('') : '<div class="none">Tidak ditemukan</div>';
      list.hidden = false;
    };
    const pick = o => { list.hidden = true; inp.value = o.v === '' ? '' : o.l; if (sel.value !== o.v) { sel.value = o.v; sel.dispatchEvent(new Event('change')); } };
    inp.onfocus = () => { inp.select(); act = 0; draw(); };
    inp.oninput = () => { act = 1; draw(); };
    inp.onkeydown = e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, Math.min(shown.length - 1, act + (e.key === 'ArrowDown' ? 1 : -1))); draw(); const b = list.children[act]; if (b && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[act]) pick(shown[act]); inp.blur(); }
      else if (e.key === 'Escape') { inp.blur(); }
    };
    inp.onblur = () => setTimeout(() => { list.hidden = true; inp.value = label(); }, 150);
    list.onmousedown = e => e.preventDefault(); // jangan hilangkan fokus sebelum klik terpilih
    list.onclick = e => { const b = e.target.closest('button'); if (b) { pick(shown[+b.dataset.i]); inp.blur(); } };
  });
}
/** Filter langsung diterapkan saat berubah (tanpa tombol Terapkan). Kotak teks: tunggu 0,5 dtk setelah berhenti mengetik. */
function autoApply(root, fn) {
  let t;
  $$('select, input', root).forEach(el => {
    if (el.classList.contains('cbx-in')) return;
    if (el.type === 'text' || el.type === 'search') el.oninput = () => { clearTimeout(t); t = setTimeout(() => { S.refocus = el.id; fn(); }, 500); };
    else el.onchange = fn;
  });
}
let busy = 0;
function progress(d) { busy += d; const p = $('#progress'); p.style.width = busy > 0 ? '70%' : '100%'; if (busy <= 0) setTimeout(() => { if (busy <= 0) p.style.width = '0'; }, 300); }

// Aksi baca (tanpa efek samping). Hasilnya di-cache sebentar di browser supaya pindah menu terasa instan;
// cache dikosongkan setiap ada aksi tulis berhasil, dan tombol refresh memaksa ambil data baru.
const READ = { dashboard: 1, kanban: 1, report: 1, caseList: 1, todaySchedules: 1, checklistDetail: 1, caseDetail: 1, approvalQueue: 1, repairQueue: 1, worklist: 1, lookups: 1, masterData: 1, auditLog: 1, notifLog: 1, backupLog: 1, settings: 1, photo: 1 };
const PAGE_LOAD = { dashboard: 1, kanban: 1, report: 1, caseList: 1, todaySchedules: 1, approvalQueue: 1, repairQueue: 1, worklist: 1, masterData: 1, auditLog: 1, settings: 1 };
const CC = {}; const CC_TTL = 30000;
function staleErr() { const e = new Error('stale'); e.stale = true; return e; }
function call(action, args) {
  args = args || {};
  const nav = S.navSeq, key = READ[action] ? action + '|' + JSON.stringify(args) : '';
  if (key && !S.forceFresh && CC[key] && Date.now() - CC[key].t < CC_TTL) return Promise.resolve(CC[key].d);
  if (key && S.forceFresh && action !== 'photo') args = Object.assign({ _fresh: true }, args);
  progress(1);
  return new Promise((res, rej) => {
    google.script.run.withSuccessHandler(r => {
      progress(-1);
      if (r && r.success) {
        if (key) CC[key] = { t: Date.now(), d: r.data };
        else Object.keys(CC).forEach(k => { if (!k.startsWith('photo|')) delete CC[k]; }); // aksi tulis → data lama tidak dipakai lagi
        // respons halaman yang sudah ditinggalkan (user sudah pindah menu) diabaikan
        if (PAGE_LOAD[action] && nav !== S.navSeq) return rej(staleErr());
        return res(r.data);
      }
      if (r && r.code === 'AUTH' && S.token) { toast(r.message, 'err'); App.logout(true); }
      rej(new Error(r ? r.message : 'Gagal memproses'));
    }).withFailureHandler(e => { progress(-1); rej(new Error('Koneksi ke server gagal. Periksa internet lalu coba lagi. (' + (e && e.message || e) + ')')); })
      .api(S.token, action, args);
  });
}
function toast(msg, type) {
  const el = document.createElement('div'); el.className = 'toast ' + (type || ''); el.textContent = msg;
  $('#toast').appendChild(el); setTimeout(() => el.remove(), type === 'err' ? 6000 : 3500);
}
function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }

// ---------- modal ----------
function modal(title, body, foot, cls) {
  const ov = document.createElement('div');
  ov.className = 'overlay' + (cls === 'drawer' ? ' drawer' : '');
  ov.innerHTML = '<div class="modal ' + (cls || '') + '" role="dialog" aria-modal="true"><div class="mhead"><h3>' + h(title) + '</h3><button class="icon-btn" aria-label="Tutup" data-close><i data-lucide="x"></i></button></div><div class="mbody">' + body + '</div>' + (foot ? '<div class="mfoot">' + foot + '</div>' : '') + '</div>';
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) ov.remove(); });
  document.body.appendChild(ov); icons();
  return ov;
}
function confirmDlg(title, html, okLabel, danger) {
  return new Promise(res => {
    const ov = modal(title, html, '<button class="btn" data-close>Batal</button><button class="btn ' + (danger ? 'danger' : 'pri') + '" id="cfOk">' + h(okLabel || 'Ya, lanjutkan') + '</button>');
    $('#cfOk', ov).onclick = () => { ov.remove(); res(true); };
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) res(false); });
  });
}
async function photoUrl(id) { if (!S.photos[id]) S.photos[id] = await call('photo', { id }); return S.photos[id]; }
async function hydrate(el) {
  for (const b of $$('[data-photo]', el)) {
    const id = b.getAttribute('data-photo'); if (!id) continue;
    try { const u = await photoUrl(id); b.style.backgroundImage = 'url("' + u + '")'; b.textContent = ''; } catch (e) { b.textContent = 'Gagal muat'; }
  }
}
function thumb(id, label) { return id ? '<button class="thumb" data-photo="' + h(id) + '" onclick="App.viewPhoto(\'' + h(id) + '\')" aria-label="' + h(label || 'Lihat foto') + '">Memuat…</button>' : ''; }
function compress(file, maxKb) {
  return new Promise((res, rej) => {
    if (!/^image\//.test(file.type)) return rej(new Error('File harus berupa gambar'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.naturalWidth, hh = img.naturalHeight; const m = 1280;
      if (Math.max(w, hh) > m) { const k = m / Math.max(w, hh); w = Math.round(w * k); hh = Math.round(hh * k); }
      const c = document.createElement('canvas'); c.width = w; c.height = hh; c.getContext('2d').drawImage(img, 0, 0, w, hh);
      let q = 0.78, d = c.toDataURL('image/jpeg', q);
      while (d.length * 0.75 > maxKb * 1024 && q > 0.3) { q -= 0.12; d = c.toDataURL('image/jpeg', q); }
      URL.revokeObjectURL(url); res(d);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Gambar tidak bisa dibaca')); };
    img.src = url;
  });
}
function download(file) {
  const bin = atob(file.data), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([arr], { type: file.mime })); a.download = file.name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function destroyCharts() { S.charts.forEach(c => { try { c.destroy(); } catch (e) {} }); S.charts = []; }
function chart(id, cfg) {
  if (typeof Chart === 'undefined') { const el = document.getElementById(id); if (el) el.parentNode.innerHTML = '<div class="empty">Grafik tidak dapat dimuat (akses CDN Chart.js diblokir).</div>'; return; }
  const el = document.getElementById(id); if (!el) return;
  S.charts.push(new Chart(el, cfg));
}

// ---------- App ----------
const App = {
  async init() {
    window.addEventListener('online', () => { $('#offline').hidden = true; });
    window.addEventListener('offline', () => { $('#offline').hidden = false; });
    window.addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
    if (typeof Chart !== 'undefined') { Chart.defaults.font.family = "'IBM Plex Sans',system-ui,sans-serif"; Chart.defaults.color = '#5B6775'; }
    $('#boot').hidden = true;
    if (!BOOT.installed) { $('#install').hidden = false; icons(); return; }
    S.token = ss('sk_token'); const me = ss('sk_me');
    if (S.token && me) { try { S.me = JSON.parse(me); return App.enter(); } catch (e) {} }
    App.showLogin();
  },
  showLogin() { $('#app').hidden = true; $('#login').hidden = false; icons(); },
  async install() {
    const btn = $('#insBtn'); btn.disabled = true; btn.textContent = 'Menginstal… (bisa 1–2 menit)';
    try {
      const r = await call('install', { fileUrl: $('#insFile').value, displayName: $('#insName').value, username: $('#insUser').value, password: $('#insPass').value });
      $('#insOut').innerHTML = '<div class="notice info">Instalasi selesai: <b>' + r.assets + ' alat</b>, <b>' + r.checkpoints + ' checkpoint</b>, <b>' + r.persons + ' PIC</b>.' + (r.warnings.length ? '<br>Catatan data: ' + r.warnings.map(h).join('<br>') : '') + '<br>Langkah berikut: login Admin → Master Data → isi mapping departemen & nama teknisi.</div>';
      BOOT.installed = true;
      setTimeout(() => { $('#install').hidden = true; App.showLogin(); }, 2500);
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; btn.textContent = 'Instal Sekarang'; }
  },
  async login(ev) {
    ev.preventDefault(); const b = $('#lgBtn'); b.disabled = true;
    try { const r = await call('login', { username: $('#lgUser').value, password: $('#lgPass').value }); App.setSession(r); }
    catch (e) { toast(e.message, 'err'); } finally { b.disabled = false; }
  },
  async pickGuest(role) {
    let info;
    try { info = await call('publicInfo'); } catch (e) { return toast(e.message, 'err'); }
    const list = (info.persons[role] || []);
    const body = list.length
      ? '<input class="inp" id="gSearch" placeholder="Cari nama…" style="width:100%"><div id="gList" style="display:flex;flex-direction:column;gap:6px;max-height:55vh;overflow:auto">' +
        list.map(p => '<button class="btn guest-btn" style="justify-content:flex-start;margin:0" data-name="' + h(p.name.toLowerCase()) + '" data-id="' + h(p.id) + '">' + h(p.name) + '</button>').join('') + '</div>'
      : '<div class="empty">Belum ada nama aktif untuk role ' + h(role) + '. Hubungi Admin.</div>';
    const ov = modal('Pilih nama — ' + ROLE_LABEL[role], body);
    const s = $('#gSearch', ov);
    if (s) { s.focus(); s.oninput = () => $$('#gList button', ov).forEach(b => { b.hidden = b.dataset.name.indexOf(s.value.toLowerCase()) < 0; }); }
    $$('#gList button', ov).forEach(b => b.onclick = async () => {
      try { const r = await call('guestLogin', { role, person_id: b.dataset.id }); ov.remove(); App.setSession(r); } catch (e) { toast(e.message, 'err'); }
    });
  },
  setSession(r) { S.token = r.token; S.me = r.me; ss('sk_token', r.token); ss('sk_me', JSON.stringify(r.me)); App.enter(); },
  async logout(silent) {
    if (!silent && S.dirty && !(await confirmDlg('Keluar?', 'Checklist yang belum dikirim akan hilang.', 'Keluar', true))) return;
    if (!silent) call('logout').catch(() => {});
    Object.keys(CC).forEach(k => delete CC[k]); S.look = null; S.photos = {};
    S.token = null; S.me = null; S.dirty = false; ss('sk_token', null); ss('sk_me', null); destroyCharts();
    App.showLogin();
  },
  enter() {
    $('#login').hidden = true; $('#app').hidden = false;
    $('#meName').textContent = S.me.name; $('#meRole').textContent = ROLE_LABEL[S.me.role];
    $('#pwBtn').hidden = S.me.type !== 'ACCOUNT';
    const logged = S.me.type === 'ACCOUNT';
    $('#bellBtn').hidden = !logged;
    App.renderNav();
    if (logged) App.refreshLook();
    const first = MENU.find(m => m.id && m.roles.includes(S.me.role));
    App.go(first.id, true);
    if (BOOT.caseParam) { App.openCase(BOOT.caseParam); BOOT.caseParam = ''; }
  },
  async refreshLook() {
    try {
      S.look = await call('lookups');
      $('#periodPill').textContent = 'Hari operasional ' + fDate(S.look.opDate) + ' · Shift ' + S.look.shift;
      const n = S.me.role === 'SPV' ? S.look.pendingSpv : S.me.role === 'HEAD' ? S.look.pendingHead : S.look.pendingSpv + S.look.pendingHead;
      $('#bellDot').hidden = !n; $('#bellDot').textContent = n;
      const b = $('#navBadge'); if (b) { b.hidden = !n; b.textContent = n; }
      App.dataLine();
    } catch (e) { /* abaikan */ }
  },
  renderNav() {
    let html = '', pendingSec = '';
    MENU.forEach(m => {
      if (m.sec) { pendingSec = '<div class="nav-sec">' + h(m.sec) + '</div>'; return; }
      if (!m.roles.includes(S.me.role)) return;
      html += pendingSec; pendingSec = '';
      html += '<button class="nav-in" data-page="' + m.id + '" onclick="App.go(\'' + m.id + '\')"><i data-lucide="' + m.icon + '"></i><span>' + h(menuLabel(m)) + '</span>' + (m.badge ? '<span class="badge" id="navBadge" hidden></span>' : '') + '</button>';
    });
    $('#nav').innerHTML = html; icons();
  },
  toggleMenu(force) { $('#sidebar').classList.toggle('open', force); },
  async go(page, skipGuard) {
    if (!skipGuard && S.dirty && !(await confirmDlg('Tinggalkan checklist?', 'Hasil pemeriksaan yang belum dikirim akan hilang (tidak ada draft).', 'Tinggalkan', true))) return;
    S.dirty = false; S.ck = null;
    const m = MENU.find(x => x.id === page);
    if (!S.me || !m || !m.roles.includes(S.me.role)) return;
    S.page = page;
    const seq = ++S.navSeq;
    $$('.nav-in').forEach(b => b.classList.toggle('on', b.dataset.page === page));
    $('#pageTitle').textContent = menuLabel(m);
    App.toggleMenu(false); destroyCharts();
    const v = $('#view'); v.innerHTML = '<div class="empty">Memuat…</div>';
    try { await Pages[page](v); } catch (e) {
      if (e.stale || seq !== S.navSeq) return; // halaman sudah ditinggalkan: jangan timpa halaman baru dengan error
      v.innerHTML = '<div class="panel"><div class="empty">' + h(e.message) + '<br><button class="btn mt" onclick="App.go(\'' + page + '\', true)"><i data-lucide="refresh-cw"></i> Coba lagi</button></div></div>';
    }
    if (seq !== S.navSeq) return;
    enhanceSearch(v); icons();
    if (S.refocus) { const el = document.getElementById(S.refocus); S.refocus = null; if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch (e) {} } }
    S.loadedAt = new Date(); App.dataLine();
    if (S.me && S.me.type === 'ACCOUNT' && page !== 'dashboard') App.refreshLook();
  },
  /** Tombol refresh topbar: ambil ulang data halaman aktif + lookup (badge, rentang data). */
  async refresh() {
    const b = $('#refreshBtn'); b.disabled = true;
    S.forceFresh = true; S.photos = {};
    try { if (S.me.type === 'ACCOUNT') await App.refreshLook(); await App.go(S.page); } finally { S.forceFresh = false; b.disabled = false; }
  },
  dataLine() {
    const t = S.loadedAt ? String(S.loadedAt.getHours()).padStart(2, '0') + ':' + String(S.loadedAt.getMinutes()).padStart(2, '0') : '';
    const L = S.me && S.me.type === 'ACCOUNT' ? S.look : null;
    $('#dataRange').innerHTML = '<i data-lucide="database"></i>' + (L && L.dataFrom ? 'Data tersedia: <b>' + h(fDate(L.dataFrom)) + '</b> – <b>' + h(fDate(L.dataTo)) + '</b> · ' : '') + (t ? 'diperbarui ' + h(t) : '');
    icons();
  },
  async viewPhoto(id) {
    const ov = modal('Foto', '<div class="empty">Memuat foto…</div>', '', 'wide');
    try { $('.mbody', ov).innerHTML = '<img class="photo-full" alt="Foto bukti" src="' + await photoUrl(id) + '">'; } catch (e) { $('.mbody', ov).innerHTML = '<div class="empty">' + h(e.message) + '</div>'; }
  },
  changePasswordDlg() {
    const ov = modal('Ganti Password', '<label class="f">Password lama<input class="inp" type="password" id="pwOld"></label><label class="f">Password baru (min. 6)<input class="inp" type="password" id="pwNew"></label>',
      '<button class="btn" data-close>Batal</button><button class="btn pri" id="pwSave">Simpan</button>');
    $('#pwSave', ov).onclick = async () => { try { await call('changePassword', { oldPassword: $('#pwOld').value, newPassword: $('#pwNew').value }); ov.remove(); toast('Password diganti', 'ok'); } catch (e) { toast(e.message, 'err'); } };
  },
  openCase(id) { CaseUI.open(id); }
};

// =====================================================================
// HALAMAN
// =====================================================================
const Pages = {};

// ---------- DASHBOARD ----------
Pages.dashboard = async v => {
  const L = S.look || (S.look = await call('lookups'));
  const f = S.dashF || (S.dashF = { from: L.opDate, to: L.opDate, gran: 'D' });
  v.innerHTML = '<div class="panel"><div class="body filters" id="dfBox">' +
    '<label class="f">Dari<input type="date" class="inp" id="dfFrom" value="' + h(f.from) + '"></label>' +
    '<label class="f">Sampai<input type="date" class="inp" id="dfTo" value="' + h(f.to) + '"></label>' +
    '<label class="f">Alat<select class="inp" id="dfAsset" data-search>' + opt('', 'Semua alat', f.asset_id) + L.assets.map(a => opt(a.id, a.id + ' · ' + a.name, f.asset_id)).join('') + '</select></label>' +
    '<label class="f">PIC<select class="inp" id="dfPic" data-search>' + opt('', 'Semua PIC', f.pic_id) + L.pics.map(p => opt(p.id, p.name, f.pic_id)).join('') + '</select></label>' +
    '<label class="f">Departemen<select class="inp" id="dfDept">' + opt('', 'Semua', f.dept) + DEPTS.map(d => opt(d, d, f.dept)).join('') + '</select></label>' +
    '<label class="f">Shift<select class="inp" id="dfShift">' + opt('', 'Semua', f.shift) + ['1', '2', '3'].map(s => opt(s, 'Shift ' + s + ' (RODA DOFFING)', f.shift)).join('') + '</select></label>' +
    '<label class="f">Status kasus<select class="inp" id="dfStatus">' + opt('', 'Semua', f.status) + Object.keys(CASE_ST).map(k => opt(k, CASE_ST[k][0], f.status)).join('') + '</select></label>' +
    '</div></div><div id="dashBody"><div class="empty">Memuat…</div></div>';
  enhanceSearch(v);
  autoApply($('#dfBox'), () => {
    const nf = { from: $('#dfFrom').value, to: $('#dfTo').value, asset_id: $('#dfAsset').value, pic_id: $('#dfPic').value, dept: $('#dfDept').value, shift: $('#dfShift').value, status: $('#dfStatus').value, gran: S.dashF.gran };
    if (!nf.from || !nf.to) return;
    if (nf.from > nf.to) return toast('Tanggal "Dari" melebihi "Sampai"', 'err');
    S.dashF = nf; App.go('dashboard', true);
  });
  if (!L.ready.ok) $('#dashBody').insertAdjacentHTML('beforebegin', '<div class="notice">Master belum siap: <b>' + L.ready.unmapped + ' dari ' + L.ready.total + '</b> checkpoint belum punya departemen perbaikan. Jadwal checklist belum dibuat sampai semua dipetakan (Master Data → Mapping Departemen).</div>');
  const d = await call('dashboard', f);
  destroyCharts();
  const k = d.kpi, per = d.period.from === d.period.to ? fDate(d.period.from) : fDate(d.period.from) + ' – ' + fDate(d.period.to);
  const single = d.period.from === d.period.to;
  const trendSpan = ({ D: single ? '14 hari terakhir' : 'per hari', W: single ? '12 minggu terakhir (Senin–Minggu)' : 'per minggu (Senin–Minggu)', M: single ? '12 bulan terakhir' : 'per bulan' })[d.gran];
  const tLabel = key => d.gran === 'M' ? MONTHS[+key.slice(5, 7) - 1] + ' ' + key.slice(2, 4) : (d.gran === 'W' ? 'Mg ' : '') + fDate(key).slice(0, -5);
  const kpi = (l, val, desc, color) => '<div class="kpi"><div class="l">' + h(l) + '</div><div class="v" style="color:' + (color || 'var(--ink)') + '">' + h(val) + '</div><div class="d">' + h(desc) + '</div></div>';
  const T = (cols, rows, empty) => rows.length ? '<div class="tbl-wrap"><table class="t"><thead><tr>' + cols.map(c => '<th>' + h(c) + '</th>').join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : '<div class="empty">' + h(empty || 'Tidak ada data') + '</div>';
  $('#dashBody').innerHTML =
    '<div class="muted small" style="margin-bottom:8px">Periode: <b>' + h(per) + '</b> · diperbarui ' + h(fTs(d.period.generated_at)) + ' WIB</div>' +
    '<section class="kpis" aria-label="KPI">' +
    kpi('Alat aktif', k.assets, 'Total alat aktif di master') +
    kpi('Pengecekan', k.done + ' / ' + k.scheduled, 'Selesai / jadwal pada periode', 'var(--steel)') +
    kpi('Kepatuhan', k.compliance === null ? '–' : k.compliance + '%', 'Selesai ÷ (selesai + tidak dikerjakan)', 'var(--steel)') +
    kpi('Tidak dikerjakan', k.missed, 'Jadwal lewat cutoff tanpa checklist', 'var(--warn)') +
    kpi('Temuan NO OK', k.nok_events + ' kejadian', k.nok_open_items + ' item kasus aktif belum selesai', 'var(--loss)') +
    kpi('Perlu / sedang diperbaiki', k.cases_perlu + ' / ' + k.cases_sedang, 'Kasus · item: ' + k.items_open + ' belum diambil, ' + k.items_claimed + ' dikerjakan', 'var(--warn)') +
    kpi('Menunggu SPV', k.wait_spv, 'Kasus menunggu approval SPV', 'var(--info)') +
    kpi('Menunggu Head', k.wait_head, 'Kasus menunggu approval Head', 'var(--info)') +
    kpi('Kasus selesai', k.closed, 'Disetujui Head pada periode', 'var(--save)') +
    '</section>' +
    '<div class="grid2 mt">' +
    '<div class="panel"><div class="head"><h3>Tren kepatuhan checklist</h3><span class="muted small grow">' + h(trendSpan) + '</span>' +
      '<div class="seg" role="group" aria-label="Pengelompokan tren">' + [['D', 'Harian'], ['W', 'Mingguan'], ['M', 'Bulanan']].map(x => '<button class="' + (d.gran === x[0] ? 'on' : '') + '" onclick="S.dashF.gran=\'' + x[0] + '\';App.go(\'dashboard\',true)">' + x[1] + '</button>').join('') + '</div></div>' +
      '<div class="body"><div class="chart-box"><canvas id="cTrend"></canvas></div></div></div>' +
    '<div class="panel"><div class="head"><h3>Tren temuan NO OK ' + ({ D: 'per hari', W: 'per minggu', M: 'per bulan' })[d.gran] + '</h3></div><div class="body"><div class="chart-box"><canvas id="cNok"></canvas></div></div></div>' +
    '<div class="panel"><div class="head"><h3>Kepatuhan per shift — RODA DOFFING</h3></div><div class="body"><div class="chart-box"><canvas id="cShift"></canvas></div></div></div>' +
    '<div class="panel"><div class="head"><h3>Status pekerjaan perbaikan</h3><span class="muted small">Rata-rata: kasus ' + (d.resolution.avg_case_h === null ? '–' : fAge(d.resolution.avg_case_h)) + ' · pengerjaan ' + (d.resolution.avg_work_h === null ? '–' : fAge(d.resolution.avg_work_h)) + '</span></div><div class="body"><div class="chart-box"><canvas id="cRepair"></canvas></div></div></div>' +
    '</div>' +
    '<div class="panel mt"><div class="head"><h3>Prioritas: kasus terbuka terlama</h3><button class="btn sm" onclick="App.go(\'kanban\')">Lihat Kanban</button></div><div class="body">' +
    T(['Kasus', 'Alat', 'Point', 'Departemen', 'Umur', 'Status'], d.oldest.map(c => '<tr class="click" onclick="App.openCase(\'' + h(c.case_id) + '\')"><td><b>' + h(c.case_id) + '</b></td><td>' + h(c.asset) + '</td><td>' + h(c.points) + '</td><td>' + h(c.depts) + '</td><td class="nowrap">' + h(fAge(c.age_h)) + '</td><td>' + chip(CASE_ST, c.status) + '</td></tr>'), 'Tidak ada kasus terbuka') + '</div></div>' +
    '<div class="grid2 mt">' +
    '<div class="panel"><div class="head"><h3>Checkpoint dengan NO OK terbanyak</h3></div><div class="body">' + T(['Alat', 'Checkpoint', 'Kejadian'], d.topCp.map(x => '<tr><td>' + h(x.asset) + '</td><td>' + h(x.point) + '</td><td class="right"><b>' + x.n + '</b></td></tr>')) + '</div></div>' +
    '<div class="panel"><div class="head"><h3>Temuan berulang (≥2 kali)</h3></div><div class="body">' + T(['Alat', 'Checkpoint', 'Kejadian'], d.recurring.map(x => '<tr><td>' + h(x.asset) + '</td><td>' + h(x.point) + '</td><td class="right"><b>' + x.n + '</b></td></tr>'), 'Tidak ada temuan berulang') + '</div></div>' +
    '<div class="panel"><div class="head"><h3>Performa PIC</h3><span class="muted small">cakupan = terperiksa ÷ (terperiksa + tidak dikerjakan)</span></div><div class="body">' + T(['PIC', 'Jadwal', 'Terperiksa', 'Tdk dikerjakan', 'Cakupan'], d.picPerf.map(p => '<tr><td>' + h(p.name) + '</td><td class="right">' + p.assigned + '</td><td class="right">' + p.covered + '</td><td class="right" style="color:' + (p.missed ? 'var(--loss)' : 'inherit') + '">' + p.missed + '</td><td class="right"><b>' + (p.coverage === null ? '–' : p.coverage + '%') + '</b></td></tr>')) + '</div></div>' +
    '<div class="panel"><div class="head"><h3>Performa departemen perbaikan</h3></div><div class="body">' + T(['Departemen', 'Diterima', 'Selesai', 'Rework', 'Terbuka', 'Rata-rata kerja'], d.deptPerf.map(p => '<tr><td><b>' + h(p.dept) + '</b></td><td class="right">' + p.received + '</td><td class="right">' + p.done + '</td><td class="right">' + p.rework + '</td><td class="right">' + p.open_now + '</td><td class="right">' + (p.avg_work_h === null ? '–' : h(fAge(p.avg_work_h))) + '</td></tr>')) + '</div></div>' +
    '</div>';
  const labels = d.trend.map(t => tLabel(t.date));
  chart('cTrend', { type: 'bar', data: { labels, datasets: [
    { type: 'line', label: 'Kepatuhan %', data: d.trend.map(t => t.compliance), borderColor: '#1F4E79', backgroundColor: '#1F4E79', yAxisID: 'y1', tension: .25, spanGaps: true },
    { label: 'Selesai', data: d.trend.map(t => t.done), backgroundColor: '#1E7A4F', stack: 's' },
    { label: 'Tidak dikerjakan', data: d.trend.map(t => t.missed), backgroundColor: '#B42318', stack: 's' },
    { label: 'Belum (berjalan)', data: d.trend.map(t => t.open), backgroundColor: '#E8C77A', stack: 's' }] },
    options: { maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Jadwal' } }, y1: { position: 'right', min: 0, max: 100, grid: { display: false }, title: { display: true, text: '%' } } }, plugins: { legend: { position: 'bottom' } } } });
  chart('cNok', { type: 'bar', data: { labels, datasets: [{ label: 'Kejadian NO OK', data: d.trend.map(t => t.nok), backgroundColor: '#B42318' }] }, options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } } });
  chart('cShift', { type: 'bar', data: { labels: d.shiftComp.map(s => 'Shift ' + s.shift), datasets: [
    { label: 'Selesai', data: d.shiftComp.map(s => s.done), backgroundColor: '#1E7A4F', stack: 's' },
    { label: 'Tidak dikerjakan', data: d.shiftComp.map(s => s.missed), backgroundColor: '#B42318', stack: 's' },
    { label: 'Belum (berjalan)', data: d.shiftComp.map(s => s.open), backgroundColor: '#E8C77A', stack: 's' }] },
    options: { maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { footer: it => { const s = d.shiftComp[it[0].dataIndex]; return 'Kepatuhan: ' + (s.compliance === null ? '–' : s.compliance + '%'); } } } } } });
  const r = d.repairStatus;
  chart('cRepair', { type: 'bar', data: { labels: ['Belum diambil', 'Sedang dikerjakan', 'Selesai, menunggu approval', 'Kasus ditutup (periode)'], datasets: [{ data: [r.open, r.claimed, r.done_waiting, r.closed_cases], backgroundColor: ['#B42318', '#A96A00', '#2F6A9E', '#1E7A4F'] }] },
    options: { indexAxis: 'y', maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { display: false } } } });
  S.loadedAt = new Date(); App.dataLine();
};

// ---------- CHECKLIST ----------
Pages.checklist = async v => (S.me.type === 'GUEST' ? Checklist.worklist(v) : Checklist.status(v));
const Checklist = {
  async worklist(v) {
    const d = await call('worklist');
    if (!d.ready) { v.innerHTML = '<div class="notice">Checklist belum aktif. Master masih menunggu mapping departemen perbaikan (' + d.unmapped + ' dari ' + d.total + ' point belum dipetakan). Hubungi Admin.</div>'; return; }
    $('#periodPill').textContent = 'Hari operasional ' + fDate(d.opDate) + ' · Shift ' + d.shift;
    const todo = d.items.filter(i => !i.done).length;
    v.innerHTML = '<div class="row"><div class="grow"><b>' + h(S.me.name) + '</b> <span class="muted">· ' + todo + ' alat perlu diperiksa</span></div><button class="btn sm" onclick="App.refresh()"><i data-lucide="refresh-cw"></i> Muat ulang</button></div>' +
      (d.items.length ? '<div class="wl">' + d.items.map(i =>
        '<div class="wl-card' + (i.done ? ' done' : '') + '"><div class="row"><b class="grow">' + h(i.asset_name) + '</b>' + (i.done ? '<span class="chip c-ok">Selesai</span>' : '<span class="chip c-warn">Belum</span>') + '</div>' +
        '<div class="muted small">' + h(i.asset_id) + ' · ' + h(shiftLbl(i.shift_code)) + ' · ' + i.points + ' point</div><div class="small">Ditutup: <b>' + h(fTs(i.close_at)) + '</b></div>' +
        (i.done ? '' : '<button class="btn pri lg" onclick="Checklist.open(\'' + h(i.schedule_id) + '\')">Periksa</button>') + '</div>').join('') + '</div>'
        : '<div class="panel"><div class="empty">Tidak ada jadwal pemeriksaan untuk Anda pada periode ini.</div></div>');
  },
  async open(scheduleId) {
    const v = $('#view'); v.innerHTML = '<div class="empty">Memuat form…</div>';
    try { S.ck = await call('checklistForm', { schedule_id: scheduleId }); } catch (e) { toast(e.message, 'err'); return App.go('checklist', true); }
    S.ck.res = {}; S.dirty = false;
    Checklist.render();
  },
  render() {
    const c = S.ck, v = $('#view');
    v.innerHTML = '<div class="ck-head"><div class="row"><button class="icon-btn" aria-label="Kembali" onclick="App.go(\'checklist\')"><i data-lucide="chevron-left"></i></button><div class="grow"><div style="font-size:17px;font-weight:700">' + h(c.asset_name) + '</div>' +
      '<div class="muted small">' + h(c.asset_id) + ' · ' + h(shiftLbl(c.shift_code)) + ' · ditutup ' + h(fTs(c.close_at)) + '</div></div></div>' +
      '<div class="row small"><span class="grow">Pemeriksa: <b>' + h(S.me.name) + '</b></span><span id="ckCount"></span></div><div class="prog"><div id="ckProg" style="width:0"></div></div>' +
      (c.case_id ? '<div class="notice info small">Alat ini memiliki kasus perbaikan aktif <b>' + h(c.case_id) + '</b>. Temuan NO OK baru akan digabung ke kasus tersebut.</div>' : '') + '</div>' +
      '<div id="ckPts" style="display:flex;flex-direction:column;gap:12px">' + c.points.map((p, i) =>
        '<div class="pt" id="pt_' + p.checkpoint_id + '"><div class="row" style="align-items:flex-start"><div class="name grow">' + (i + 1) + '. ' + h(p.point_name) + '</div><span class="chip">Target ' + h(p.target_label) + '</span></div>' +
        (p.in_repair ? '<div class="small" style="color:var(--warn);margin-top:4px">Sedang dalam perbaikan</div>' : '') +
        '<div class="okbtns"><button class="b-ok" onclick="Checklist.set(\'' + p.checkpoint_id + '\',\'OK\')">OK</button><button class="b-nok" onclick="Checklist.set(\'' + p.checkpoint_id + '\',\'NO OK\')">NO OK</button></div>' +
        '<div class="nok-box" hidden><div class="photo-pick"><img class="photo-prev" alt="" hidden><div class="photo-prev ph">Belum ada foto</div><div class="grow">' +
        '<label class="btn danger" style="width:100%;height:44px"><i data-lucide="camera"></i> Ambil / Ganti Foto *<input type="file" accept="image/*" capture="environment" hidden onchange="Checklist.photo(\'' + p.checkpoint_id + '\', this)"></label>' +
        '<div class="muted small" style="margin-top:4px">Wajib 1 foto untuk point NO OK</div></div></div>' +
        '<label class="f">Catatan temuan (opsional)<textarea class="inp" rows="2" maxlength="500" oninput="Checklist.note(\'' + p.checkpoint_id + '\', this.value)"></textarea></label></div></div>').join('') + '</div>' +
      '<div class="sticky-foot"><span class="small muted grow" id="ckHint"></span><button class="btn pri lg" id="ckSubmit" disabled onclick="Checklist.submit()">Selesaikan Pemeriksaan</button></div>';
    icons(); Checklist.update();
  },
  set(id, val) {
    const r = S.ck.res[id] = S.ck.res[id] || {}; r.result = val; S.dirty = true;
    const el = $('#pt_' + id);
    $('.b-ok', el).classList.toggle('on', val === 'OK'); $('.b-nok', el).classList.toggle('on', val === 'NO OK');
    $('.nok-box', el).hidden = val !== 'NO OK'; el.classList.toggle('nok', val === 'NO OK');
    Checklist.update();
  },
  async photo(id, input) {
    const f = input.files[0]; if (!f) return;
    try {
      const d = await compress(f, 1500);
      S.ck.res[id].photo = d;
      const el = $('#pt_' + id), img = $('img.photo-prev', el);
      img.src = d; img.hidden = false; $('.photo-prev.ph', el).hidden = true;
      Checklist.update();
    } catch (e) { toast(e.message, 'err'); }
    input.value = '';
  },
  note(id, val) { (S.ck.res[id] = S.ck.res[id] || {}).note = val; },
  missing() {
    const c = S.ck; let unset = 0, nophoto = 0;
    c.points.forEach(p => { const r = c.res[p.checkpoint_id]; if (!r || !r.result) unset++; else if (r.result === 'NO OK' && !r.photo) nophoto++; });
    return { unset, nophoto };
  },
  update() {
    const c = S.ck, m = Checklist.missing(), n = c.points.length, done = n - m.unset;
    $('#ckCount').textContent = done + ' / ' + n + ' dinilai'; $('#ckProg').style.width = (done / n * 100) + '%';
    $('#ckSubmit').disabled = !!(m.unset || m.nophoto);
    $('#ckHint').textContent = m.unset ? m.unset + ' point belum dinilai' : (m.nophoto ? m.nophoto + ' point NO OK belum ada foto' : 'Siap dikirim');
  },
  async submit() {
    const c = S.ck, m = Checklist.missing(); if (m.unset || m.nophoto) return;
    const noks = c.points.filter(p => c.res[p.checkpoint_id].result === 'NO OK');
    if (!(await confirmDlg('Kirim hasil pemeriksaan?', '<p><b>' + h(c.asset_name) + '</b> · ' + h(shiftLbl(c.shift_code)) + '</p><p>OK: <b>' + (c.points.length - noks.length) + '</b> · NO OK: <b style="color:var(--loss)">' + noks.length + '</b></p>' +
      (noks.length ? '<ul>' + noks.map(p => '<li>' + h(p.point_name) + '</li>').join('') + '</ul>' : '') + '<p class="muted small">Setelah dikirim, hasil tidak bisa diubah.</p>', 'Kirim'))) return;
    const b = $('#ckSubmit'); b.disabled = true; b.textContent = 'Mengirim…';
    try {
      const r = await call('submitChecklist', { schedule_id: c.schedule_id, results: c.points.map(p => ({ checkpoint_id: p.checkpoint_id, result: c.res[p.checkpoint_id].result, note: c.res[p.checkpoint_id].note || '', photo: c.res[p.checkpoint_id].photo || null })) });
      S.dirty = false;
      toast(r.nok ? 'Tersimpan. ' + r.nok + ' temuan masuk kasus ' + r.case_id : 'Tersimpan. Semua point OK', 'ok');
      App.go('checklist', true);
    } catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = 'Selesaikan Pemeriksaan'; }
  },
  async status(v) {
    const date = S.ckDate || (S.look && S.look.opDate) || '';
    const d = await call('todaySchedules', { date });
    S.ckDate = d.date;
    const cnt = st => d.rows.filter(r => r.status === st).length;
    const filt = S.ckFilt || '';
    const rows = d.rows.filter(r => !filt || r.status === filt);
    v.innerHTML = (d.ready.ok ? '' : '<div class="notice">Master belum siap: ' + d.ready.unmapped + ' checkpoint belum dipetakan — jadwal belum dibuat.</div>') +
      '<div class="panel"><div class="head"><label class="f">Hari operasional<input type="date" class="inp" id="ckDate" value="' + h(d.date) + '"></label>' +
      '<div class="seg" style="margin-left:auto">' + [['', 'Semua (' + d.rows.length + ')'], ['DONE', 'Selesai (' + cnt('DONE') + ')'], ['OPEN', 'Belum (' + cnt('OPEN') + ')'], ['MISSED', 'Tidak dikerjakan (' + cnt('MISSED') + ')']]
        .map(x => '<button class="' + (filt === x[0] ? 'on' : '') + '" onclick="S.ckFilt=\'' + x[0] + '\';App.go(\'checklist\',true)">' + h(x[1]) + '</button>').join('') + '</div></div>' +
      '<div class="body"><div class="tbl-wrap"><table class="t"><thead><tr><th>Alat</th><th>Jadwal</th><th>PIC terdaftar</th><th>Status</th><th>Pemeriksa</th><th>Waktu submit</th><th>NO OK</th></tr></thead><tbody>' +
      (rows.length ? rows.map(r => '<tr' + (r.checklist_id ? ' class="click" onclick="Checklist.detail(\'' + h(r.checklist_id) + '\')"' : '') + '><td><b>' + h(r.asset_name) + '</b><div class="muted small">' + h(r.asset_id) + '</div></td><td>' + h(shiftLbl(r.shift_code)) + '<div class="muted small">tutup ' + h(fTs(r.close_at)) + '</div></td><td>' + h(r.pics) + '</td><td>' + chip(SCH_ST, r.status) + '</td><td>' + h(r.checker) + '</td><td class="nowrap">' + h(fTs(r.submitted_at)) + '</td><td>' + (r.nok ? '<span class="chip c-bad">' + r.nok + '</span>' : (r.checklist_id ? '0' : '')) + '</td></tr>').join('')
        : '<tr><td colspan="7" class="empty">Tidak ada jadwal</td></tr>') + '</tbody></table></div></div></div>';
    $('#ckDate').onchange = e => { S.ckDate = e.target.value; App.go('checklist', true); };
  },
  async detail(id) {
    const ov = modal('Detail Checklist', '<div class="empty">Memuat…</div>', '', 'wide');
    try {
      const d = await call('checklistDetail', { checklist_id: id }), hd = d.header;
      $('.mbody', ov).innerHTML = '<div><b>' + h(hd.asset_name_snapshot) + '</b> · ' + h(fDate(hd.operational_date)) + ' · ' + h(shiftLbl(hd.shift_code)) + '<div class="muted small">' + h(hd.checklist_id) + ' · Pemeriksa ' + h(hd.checker_name_snapshot) + ' · ' + h(fTs(hd.submitted_at)) + ' WIB</div></div>' +
        '<div class="tbl-wrap"><table class="t"><thead><tr><th>Point</th><th>Hasil</th><th>Foto</th><th>Catatan</th><th>Kasus</th></tr></thead><tbody>' + d.details.map(x =>
          '<tr><td>' + h(x.point_name_snapshot) + '</td><td>' + (x.result === 'OK' ? '<span class="chip c-ok">OK</span>' : '<span class="chip c-bad">NO OK</span>') + '</td><td>' + thumb(x.photo_file_id) + '</td><td>' + h(x.finding_note) + '</td><td>' + (x.case_id ? '<a href="#" onclick="App.openCase(\'' + h(x.case_id) + '\');return false">' + h(x.case_id) + '</a>' : '') + '</td></tr>').join('') + '</tbody></table></div>';
      hydrate(ov);
    } catch (e) { $('.mbody', ov).innerHTML = '<div class="empty">' + h(e.message) + '</div>'; }
  }
};

// ---------- PERBAIKAN ----------
Pages.perbaikan = async v => (S.me.type === 'GUEST' ? Repair.queue(v) : Repair.list(v));
const Repair = {
  async queue(v) {
    const d = await call('repairQueue');
    const groups = {};
    d.rows.forEach(r => (groups[r.case_id] = groups[r.case_id] || []).push(r));
    const ids = Object.keys(groups);
    v.innerHTML = '<div class="row"><div class="grow muted">Antrean perbaikan <b>' + h(S.me.role) + '</b> · diurutkan dari kasus terlama</div><button class="btn sm" onclick="App.go(\'perbaikan\', true)"><i data-lucide="refresh-cw"></i> Muat ulang</button></div>' +
      (ids.length ? ids.map(cid => {
        const it = groups[cid], f = it[0];
        return '<div class="panel"><div class="head"><div class="grow"><b>' + h(f.asset_name) + '</b><div class="muted small">' + h(cid) + ' · umur ' + h(fAge(f.age_h)) + '</div></div><button class="btn sm" onclick="App.openCase(\'' + h(cid) + '\')">Detail kasus</button></div><div class="body case-group">' +
          it.map(r => '<div class="item"><div class="row"><b class="grow">' + h(r.point_name) + '</b>' + deptChip(r.department) + chip(ITEM_ST, r.status) + '</div>' +
            '<div class="small muted">Ditemukan ' + h(fTs(r.found_at)) + (r.occurrence > 1 ? ' · <b style="color:var(--loss)">' + r.occurrence + '× kejadian</b>' : '') + (r.claimed_by ? ' · Teknisi: <b>' + h(r.claimed_by) + '</b>' : '') + '</div>' +
            (r.finding_note ? '<div class="small">Catatan temuan: ' + h(r.finding_note) + '</div>' : '') +
            (r.reject_note && r.status !== 'DONE' ? '<div class="notice small">Rework (' + r.rework + '×): ' + h(r.reject_note) + '</div>' : '') +
            '<div class="row">' + thumb(r.before_photo, 'Foto temuan') + '<div class="grow"></div>' +
            (r.status === 'OPEN' ? '<button class="btn pri" onclick="Repair.claim(\'' + h(r.case_item_id) + '\')">Ambil Pekerjaan</button>' : '') +
            (r.status === 'CLAIMED' && r.mine ? '<button class="btn pri" onclick="Repair.completeDlg(\'' + h(r.case_item_id) + '\')">Selesaikan Perbaikan</button>' : '') +
            '</div></div>').join('') + '</div></div>';
      }).join('') : '<div class="panel"><div class="empty">Tidak ada pekerjaan perbaikan untuk departemen Anda.</div></div>');
    S.repairRows = d.rows;
    hydrate(v);
  },
  async claim(id) {
    if (!(await confirmDlg('Ambil pekerjaan?', 'Item ini akan menjadi tanggung jawab <b>' + h(S.me.name) + '</b> dan tidak bisa diambil teknisi lain.', 'Ambil'))) return;
    try { await call('claimItem', { case_item_id: id }); toast('Pekerjaan diambil', 'ok'); } catch (e) { toast(e.message, 'err'); }
    App.go('perbaikan', true);
  },
  completeDlg(id) {
    const r = (S.repairRows || []).find(x => x.case_item_id === id); if (!r) return;
    let after = null;
    const ov = modal('Selesaikan Perbaikan', '<div><b>' + h(r.asset_name) + '</b> — ' + h(r.point_name) + '<div class="muted small">' + h(r.case_id) + ' · Teknisi: ' + h(S.me.name) + ' · Mulai ' + h(fTs(r.started_at)) + '</div></div>' +
      '<div><div class="small muted" style="margin-bottom:4px">1. Foto sebelum perbaikan (dari temuan)</div>' + thumb(r.before_photo) + '</div>' +
      '<label class="f">2. Tindakan perbaikan *<textarea class="inp" id="rpAct" rows="3" maxlength="1000" placeholder="Jelaskan tindakan yang dilakukan"></textarea></label>' +
      '<div><div class="small muted" style="margin-bottom:4px">3. Foto sesudah perbaikan *</div><div class="photo-pick"><img class="photo-prev" id="rpPrev" alt="" hidden><div class="photo-prev" id="rpPh">Belum ada foto</div>' +
      '<label class="btn" style="height:44px"><i data-lucide="camera"></i> Ambil Foto<input type="file" accept="image/*" capture="environment" hidden id="rpFile"></label></div></div>',
      '<button class="btn" data-close>Batal</button><button class="btn pri" id="rpSave">Selesaikan Perbaikan</button>');
    hydrate(ov);
    $('#rpFile', ov).onchange = async e => { try { after = await compress(e.target.files[0], 1500); $('#rpPrev', ov).src = after; $('#rpPrev', ov).hidden = false; $('#rpPh', ov).hidden = true; } catch (er) { toast(er.message, 'err'); } };
    $('#rpSave', ov).onclick = async () => {
      const act = $('#rpAct', ov).value.trim();
      if (!act) return toast('Tindakan perbaikan wajib diisi', 'err');
      if (!after) return toast('Foto sesudah perbaikan wajib', 'err');
      const b = $('#rpSave', ov); b.disabled = true; b.textContent = 'Menyimpan…';
      try {
        const res = await call('completeItem', { case_item_id: id, action: act, photo: after });
        ov.remove(); toast(res.case_status === 'MENUNGGU_SPV' ? 'Selesai. Semua item kasus selesai → diajukan ke SPV' : 'Perbaikan tersimpan', 'ok'); App.go('perbaikan', true);
      } catch (e) { toast(e.message, 'err'); b.disabled = false; b.textContent = 'Selesaikan Perbaikan'; }
    };
  },
  async list(v) {
    const L = S.look || (S.look = await call('lookups'));
    const f = S.caseF || (S.caseF = { status: '', page: 1 });
    const d = await call('caseList', f);
    v.innerHTML = '<div class="panel"><div class="body filters">' +
      '<label class="f">Status<select class="inp" id="cfSt">' + opt('', 'Semua', f.status) + Object.keys(CASE_ST).map(k => opt(k, CASE_ST[k][0], f.status)).join('') + '</select></label>' +
      '<label class="f">Alat<select class="inp" id="cfAs" data-search>' + opt('', 'Semua alat', f.asset_id) + L.assets.map(a => opt(a.id, a.id + ' · ' + a.name, f.asset_id)).join('') + '</select></label>' +
      '<label class="f">Departemen<select class="inp" id="cfDp">' + opt('', 'Semua', f.dept) + DEPTS.map(x => opt(x, x, f.dept)).join('') + '</select></label>' +
      '<label class="f">Temuan dari<input type="date" class="inp" id="cfFr" value="' + h(f.from || '') + '"></label><label class="f">s.d.<input type="date" class="inp" id="cfTo" value="' + h(f.to || '') + '"></label>' +
      '<label class="f">Cari<input class="inp" id="cfQ" placeholder="ID kasus / nama alat" value="' + h(f.q || '') + '"></label></div></div>' +
      '<div class="panel"><div class="head"><h3>Riwayat Perbaikan</h3><span class="muted small">' + d.total + ' kasus · aktif diurutkan dari umur terlama</span></div><div class="body"><div class="tbl-wrap"><table class="t"><thead><tr><th>Kasus</th><th>Alat</th><th>Status</th><th>Item</th><th>Departemen</th><th>Temuan pertama</th><th>Umur / lama</th><th>Rework</th></tr></thead><tbody>' +
      (d.rows.length ? d.rows.map(c => '<tr class="click" onclick="App.openCase(\'' + h(c.case_id) + '\')"><td><b>' + h(c.case_id) + '</b></td><td>' + h(c.asset_name_snapshot) + '</td><td>' + chip(CASE_ST, c.status) + '</td><td>' + c.done + '/' + c.items + '</td><td>' + h(c.depts) + '</td><td class="nowrap">' + h(fTs(c.first_finding_at)) + '</td><td class="nowrap">' + h(fAge(c.age_h)) + '</td><td>' + (+c.rework_count || '') + '</td></tr>').join('') : '<tr><td colspan="8" class="empty">Tidak ada kasus</td></tr>') +
      '</tbody></table></div>' + pager(d, 'Repair.page') + '</div></div>';
    autoApply($('.filters', v), () => {
      const nf = { status: $('#cfSt').value, asset_id: $('#cfAs').value, dept: $('#cfDp').value, from: $('#cfFr').value, to: $('#cfTo').value, q: $('#cfQ').value, page: 1 };
      if (nf.from && nf.to && nf.from > nf.to) return toast('Tanggal "Temuan dari" melebihi "s.d."', 'err');
      S.caseF = nf; App.go('perbaikan', true);
    });
  },
  page(p) { S.caseF.page = p; App.go('perbaikan', true); }
};
function pager(d, fn) {
  const pages = Math.max(1, Math.ceil(d.total / d.size));
  if (pages <= 1) return '';
  return '<div class="pager"><span class="muted small">Hal. ' + d.page + ' / ' + pages + '</span><button class="btn sm" ' + (d.page <= 1 ? 'disabled' : '') + ' onclick="' + fn + '(' + (d.page - 1) + ')">‹ Sebelumnya</button><button class="btn sm" ' + (d.page >= pages ? 'disabled' : '') + ' onclick="' + fn + '(' + (d.page + 1) + ')">Berikutnya ›</button></div>';
}

// ---------- DETAIL KASUS (drawer, semua role) ----------
const CaseUI = {
  async open(id) {
    const ov = modal('Kasus ' + id, '<div class="empty">Memuat…</div>', '', 'drawer');
    CaseUI.ov = ov;
    try { CaseUI.render(ov, await call('caseDetail', { case_id: id })); } catch (e) { $('.mbody', ov).innerHTML = '<div class="empty">' + h(e.message) + '</div>'; }
  },
  render(ov, d) {
    const c = d.case;
    const logTxt = { CLAIM: 'mengambil pekerjaan', DONE: 'menyelesaikan perbaikan', RELEASE: 'pekerjaan dilepas', REOPEN_NOK: 'dibuka ulang — NO OK berulang', REOPEN_REJECT: 'dibuka ulang — ditolak approval' };
    const body =
      '<div class="row"><div class="grow"><div style="font-size:17px;font-weight:700">' + h(c.asset_name_snapshot) + '</div><div class="muted small">' + h(c.case_id) + ' · ' + h(c.asset_id) + ' · siklus approval ' + h(c.cycle_no) + (+c.rework_count ? ' · rework ' + c.rework_count + '×' : '') + '</div></div>' + chip(CASE_ST, c.status) + '</div>' +
      '<div class="small">Temuan pertama <b>' + h(fTs(c.first_finding_at)) + '</b>' + (c.closed_at ? ' · ditutup <b>' + h(fTs(c.closed_at)) + '</b>' : '') + ' · aktivitas terakhir ' + h(fTs(c.last_activity_at)) + '</div>' +
      '<h4 style="margin:6px 0 0">Item temuan (' + d.items.length + ')</h4>' +
      d.items.map(i => '<div class="item"><div class="row"><b class="grow">' + h(i.point_name_snapshot) + '</b>' + deptChip(i.department) + chip(ITEM_ST, i.status) + '</div>' +
        '<div class="small muted">' + h(i.case_item_id) + ' · ' + h(i.occurrence_count) + '× kejadian' + (+i.rework_count ? ' · rework ' + i.rework_count + '×' : '') + (i.claimed_by_name_snapshot ? ' · Teknisi <b>' + h(i.claimed_by_name_snapshot) + '</b>' : '') + '</div>' +
        (i.last_reject_note && i.status !== 'DONE' ? '<div class="notice small">Catatan penolakan: ' + h(i.last_reject_note) + '</div>' : '') +
        '<div class="small"><b>Foto temuan (sebelum):</b></div><div class="thumbs">' + i.occurrences.map(o => '<div style="text-align:center">' + thumb(o.photo) + '<div class="muted" style="font-size:11px">' + h(fTs(o.recorded_at)) + '<br>' + h(o.checker) + '</div></div>').join('') + '</div>' +
        i.occurrences.filter(o => o.note).map(o => '<div class="small">Catatan ' + h(fTs(o.recorded_at)) + ': ' + h(o.note) + '</div>').join('') +
        (i.status === 'DONE' ? '<div class="small"><b>Tindakan:</b> ' + h(i.repair_action) + '<br><span class="muted">Mulai ' + h(fTs(i.started_at)) + ' · selesai ' + h(fTs(i.completed_at)) + '</span></div><div class="small"><b>Foto sesudah:</b></div>' + thumb(i.after_photo_file_id) : '') +
        '<div class="row">' + (i.can_claim ? '<button class="btn pri sm" onclick="CaseUI.claim(\'' + h(i.case_item_id) + '\')">Ambil Pekerjaan</button>' : '') +
        (i.can_complete ? '<button class="btn pri sm" onclick="CaseUI.ov.remove();App.go(\'perbaikan\',true)">Selesaikan di menu Perbaikan</button>' : '') +
        (d.can_release && i.status === 'CLAIMED' ? '<button class="btn sm danger" onclick="CaseUI.release(\'' + h(i.case_item_id) + '\',\'' + h(c.case_id) + '\')">Lepas pekerjaan</button>' : '') + '</div></div>').join('') +
      (d.can_decide ? CaseUI.decidePanel(d) : '') +
      '<h4 style="margin:6px 0 0">Histori approval</h4>' + (d.approvals.length ? '<ul class="tl">' + d.approvals.map(p => '<li class="' + (p.decision === 'APPROVE' ? 'ok' : 'bad') + (p.valid ? '' : ' void') + '"><b>' + h(p.level) + ' ' + (p.decision === 'APPROVE' ? 'menyetujui' : 'menolak') + '</b> — ' + h(p.approver_name) + (p.approver_role === 'ADMIN' ? ' (Admin)' : '') + ' · ' + h(fTs(p.decided_at)) + ' · siklus ' + h(p.cycle_no) + (p.valid ? '' : ' (tidak berlaku)') + (p.note ? '<div>' + h(p.note) + '</div>' : '') + '</li>').join('') + '</ul>' : '<div class="muted small">Belum ada keputusan</div>') +
      '<h4 style="margin:6px 0 0">Timeline perbaikan</h4>' + (d.logs.length ? '<ul class="tl">' + d.logs.map(l => '<li class="' + (l.event === 'DONE' ? 'ok' : /REOPEN/.test(l.event) ? 'bad' : '') + '">' + h(fTs(l.created_at)) + ' · <b>' + h(l.actor_name || '') + '</b> ' + h(logTxt[l.event] || l.event) + (l.note ? '<div class="muted">' + h(l.note) + '</div>' : '') + (l.event === 'DONE' && l.repair_action ? '<div>' + h(l.repair_action) + '</div>' : '') + '</li>').join('') + '</ul>' : '<div class="muted small">Belum ada aktivitas</div>');
    $('.mbody', ov).innerHTML = body; icons(); hydrate(ov);
    if (d.can_decide) CaseUI.bindDecide(ov, d);
  },
  decidePanel(d) {
    return '<div class="panel" style="border-color:var(--steel)"><div class="head"><h3>Keputusan approval ' + h(d.level) + '</h3>' + (S.me.role === 'ADMIN' ? '<span class="chip c-warn">Dicatat sebagai Admin</span>' : '') + '</div><div class="body" style="display:flex;flex-direction:column;gap:10px">' +
      '<div class="seg"><button class="on" data-dec="APPROVE">Setujui</button><button data-dec="REJECT">Tolak</button></div>' +
      '<div id="rjItems" hidden><div class="small muted">Pilih item yang perlu dikerjakan ulang:</div>' + d.items.map(i => '<label class="row small"><input type="checkbox" value="' + h(i.case_item_id) + '"> ' + h(i.point_name_snapshot) + ' · ' + h(i.department) + '</label>').join('') + '</div>' +
      '<label class="f"><span id="dcNoteLbl">Catatan (opsional)</span><textarea class="inp" id="dcNote" rows="2" maxlength="1000"></textarea></label>' +
      '<button class="btn pri" id="dcGo">Simpan keputusan</button></div></div>';
  },
  bindDecide(ov, d) {
    let dec = 'APPROVE';
    $$('[data-dec]', ov).forEach(b => b.onclick = () => {
      dec = b.dataset.dec; $$('[data-dec]', ov).forEach(x => x.classList.toggle('on', x === b));
      $('#rjItems', ov).hidden = dec !== 'REJECT'; $('#dcNoteLbl', ov).textContent = dec === 'REJECT' ? 'Alasan penolakan *' : 'Catatan (opsional)';
      $('#dcGo', ov).className = 'btn ' + (dec === 'REJECT' ? 'danger' : 'pri');
    });
    $('#dcGo', ov).onclick = async () => {
      const note = $('#dcNote', ov).value.trim(), items = $$('#rjItems input:checked', ov).map(x => x.value);
      if (dec === 'REJECT' && !note) return toast('Alasan penolakan wajib diisi', 'err');
      if (dec === 'REJECT' && !items.length) return toast('Pilih minimal satu item untuk rework', 'err');
      const b = $('#dcGo', ov); b.disabled = true;
      try {
        await call('decide', { case_id: d.case.case_id, decision: dec, note, item_ids: items, cycle_no: d.case.cycle_no, level: d.level });
        toast(dec === 'APPROVE' ? 'Disetujui' : 'Ditolak — kasus kembali ke perbaikan', 'ok');
        ov.remove(); App.refreshLook(); if (['approval', 'perbaikan', 'kanban', 'dashboard'].includes(S.page)) App.go(S.page, true);
      } catch (e) { toast(e.message, 'err'); b.disabled = false; }
    };
  },
  async claim(id) {
    try { await call('claimItem', { case_item_id: id }); toast('Pekerjaan diambil', 'ok'); CaseUI.ov.remove(); App.go('perbaikan', true); } catch (e) { toast(e.message, 'err'); }
  },
  async release(id, caseId) {
    if (!(await confirmDlg('Lepas pekerjaan?', 'Item akan kembali ke antrean dan bisa diambil teknisi lain.', 'Lepas', true))) return;
    try { await call('releaseItem', { case_item_id: id }); toast('Pekerjaan dilepas', 'ok'); CaseUI.ov.remove(); CaseUI.open(caseId); } catch (e) { toast(e.message, 'err'); }
  }
};

// ---------- APPROVAL ----------
Pages.approval = async v => {
  const d = await call('approvalQueue');
  v.innerHTML = '<div class="panel"><div class="head"><h3>Antrean approval ' + (S.me.role === 'ADMIN' ? 'SPV & Head' : S.me.role) + '</h3><span class="muted small">' + d.rows.length + ' kasus · cukup satu ' + (S.me.role === 'HEAD' ? 'Head' : 'SPV') + ' untuk memutuskan</span></div><div class="body"><div class="tbl-wrap"><table class="t"><thead><tr><th>Kasus</th><th>Alat</th><th>Tahap</th><th>Item</th><th>Teknisi</th><th>Temuan pertama</th><th>Umur</th><th>Rework</th><th></th></tr></thead><tbody>' +
    (d.rows.length ? d.rows.map(c => '<tr class="click" onclick="App.openCase(\'' + h(c.case_id) + '\')"><td><b>' + h(c.case_id) + '</b></td><td>' + h(c.asset_name_snapshot) + '</td><td>' + chip(CASE_ST, c.status) + '</td><td>' + c.items + '</td><td>' + h(c.technicians) + '</td><td class="nowrap">' + h(fTs(c.first_finding_at)) + '</td><td class="nowrap">' + h(fAge(c.age_h)) + '</td><td>' + (c.rework || '') + '</td><td><button class="btn sm pri">Periksa</button></td></tr>').join('')
      : '<tr><td colspan="9" class="empty">Tidak ada kasus yang menunggu approval Anda</td></tr>') + '</tbody></table></div></div></div>';
};

// ---------- KANBAN ----------
Pages.kanban = async v => {
  const d = await call('kanban', { date: S.kbDate || '' });
  S.kbDate = d.date;
  const card = c => c.type === 'schedule'
    ? '<button class="kb-card" ' + (c.checklist_id ? 'onclick="Checklist.detail(\'' + h(c.checklist_id) + '\')"' : 'onclick="App.go(\'checklist\')"') + '><b>' + h(c.asset_name) + '</b><span class="muted">' + h(c.asset_id) + ' · ' + h(fDate(c.date)) + ' · ' + h(shiftLbl(c.shift)) + '</span><br>' + (c.at ? 'Oleh ' + h(c.who) + ' · ' + h(fTs(c.at).slice(-5)) : 'PIC: ' + h(c.who) + '<br><span style="color:var(--warn)">tutup ' + h(fTs(c.close_at)) + '</span>') + '</button>'
    : '<button class="kb-card" onclick="App.openCase(\'' + h(c.id) + '\')"><b>' + h(c.asset_name) + '</b><span class="muted">' + h(c.id) + ' · ' + h(c.asset_id) + '</span><br>Umur ' + h(fAge(c.age_h)) + ' · ' + c.points + ' point<br>' + h(c.depts) + (c.who ? '<br>Teknisi: ' + h(c.who) : '') + (c.rework ? '<br><span style="color:var(--loss)">Rework ' + c.rework + '×</span>' : '') + '</button>';
  const colColor = { BELUM: 'var(--warn)', CEK_OK: 'var(--save)', PERLU_PERBAIKAN: 'var(--loss)', SEDANG_DIPERBAIKI: 'var(--warn)', MENUNGGU_SPV: 'var(--info)', MENUNGGU_HEAD: 'var(--info)', SELESAI: 'var(--save)' };
  v.innerHTML = '<div class="row"><label class="f">Hari operasional<input type="date" class="inp" id="kbDate" value="' + h(d.date) + '"></label><span class="chip c-bad" style="margin-top:18px">Tidak dikerjakan: ' + d.missed + '</span><span class="muted small grow" style="margin-top:18px">Geser kolom ke kiri / kanan · kolom 1–2 = jadwal hari terpilih · kolom 3–7 = kasus (terlama di atas)</span></div>' +
    '<div class="kb-tabs" aria-label="Lompat ke kolom">' + d.columns.map((c, i) => '<button type="button" data-col="' + i + '">' + h(c.title) + ' (' + c.cards.length + ')</button>').join('') + '</div>' +
    '<div class="kb">' + d.columns.map(c => '<section class="kb-col"><h4 style="border-bottom-color:' + colColor[c.key] + '">' + h(c.title) + '<span class="muted">' + c.cards.length + '</span></h4><div class="kb-list">' + (c.cards.length ? c.cards.map(card).join('') : '<div class="muted small">—</div>') + '</div></section>').join('') + '</div>';
  const kb = $('.kb', v);
  kb.scrollLeft = S.kbX || 0; // posisi geser dipertahankan saat refresh
  kb.onscroll = () => { S.kbX = kb.scrollLeft; };
  $$('.kb-tabs button', v).forEach(b => b.onclick = () => { const col = kb.children[+b.dataset.col]; kb.scrollTo({ left: col.offsetLeft - kb.offsetLeft, behavior: 'smooth' }); });
  $('#kbDate').onchange = e => { S.kbDate = e.target.value; App.go('kanban', true); };
};

// ---------- LAPORAN ----------
Pages.laporan = async v => {
  const L = S.look || (S.look = await call('lookups'));
  const f = S.repF || (S.repF = { type: 'checklist', from: L.opDate, to: L.opDate, page: 1 });
  const d = await call('report', f);
  v.innerHTML = '<div class="panel"><div class="body filters">' +
    '<label class="f">Jenis laporan<select class="inp" id="rpType">' + Object.keys(d.types).map(k => opt(k, d.types[k], f.type)).join('') + '</select></label>' +
    '<label class="f">Dari<input type="date" class="inp" id="rpFrom" value="' + h(f.from) + '"></label><label class="f">Sampai<input type="date" class="inp" id="rpTo" value="' + h(f.to) + '"></label>' +
    '<label class="f">Alat<select class="inp" id="rpAsset" data-search>' + opt('', 'Semua alat', f.asset_id) + L.assets.map(a => opt(a.id, a.id + ' · ' + a.name, f.asset_id)).join('') + '</select></label>' +
    '<label class="f">PIC<select class="inp" id="rpPic" data-search>' + opt('', 'Semua PIC', f.pic_id) + L.pics.map(p => opt(p.id, p.name, f.pic_id)).join('') + '</select></label>' +
    '<label class="f">Departemen<select class="inp" id="rpDept">' + opt('', 'Semua', f.dept) + DEPTS.map(x => opt(x, x, f.dept)).join('') + '</select></label>' +
    '<label class="f">Shift<select class="inp" id="rpShift">' + opt('', 'Semua', f.shift) + ['1', '2', '3'].map(s => opt(s, 'Shift ' + s, f.shift)).join('') + '</select></label>' +
    '<label class="f">Status kasus<select class="inp" id="rpSt">' + opt('', 'Semua', f.status) + Object.keys(CASE_ST).map(k => opt(k, CASE_ST[k][0], f.status)).join('') + '</select></label>' +
    '</div></div>' +
    '<div class="panel"><div class="head"><div class="grow"><h3>' + h(d.title) + '</h3><div class="muted small">Periode ' + h(d.period) + ' · ' + d.total + ' baris · zona waktu WIB</div></div>' +
    '<button class="btn" onclick="Report.exp(\'xlsx\')"><i data-lucide="download"></i> Excel</button><button class="btn" onclick="Report.exp(\'pdf\')"><i data-lucide="download"></i> PDF</button></div><div class="body">' +
    '<div class="tbl-wrap"><table class="t"><thead><tr>' + d.columns.map(c => '<th>' + h(c) + '</th>').join('') + '</tr></thead><tbody>' +
    (d.rows.length ? d.rows.map(r => '<tr>' + r.map(x => '<td>' + (/^https:\/\/drive\.google\.com/.test(String(x)) ? '<a href="' + h(x) + '" target="_blank" rel="noopener">Buka</a>' : h(x)) + '</td>').join('') + '</tr>').join('') : '<tr><td colspan="' + d.columns.length + '" class="empty">Tidak ada data</td></tr>') +
    '</tbody></table></div>' + pager(d, 'Report.page') + '</div></div>';
  autoApply($('.filters', v), () => {
    const nf = { type: $('#rpType').value, from: $('#rpFrom').value, to: $('#rpTo').value, asset_id: $('#rpAsset').value, pic_id: $('#rpPic').value, dept: $('#rpDept').value, shift: $('#rpShift').value, status: $('#rpSt').value, page: 1 };
    if (!nf.from || !nf.to) return;
    if (nf.from > nf.to) return toast('Tanggal "Dari" melebihi "Sampai"', 'err');
    S.repF = nf; App.go('laporan', true);
  });
};
const Report = {
  page(p) { S.repF.page = p; App.go('laporan', true); },
  async exp(fmt) {
    toast('Menyiapkan file ' + fmt.toUpperCase() + '…');
    try { download(await call('exportReport', Object.assign({}, S.repF, { format: fmt }))); } catch (e) { toast(e.message, 'err'); }
  }
};

// ---------- MASTER DATA ----------
Pages.master = async v => {
  const md = S.md = await call('masterData');
  const tab = S.mTab || 'mapping';
  const mapped = md.ready.total - md.ready.unmapped;
  v.innerHTML = '<div class="tabs">' + [['mapping', 'Mapping Departemen'], ['asset', 'Alat & Checkpoint'], ['person', 'Personel'], ['account', 'Akun Login'], ['audit', 'Audit Log']]
    .map(t => '<button class="' + (tab === t[0] ? 'on' : '') + '" onclick="S.mTab=\'' + t[0] + '\';App.go(\'master\',true)">' + h(t[1]) + '</button>').join('') + '</div>' +
    (md.ready.ok ? '<div class="notice info">Master siap · ' + md.ready.total + ' checkpoint aktif sudah dipetakan' + (md.activated ? ' · checklist aktif' : '') + '.</div>'
      : '<div class="notice">Mapping departemen: <b>' + mapped + ' / ' + md.ready.total + '</b> checkpoint. Checklist & jadwal baru aktif setelah semua checkpoint aktif dipetakan.<div class="prog mt"><div style="width:' + (md.ready.total ? mapped / md.ready.total * 100 : 0) + '%"></div></div></div>') +
    '<div id="mBody"></div>';
  await Master[tab]($('#mBody'));
  icons();
};
const Master = {
  mapping(el) {
    const md = S.md, f = S.mapF || (S.mapF = { show: 'unmapped', asset: '' });
    const rows = [];
    md.assets.filter(a => a.active === 'TRUE').forEach(a => a.checkpoints.filter(c => c.active === 'TRUE').forEach(c => {
      if (f.show === 'unmapped' && c.repair_department) return;
      if (f.asset && a.asset_id !== f.asset) return;
      rows.push({ a, c });
    }));
    S.mapChanges = {};
    el.innerHTML = '<div class="panel"><div class="head"><div class="seg">' + [['unmapped', 'Belum dipetakan'], ['all', 'Semua']].map(x => '<button class="' + (f.show === x[0] ? 'on' : '') + '" onclick="S.mapF.show=\'' + x[0] + '\';App.go(\'master\',true)">' + x[1] + '</button>').join('') + '</div>' +
      '<select class="inp" id="mpAsset" data-search>' + opt('', 'Semua alat', f.asset) + md.assets.filter(a => a.active === 'TRUE').map(a => opt(a.asset_id, a.asset_id + ' · ' + a.asset_name, f.asset)).join('') + '</select>' +
      '<span class="grow"></span><span class="small muted">Set semua yang tampil ke</span><select class="inp" id="mpBulk">' + opt('', '—') + DEPTS.map(x => opt(x, x)).join('') + '</select><button class="btn sm" id="mpBulkGo">Terapkan</button>' +
      '<button class="btn pri" id="mpSave">Simpan perubahan (<span id="mpCount">0</span>)</button></div><div class="body"><div class="tbl-wrap"><table class="t"><thead><tr><th>Alat</th><th>#</th><th>Point pemeriksaan</th><th>Target</th><th>Departemen perbaikan</th></tr></thead><tbody>' +
      (rows.length ? rows.map(r => '<tr><td><b>' + h(r.a.asset_name) + '</b><div class="muted small">' + h(r.a.asset_id) + '</div></td><td>' + h(r.c.display_order) + '</td><td>' + h(r.c.point_name) + '<div class="muted small">' + h(r.c.checkpoint_id) + '</div></td><td class="nowrap">' + h(r.c.target_label) + '</td><td>' +
        '<div class="seg" data-cp="' + h(r.c.checkpoint_id) + '" data-orig="' + h(r.c.repair_department) + '">' + DEPTS.map(x => '<button class="' + (r.c.repair_department === x ? 'on' : '') + '" data-v="' + x + '">' + x + '</button>').join('') + '</div></td></tr>').join('')
        : '<tr><td colspan="5" class="empty">' + (f.show === 'unmapped' ? 'Semua checkpoint sudah dipetakan' : 'Tidak ada data') + '</td></tr>') + '</tbody></table></div></div></div>';
    const setVal = (seg, val) => {
      $$('button', seg).forEach(b => b.classList.toggle('on', b.dataset.v === val));
      if (val === seg.dataset.orig) delete S.mapChanges[seg.dataset.cp]; else S.mapChanges[seg.dataset.cp] = val;
      $('#mpCount').textContent = Object.keys(S.mapChanges).length;
    };
    $$('[data-cp]', el).forEach(seg => $$('button', seg).forEach(b => b.onclick = () => setVal(seg, b.dataset.v)));
    $('#mpBulkGo').onclick = () => { const val = $('#mpBulk').value; if (val) $$('[data-cp]', el).forEach(seg => setVal(seg, val)); };
    $('#mpAsset').onchange = e => { S.mapF.asset = e.target.value; App.go('master', true); };
    $('#mpSave').onclick = async () => {
      const changes = Object.keys(S.mapChanges).map(k => ({ checkpoint_id: k, dept: S.mapChanges[k] }));
      if (!changes.length) return toast('Belum ada perubahan');
      try { const r = await call('saveMapping', { changes }); toast(r.changed + ' checkpoint disimpan' + (r.ready.ok ? ' · master siap, checklist aktif' : ' · sisa ' + r.ready.unmapped + ' belum dipetakan'), 'ok'); App.go('master', true); } catch (e) { toast(e.message, 'err'); }
    };
  },
  asset(el) {
    const md = S.md, pm = {}; md.persons.forEach(p => pm[p.person_id] = p.display_name);
    el.innerHTML = '<div class="panel"><div class="head"><h3>Alat / sarana kerja (' + md.assets.length + ')</h3><span class="grow"></span><button class="btn pri" onclick="Master.assetDlg()"><i data-lucide="plus"></i> Tambah alat</button></div><div class="body"><div class="tbl-wrap"><table class="t"><thead><tr><th>ID</th><th>No. Excel</th><th>Nama alat</th><th>Jadwal</th><th>Pemeriksa / PIC</th><th>Point aktif</th><th>Mapping</th><th>Status</th></tr></thead><tbody>' +
      md.assets.map(a => { const act = a.checkpoints.filter(c => c.active === 'TRUE'); const un = act.filter(c => !c.repair_department).length;
        return '<tr class="click" onclick="Master.assetDlg(\'' + h(a.asset_id) + '\')"><td>' + h(a.asset_id) + '</td><td>' + h(a.source_no) + '</td><td><b>' + h(a.asset_name) + '</b>' + (a.pic_group ? '<div class="muted small">Grup PIC: ' + h(a.pic_group) + '</div>' : '') + '</td><td>' + (a.schedule_type === 'SHIFT' ? 'Per shift (3×)' : 'Harian') + '</td><td>' + (a.checker_role === 'UTILITY' ? '<span class="chip c-steel">Semua Utility</span>' : h(a.pic_ids.split(',').filter(String).map(id => pm[id] || id).join(', '))) + '</td><td>' + act.length + '</td><td>' + (un ? '<span class="chip c-warn">' + un + ' kosong</span>' : '<span class="chip c-ok">Lengkap</span>') + '</td><td>' + (a.active === 'TRUE' ? '<span class="chip c-ok">Aktif</span>' : '<span class="chip">Nonaktif</span>') + '</td></tr>'; }).join('') +
      '</tbody></table></div></div></div>';
  },
  assetDlg(id) {
    const md = S.md, a = id ? md.assets.find(x => x.asset_id === id) : { asset_name: '', schedule_type: 'DAILY', checker_role: 'PIC', pic_group: '', pic_ids: '', active: 'TRUE', checkpoints: [] };
    const pics = md.persons.filter(p => p.role_type === 'PIC' && (p.active === 'TRUE' || a.pic_ids.split(',').includes(p.person_id)));
    let cps = a.checkpoints.map(c => Object.assign({}, c));
    const ov = modal(id ? 'Ubah ' + a.asset_id : 'Tambah alat', '<div class="grid2" style="gap:10px">' +
      '<label class="f">Nama alat *<input class="inp" id="aName" value="' + h(a.asset_name) + '"></label>' +
      '<label class="f">Jadwal<select class="inp" id="aType">' + opt('DAILY', 'Harian (07.00–07.00)', a.schedule_type) + opt('SHIFT', 'Per shift (3× sehari)', a.schedule_type) + '</select></label>' +
      '<label class="f">Pemeriksa<select class="inp" id="aRole">' + opt('PIC', 'PIC terdaftar', a.checker_role) + opt('UTILITY', 'Semua anggota Utility', a.checker_role) + '</select></label>' +
      '<label class="f">Grup PIC silang (opsional)<input class="inp" id="aGroup" value="' + h(a.pic_group) + '" placeholder="mis. RODA DOFFING"></label>' +
      '<label class="row small"><input type="checkbox" id="aAct" ' + (a.active === 'TRUE' ? 'checked' : '') + '> Alat aktif (nonaktif = tidak dijadwalkan, histori tetap)</label></div>' +
      '<div id="aPicBox"><div class="small muted" style="margin:6px 0">PIC alat (boleh lebih dari satu)</div><input class="inp" id="aPicQ" placeholder="Cari nama…" style="width:100%;margin-bottom:6px"><div id="aPics" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:4px;max-height:160px;overflow:auto">' +
      pics.map(p => '<label class="row small" data-n="' + h(p.display_name.toLowerCase()) + '"><input type="checkbox" value="' + h(p.person_id) + '" ' + (a.pic_ids.split(',').includes(p.person_id) ? 'checked' : '') + '> ' + h(p.display_name) + '</label>').join('') + '</div></div>' +
      '<div class="row"><b class="grow">Point pemeriksaan</b><button class="btn sm" id="aAddCp"><i data-lucide="plus"></i> Tambah point</button></div><div id="aCps"></div>',
      '<button class="btn" data-close>Batal</button><button class="btn pri" id="aSave">Simpan</button>', 'wide');
    const renderCps = () => {
      $('#aCps', ov).innerHTML = '<div class="tbl-wrap"><table class="t"><thead><tr><th>#</th><th>Point</th><th>Target</th><th>Departemen</th><th>Aktif</th><th></th></tr></thead><tbody>' + cps.map((c, i) =>
        '<tr><td>' + (i + 1) + '</td><td><input class="inp" style="width:100%;min-width:180px" data-i="' + i + '" data-k="point_name" value="' + h(c.point_name) + '"><div class="muted small">' + h(c.checkpoint_id || 'baru') + '</div></td>' +
        '<td><select class="inp" data-i="' + i + '" data-k="target_label">' + ['1 MENIT', '2 MENIT'].map(t => opt(t, t, c.target_label)).join('') + '</select></td>' +
        '<td><select class="inp" data-i="' + i + '" data-k="repair_department">' + opt('', '— belum —', c.repair_department) + DEPTS.map(x => opt(x, x, c.repair_department)).join('') + '</select></td>' +
        '<td><input type="checkbox" data-i="' + i + '" data-k="active" ' + (c.active !== 'FALSE' ? 'checked' : '') + '></td>' +
        '<td class="nowrap"><button class="icon-btn" aria-label="Naik" data-up="' + i + '"><i data-lucide="arrow-up"></i></button> <button class="icon-btn" aria-label="Turun" data-down="' + i + '"><i data-lucide="arrow-down"></i></button></td></tr>').join('') + '</tbody></table></div>' +
        '<div class="muted small">Point tidak dapat dihapus permanen — nonaktifkan agar histori tetap utuh.</div>';
      $$('[data-k]', ov).forEach(inp => inp.onchange = () => { const c = cps[+inp.dataset.i]; c[inp.dataset.k] = inp.type === 'checkbox' ? (inp.checked ? 'TRUE' : 'FALSE') : inp.value; });
      $$('[data-up]', ov).forEach(b => b.onclick = () => { const i = +b.dataset.up; if (i > 0) { [cps[i - 1], cps[i]] = [cps[i], cps[i - 1]]; renderCps(); } });
      $$('[data-down]', ov).forEach(b => b.onclick = () => { const i = +b.dataset.down; if (i < cps.length - 1) { [cps[i + 1], cps[i]] = [cps[i], cps[i + 1]]; renderCps(); } });
      icons();
    };
    renderCps();
    const syncRole = () => { $('#aPicBox', ov).hidden = $('#aRole', ov).value !== 'PIC'; };
    $('#aRole', ov).onchange = syncRole; syncRole();
    $('#aPicQ', ov).oninput = e => $$('#aPics label', ov).forEach(l => { l.hidden = l.dataset.n.indexOf(e.target.value.toLowerCase()) < 0; });
    $('#aAddCp', ov).onclick = () => { cps.push({ point_name: '', target_label: '2 MENIT', repair_department: '', active: 'TRUE' }); renderCps(); };
    $('#aSave', ov).onclick = async () => {
      const payload = { asset: { asset_id: id || '', asset_name: $('#aName', ov).value, schedule_type: $('#aType', ov).value, checker_role: $('#aRole', ov).value, pic_group: $('#aGroup', ov).value,
        active: $('#aAct', ov).checked, pic_ids: $$('#aPics input:checked', ov).map(x => x.value) }, checkpoints: cps };
      try { await call('saveAsset', payload); ov.remove(); toast('Alat disimpan', 'ok'); App.go('master', true); } catch (e) { toast(e.message, 'err'); }
    };
  },
  person(el) {
    const md = S.md, f = S.pF || '';
    const rows = md.persons.filter(p => !f || p.role_type === f).sort((a, b) => a.role_type.localeCompare(b.role_type) || a.display_name.localeCompare(b.display_name));
    el.innerHTML = '<div class="panel"><div class="head"><div class="seg">' + [['', 'Semua'], ['PIC', 'PIC'], ['MAINTENANCE', 'Maintenance'], ['UTILITY', 'Utility']].map(x => '<button class="' + (f === x[0] ? 'on' : '') + '" onclick="S.pF=\'' + x[0] + '\';App.go(\'master\',true)">' + x[1] + ' (' + md.persons.filter(p => !x[0] || p.role_type === x[0]).length + ')</button>').join('') + '</div><span class="grow"></span><button class="btn pri" onclick="Master.personDlg()"><i data-lucide="plus"></i> Tambah nama</button></div>' +
      '<div class="body"><div class="tbl-wrap"><table class="t"><thead><tr><th>ID</th><th>Nama</th><th>Role</th><th>Status</th></tr></thead><tbody>' + rows.map(p => '<tr class="click" onclick="Master.personDlg(\'' + h(p.person_id) + '\')"><td>' + h(p.person_id) + '</td><td><b>' + h(p.display_name) + '</b></td><td>' + h(p.role_type) + '</td><td>' + (p.active === 'TRUE' ? '<span class="chip c-ok">Aktif</span>' : '<span class="chip">Nonaktif</span>') + '</td></tr>').join('') + '</tbody></table></div>' +
      '<p class="muted small">Nama nonaktif tidak muncul di pilihan tamu, tetapi tetap tercatat di histori.</p></div></div>';
  },
  personDlg(id) {
    const p = id ? S.md.persons.find(x => x.person_id === id) : { display_name: '', role_type: S.pF || 'MAINTENANCE', active: 'TRUE' };
    const ov = modal(id ? 'Ubah ' + id : 'Tambah nama', '<label class="f">Nama<input class="inp" id="pName" value="' + h(p.display_name) + '"></label>' +
      '<label class="f">Role<select class="inp" id="pRole">' + ['PIC', 'MAINTENANCE', 'UTILITY'].map(r => opt(r, r, p.role_type)).join('') + '</select></label>' +
      '<label class="row small"><input type="checkbox" id="pAct" ' + (p.active === 'TRUE' ? 'checked' : '') + '> Aktif</label>', '<button class="btn" data-close>Batal</button><button class="btn pri" id="pSave">Simpan</button>');
    $('#pSave', ov).onclick = async () => {
      try { await call('savePerson', { person_id: id || '', display_name: $('#pName', ov).value, role_type: $('#pRole', ov).value, active: $('#pAct', ov).checked }); ov.remove(); toast('Tersimpan', 'ok'); App.go('master', true); } catch (e) { toast(e.message, 'err'); }
    };
  },
  account(el) {
    el.innerHTML = '<div class="panel"><div class="head"><h3>Akun login (Admin / SPV / Head)</h3><span class="grow"></span><button class="btn pri" onclick="Master.accountDlg()"><i data-lucide="plus"></i> Tambah akun</button></div><div class="body"><div class="tbl-wrap"><table class="t"><thead><tr><th>Username</th><th>Nama</th><th>Role</th><th>Status</th><th>Login terakhir</th><th></th></tr></thead><tbody>' +
      S.md.accounts.map(a => '<tr><td><b>' + h(a.username) + '</b></td><td>' + h(a.display_name) + '</td><td>' + h(a.role) + '</td><td>' + (a.active === 'TRUE' ? '<span class="chip c-ok">Aktif</span>' : '<span class="chip">Nonaktif</span>') + '</td><td>' + h(fTs(a.last_login_at)) + '</td><td class="nowrap"><button class="btn sm" onclick="Master.accountDlg(\'' + h(a.account_id) + '\')">Ubah</button> <button class="btn sm" onclick="Master.resetPw(\'' + h(a.account_id) + '\',\'' + h(a.username) + '\')">Reset password</button></td></tr>').join('') +
      '</tbody></table></div></div></div>';
  },
  accountDlg(id) {
    const a = id ? S.md.accounts.find(x => x.account_id === id) : { username: '', display_name: '', role: 'SPV', active: 'TRUE' };
    const ov = modal(id ? 'Ubah akun' : 'Tambah akun', '<label class="f">Username<input class="inp" id="acUser" value="' + h(a.username) + '"></label><label class="f">Nama tampilan<input class="inp" id="acName" value="' + h(a.display_name) + '"></label>' +
      '<label class="f">Role<select class="inp" id="acRole">' + ['ADMIN', 'SPV', 'HEAD'].map(r => opt(r, r, a.role)).join('') + '</select></label>' +
      (id ? '<label class="row small"><input type="checkbox" id="acAct" ' + (a.active === 'TRUE' ? 'checked' : '') + '> Aktif</label>' : '<label class="f">Password awal (min. 6)<input class="inp" type="password" id="acPass"></label>'),
      '<button class="btn" data-close>Batal</button><button class="btn pri" id="acSave">Simpan</button>');
    $('#acSave', ov).onclick = async () => {
      try { await call('saveAccount', { account_id: id || '', username: $('#acUser', ov).value, display_name: $('#acName', ov).value, role: $('#acRole', ov).value, active: id ? $('#acAct', ov).checked : true, password: id ? '' : $('#acPass', ov).value }); ov.remove(); toast('Akun disimpan', 'ok'); App.go('master', true); } catch (e) { toast(e.message, 'err'); }
    };
  },
  resetPw(id, user) {
    const ov = modal('Reset password ' + user, '<label class="f">Password baru (min. 6)<input class="inp" type="password" id="rsPw"></label>', '<button class="btn" data-close>Batal</button><button class="btn pri" id="rsGo">Reset</button>');
    $('#rsGo', ov).onclick = async () => { try { await call('resetPassword', { account_id: id, password: $('#rsPw', ov).value }); ov.remove(); toast('Password direset', 'ok'); } catch (e) { toast(e.message, 'err'); } };
  },
  async audit(el) {
    const rows = await call('auditLog');
    el.innerHTML = '<div class="panel"><div class="head"><h3>Audit log (300 terakhir)</h3></div><div class="body"><div class="tbl-wrap"><table class="t"><thead><tr><th>Waktu</th><th>Pelaku</th><th>Aksi</th><th>Entitas</th><th>Detail</th></tr></thead><tbody>' +
      rows.map(r => '<tr><td class="nowrap">' + h(fTs(r.created_at)) + '</td><td>' + h(r.actor_name) + '<div class="muted small">' + h(r.actor_type) + '</div></td><td><b>' + h(r.action) + '</b></td><td>' + h(r.entity_type) + '<div class="muted small">' + h(r.entity_id) + '</div></td><td class="small" style="max-width:420px;word-break:break-word">' + h(r.reason) + (r.after_json ? '<div class="muted">' + h(r.after_json.slice(0, 300)) + '</div>' : '') + '</td></tr>').join('') +
      '</tbody></table></div></div></div>';
  }
};

// ---------- PENGATURAN ----------
Pages.pengaturan = async v => {
  const st = await call('settings'), x = st.values;
  const tog = (k, l) => '<label class="row small"><input type="checkbox" data-set="' + k + '" ' + (x[k] === 'TRUE' ? 'checked' : '') + '> ' + h(l) + '</label>';
  const tpl = (k, l) => '<label class="f">' + h(l) + '<textarea class="inp" rows="4" data-set="' + k + '">' + h(x[k]) + '</textarea></label>';
  v.innerHTML =
    '<div class="panel"><div class="head"><h3>WhatsApp — Fonnte</h3></div><div class="body" style="display:flex;flex-direction:column;gap:12px">' +
    '<div class="row"><label class="f grow">API token (tersimpan di Script Properties, tidak ditampilkan penuh)<input class="inp" type="password" id="fnTok" placeholder="' + h(st.token_masked || 'Belum diatur') + '" autocomplete="off"></label><button class="btn" id="fnTokSave" style="margin-top:18px">Simpan token</button></div>' +
    '<label class="f">Group ID tujuan (pisahkan koma bila lebih dari satu)<input class="inp" data-set="WA_GROUPS" value="' + h(x.WA_GROUPS) + '" placeholder="1203630xxxxx@g.us"></label>' +
    '<div class="row"><button class="btn" id="fnTest"><i data-lucide="send"></i> Tes koneksi / kirim pesan tes</button><span id="fnOut" class="small"></span></div>' +
    '<div class="grid2" style="gap:6px"><div><b class="small">Jenis notifikasi</b>' + tog('NOTIF_NOK', 'Temuan NO OK baru') + tog('NOTIF_SPV', 'Perbaikan selesai — menunggu SPV') + tog('NOTIF_HEAD', 'SPV menyetujui — menunggu Head') + tog('NOTIF_REJECT', 'Approval ditolak — kembali ke perbaikan') + tog('NOTIF_DONE', 'Kasus selesai (Head menyetujui)') + tog('NOTIF_REMINDER', 'Pengingat perbaikan belum selesai (harian 07.30)') + '</div>' +
    '<div><label class="f">Format pesan NO OK<select class="inp" data-set="NOK_FORMAT">' + opt('POINT', '1 pesan per point NO OK', x.NOK_FORMAT) + opt('ASSET', 'Rangkuman per alat (1 pesan per checklist)', x.NOK_FORMAT) + '</select></label>' +
    '<p class="muted small">Placeholder: {alat} {checkpoint} {pic} {waktu} {kasus} {departemen} {status} {catatan} {approver} {daftar} {link}</p></div></div>' +
    '<details><summary class="small" style="cursor:pointer;font-weight:600">Template pesan</summary><div class="grid2 mt" style="gap:10px">' + tpl('TPL_NOK', 'NO OK — per point') + tpl('TPL_NOK_ASSET', 'NO OK — rangkuman per alat') + tpl('TPL_SPV', 'Menunggu SPV') + tpl('TPL_HEAD', 'Menunggu Head') + tpl('TPL_REJECT', 'Ditolak') + tpl('TPL_DONE', 'Kasus selesai') + tpl('TPL_REMINDER', 'Pengingat') + '</div></details>' +
    '</div></div>' +
    '<div class="panel"><div class="head"><h3>Foto, Drive & Backup</h3></div><div class="body" style="display:flex;flex-direction:column;gap:12px">' +
    '<div class="row"><label class="f">Batas ukuran foto (KB)<input class="inp" type="number" min="200" max="20480" data-set="PHOTO_MAX_KB" value="' + h(x.PHOTO_MAX_KB) + '"></label>' +
    '<label class="f">Retensi backup (hari, 0 = selamanya)<input class="inp" type="number" min="0" max="3650" data-set="BACKUP_RETENTION_DAYS" value="' + h(x.BACKUP_RETENTION_DAYS) + '"></label></div>' +
    '<div class="row"><a class="btn" href="' + h(st.root_folder_url) + '" target="_blank" rel="noopener"><i data-lucide="folder"></i> Buka folder Drive</a><button class="btn" id="bkNow"><i data-lucide="database"></i> Backup sekarang</button>' +
    '<span class="muted small">Backup otomatis setiap hari ±02.00 WIB · checklist aktif sejak ' + h(fTs(st.activated_at) || '— (belum aktif)') + '</span></div></div></div>' +
    '<div class="row"><span class="grow"></span><button class="btn pri lg" id="setSave">Simpan pengaturan</button></div>' +
    '<div class="panel"><div class="head"><h3>Log notifikasi</h3><span class="grow"></span><button class="btn sm" id="nlRetry"><i data-lucide="refresh-cw"></i> Kirim ulang yang gagal</button></div><div class="body" id="nlBody"><div class="empty">Memuat…</div></div></div>' +
    '<div class="panel"><div class="head"><h3>Log backup</h3></div><div class="body" id="bkBody"><div class="empty">Memuat…</div></div></div>';
  $('#setSave').onclick = async () => {
    const values = {}; $$('[data-set]', v).forEach(i => { values[i.dataset.set] = i.type === 'checkbox' ? (i.checked ? 'TRUE' : 'FALSE') : i.value; });
    try { await call('saveSettings', { values }); toast('Pengaturan disimpan', 'ok'); } catch (e) { toast(e.message, 'err'); }
  };
  $('#fnTokSave').onclick = async () => { try { const r = await call('saveFonnteToken', { token: $('#fnTok').value }); $('#fnTok').value = ''; $('#fnTok').placeholder = r.token_masked || 'Belum diatur'; toast('Token disimpan', 'ok'); } catch (e) { toast(e.message, 'err'); } };
  $('#fnTest').onclick = async () => {
    $('#fnOut').textContent = 'Menguji…';
    try { const r = await call('testFonnte'); $('#fnOut').innerHTML = 'Perangkat: ' + (r.device_ok ? '<span class="chip c-ok">' + h(r.device.device_status || 'OK') + '</span>' : '<span class="chip c-bad">gagal</span> ' + h(r.device_text.slice(0, 120))) + ' · Pesan tes: ' + (r.send_ok ? '<span class="chip c-ok">terkirim</span>' : '<span class="chip c-bad">gagal</span> ' + h(r.send_text.slice(0, 120))); App.loadLogs(); }
    catch (e) { $('#fnOut').textContent = e.message; }
  };
  $('#bkNow').onclick = async () => { toast('Membuat backup…'); try { const r = await call('backupNow'); toast('Backup dibuat: ' + r.file_name, 'ok'); App.loadLogs(); } catch (e) { toast(e.message, 'err'); } };
  $('#nlRetry').onclick = async () => { try { const r = await call('retryNotif', {}); toast(r.sent + ' dari ' + r.tried + ' pesan terkirim ulang', r.sent ? 'ok' : ''); App.loadLogs(); } catch (e) { toast(e.message, 'err'); } };
  App.loadLogs();
};
App.loadLogs = async () => {
  try {
    const [nl, bk] = await Promise.all([call('notifLog'), call('backupLog')]);
    if (!$('#nlBody')) return;
    $('#nlBody').innerHTML = nl.length ? '<div class="tbl-wrap" style="max-height:360px"><table class="t"><thead><tr><th>Waktu</th><th>Jenis</th><th>Ringkasan</th><th>Status</th><th>Percobaan</th><th>Respons</th></tr></thead><tbody>' + nl.map(n =>
      '<tr><td class="nowrap">' + h(fTs(n.created_at)) + '</td><td>' + h(n.event_type) + '</td><td class="small" style="max-width:360px">' + h(n.payload_summary) + '</td><td>' + (n.status === 'SENT' ? '<span class="chip c-ok">Terkirim</span>' : n.status === 'FAILED' ? '<span class="chip c-bad">Gagal</span>' : '<span class="chip c-warn">' + h(n.status) + '</span>') + '</td><td>' + h(n.attempt_count) + '</td><td class="small muted" style="max-width:240px;word-break:break-word">' + h(String(n.provider_response).slice(0, 160)) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">Belum ada notifikasi</div>';
    $('#bkBody').innerHTML = bk.length ? '<div class="tbl-wrap" style="max-height:300px"><table class="t"><thead><tr><th>Waktu</th><th>Jenis</th><th>File</th><th>Status</th><th>Pesan</th></tr></thead><tbody>' + bk.map(b =>
      '<tr><td class="nowrap">' + h(fTs(b.created_at)) + '</td><td>' + h(b.type) + '</td><td>' + (b.file_id && !b.trashed_at ? '<a target="_blank" rel="noopener" href="https://docs.google.com/spreadsheets/d/' + h(b.file_id) + '">' + h(b.file_name) + '</a>' : h(b.file_name) + (b.trashed_at ? ' <span class="muted small">(dihapus retensi)</span>' : '')) + '</td><td>' + (b.status === 'OK' ? '<span class="chip c-ok">OK</span>' : '<span class="chip c-bad">Gagal</span>') + '</td><td class="small">' + h(b.message) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">Belum ada backup</div>';
  } catch (e) { /* abaikan */ }
};

// Mulai: cek status instalasi ke server (pengganti BOOT dari doGet), lalu jalankan aplikasi.
google.script.run.withSuccessHandler(r => { BOOT.installed = !!(r && r.data && r.data.installed); App.init(); })
  .withFailureHandler(e => { $('#boot').innerHTML = '<div class="muted" style="text-align:center">Tidak bisa terhubung ke server Apps Script.<br>Periksa API_URL di script.js dan koneksi internet.<br><small>' + h(e && e.message || e) + '</small></div>'; })
  .api(null, 'publicInfo', {});
