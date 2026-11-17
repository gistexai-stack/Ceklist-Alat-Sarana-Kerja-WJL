# Migrasi Backend ke Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengganti backend Google Apps Script dengan Supabase (Postgres + Storage + satu Edge Function) yang menjalankan 38 aksi API dengan perilaku dan bentuk respons yang sama, lalu memindahkan semua data & foto lama lewat `Migrasi.gs`.

**Architecture:** Satu Edge Function `api` (TypeScript/Deno) memporting logika `Code.gs` per modul, berbicara ke Postgres & Storage dengan service role. Semua tabel memakai kolom `text` dengan nama kolom persis seperti `SCHEMA` di `Code.gs`, sehingga nilai (`'TRUE'`, `'yyyy-MM-dd HH:mm:ss'` WIB) dan respons ke frontend tidak berubah. RLS aktif tanpa policy → browser tidak bisa menyentuh tabel langsung. `pg_cron` + `pg_net` memanggil fungsi yang sama untuk tugas terjadwal.

**Tech Stack:** Supabase (Postgres 15+, Storage, Vault, pg_cron, pg_net, Edge Functions/Deno 2), `@supabase/supabase-js@2.49.1` (npm specifier), SheetJS `xlsx@0.18.5`, jsPDF `2.5.2` + `jspdf-autotable@3.8.4` (CDN jsDelivr, frontend), Supabase CLI via `npx supabase` (v3.1.0), Deno via `npx deno` (v2.9.6). Tidak ada Docker → tidak ada Supabase lokal; uji integrasi berjalan ke proyek Supabase sungguhan (data uji dihapus sebelum migrasi final).

**Spec:** `docs/superpowers/specs/2026-11-16-supabase-migration-design.md`
**Acuan perilaku (JANGAN DIUBAH):** `C:\Users\dimas.aditia\Documents\Claude\Dashboard Ceklist Alat Kerja WJL\src\Code.gs` — setiap fungsi port merujuk ke nama fungsi aslinya. Baca fungsi aslinya sebelum menulis port.

## Global Constraints

- `Code.gs` tidak boleh diubah sedikit pun.
- Frontend: hanya `web/script.js` yang diubah (`index.html`, `style.css` tidak).
- Respons API: `{ success, data, message, code }`; error pengguna memakai kode yang sama dengan `Code.gs` (`AUTH`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `AUTH_FAIL`, `LOCKED`, `PHOTO_INVALID`, `PHOTO_TOO_BIG`, `ERROR`); error tak terduga → pesan `'Terjadi kesalahan sistem. Coba lagi atau hubungi Admin.'` kode `ERROR`.
- Zona waktu: Asia/Jakarta (UTC+7, tanpa DST). Hari operasional mulai 07.00. Format timestamp `yyyy-MM-dd HH:mm:ss`.
- Sesi berlaku 6 jam (`SESSION_TTL = 21600`).
- Password: 300× `base64(sha256(salt + h + salt))`, kolom `password_hash` & `salt` dipakai apa adanya.
- Tidak ada secret di repo (repo GitHub publik). Service role key, token Fonnte, `CRON_SECRET` hanya di secret Supabase / Script Properties / file `.env.test.local` (gitignored).
- Foto lama dikecilkan saat dipindah: target ≤ 1 MB, sisi terpanjang ±1280 px, JPEG; foto ≤ 1 MB dipindah apa adanya.
- Paket gratis Supabase: database < 500 MB, Storage < 1 GB.
- Cron (WIB): tiap jam (`cronHourly`), 02:00 (`cronBackup`), 07:30 (`cronReminder`). `pg_cron` memakai UTC: `0 * * * *`, `0 19 * * *`, `30 0 * * *`.
- Rollback hanya pada hari cutover.
- Semua pekerjaan di branch `supabase-migration`; **tidak di-merge ke `main` sebelum Task 11** (push ke `main` langsung mengubah situs live).
- Commit diakhiri baris `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Lebih dari 1.000 baris** di satu tabel (SCHEDULE, CHECKLIST_DETAIL sudah ribuan): PostgREST memotong di 1.000 baris → dashboard/laporan diam-diam salah. `selectAll` wajib memaginasi (uji di Task 2).
2. **Dua teknisi klaim item yang sama bersamaan**: hanya satu yang berhasil, yang lain mendapat pesan sudah diambil (uji di Task 5).
3. **Dua checklist NO OK untuk alat yang sama hampir bersamaan**: tetap hanya satu kasus terbuka per alat (unique index + coba ulang; uji di Task 4).
4. **Batas waktu WIB**: submit pukul 06:59 WIB masuk hari operasional kemarin; shift berganti tepat 07:00/15:00/23:00; jadwal lewat `close_at` menjadi MISSED meski cron belum jalan (`effStatus_`) (uji di Task 2 & 4).
5. **Akun dinonaktifkan / sesi kedaluwarsa** saat pengguna masih membuka aplikasi: aksi berikutnya mengembalikan kode `AUTH` sehingga frontend logout (uji di Task 3).

---

## Prasyarat dari pemilik (sebelum Task 1)

- Project ref, Project URL, publishable/anon key Supabase.
- Menjalankan sendiri di terminal: `npx supabase login` lalu `npx supabase link --project-ref <ref>` di root repo (meminta password database).
- Membuat file `.env.test.local` (gitignored) berisi `SUPABASE_URL=…`, `SUPABASE_SERVICE_ROLE_KEY=…`, `API_URL=https://<ref>.supabase.co/functions/v1/api`. Agen tidak meminta key ini lewat chat.

---

### Task 1: Skema database, keamanan, Storage, Vault

**Files:**
- Create: `supabase/config.toml` (dari `npx supabase init`, lalu tambah `[functions.api] verify_jwt = false`)
- Create: `supabase/migrations/20261116000001_schema.sql`
- Create: `supabase/migrations/20261116000002_storage_vault.sql`
- Create: `tests/db_test.ts`
- Modify: `.gitignore` (tambah `.env.test.local`, `supabase/.temp/`, `supabase/.branches/`)

**Interfaces:**
- Produces: 16 tabel huruf kecil sesuai `SCHEMA` (`master_asset`, `master_checkpoint`, `master_person`, `master_account`, `schedule`, `checklist_header`, `checklist_detail`, `repair_case`, `repair_item`, `repair_log`, `approval`, `notification_log`, `system_settings`, `audit_log`, `backup_log`), semua kolom `text not null default ''`, primary key = kolom pertama. Tambahan: `session(token text pk, data jsonb not null, expires_at timestamptz not null)`, `login_fail(username text pk, fails int not null, until timestamptz not null)`.
- Index: `schedule(operational_date)`, `schedule(asset_id)`, `checklist_detail(checklist_id)`, `repair_item(case_id)`, `repair_log(case_id)`, `approval(case_id)`, `notification_log(event_id)`; unique partial `repair_case(asset_id) where status in ('PERLU_PERBAIKAN','SEDANG_DIPERBAIKI','MENUNGGU_SPV','MENUNGGU_HEAD')`.
- RLS `enable` di semua tabel, tanpa policy; `revoke all` dari `anon, authenticated`.
- Bucket privat `photos` dan `backups`.
- RPC (security definer, `grant execute` hanya ke `service_role`): `get_fonnte_token() returns text`, `set_fonnte_token(p_token text) returns void` (Vault secret bernama `fonnte_token`; string kosong = hapus).

- [ ] **Step 1: Tulis uji `tests/db_test.ts`** (Deno, baca `.env.test.local`)
  - `anon tidak bisa membaca master_account`: `createClient(SUPABASE_URL, ANON_KEY).from('master_account').select('*')` → `data` kosong atau error (tidak ada baris walau tabel berisi).
  - `service role bisa insert & baca schedule`: insert 1 baris, select by id → sama.
  - `unique kasus terbuka per alat`: insert 2 `repair_case` status `PERLU_PERBAIKAN` asset sama → insert kedua error kode `23505`.
  - `fonnte token via vault`: `rpc('set_fonnte_token',{p_token:'abc'})` lalu `rpc('get_fonnte_token')` → `'abc'`; anon memanggil `get_fonnte_token` → error.
- [ ] **Step 2: Jalankan, pastikan gagal** — `npx deno test -A --env-file=.env.test.local tests/db_test.ts` → FAIL (tabel belum ada).
- [ ] **Step 3: Tulis kedua file migrasi** sesuai Interfaces.
- [ ] **Step 4: Terapkan** — `npx supabase db push` → "Finished supabase db push".
- [ ] **Step 5: Jalankan uji** → PASS (4 tes). Hapus baris uji di akhir tiap tes.
- [ ] **Step 6: Commit** — `git checkout -b supabase-migration` (sekali), `git add supabase tests .gitignore`, `git commit -m "Add Supabase schema, storage, vault"`.

### Task 2: Inti Edge Function (util, db, dispatcher, publicInfo)

**Files:**
- Create: `supabase/functions/api/index.ts`, `lib/util.ts`, `lib/db.ts`, `lib/settings.ts`, `lib/routes.ts`, `lib/types.ts`
- Create: `supabase/functions/api/lib/util_test.ts`, `supabase/functions/api/lib/db_test.ts`, `tests/api_helpers.ts`, `tests/api_core_test.ts`

**Interfaces:**
- `lib/types.ts`: `type Session = { type: 'ACCOUNT'|'GUEST'; role: string; name: string; account_id?: string; username?: string; person_id?: string }`; `type ApiResult = { success: boolean; data: unknown; message: string; code: string }`; `type RouteFn = (s: Session|null, a: Record<string, any>, token: string) => Promise<unknown>`.
- `lib/util.ts` (port bagian 3 `Code.gs`): `ts(d?: Date): string`, `pts(s: string): Date|null`, `opDate(d: Date): string`, `addDays(day: string, n: number): string`, `shiftOf(d: Date): '1'|'2'|'3'`, `hoursBetween(a: string, b: string): number|''`, `pad(n: number, w: number): string`, `uid(p: string): string`, `ids(s: string): string[]`, `num(v: unknown): number`, `clean(o): object` (buang `password_hash`, `salt`), `fill(tpl: string, vars: Record<string,string>): string`, `class UserError extends Error { code: string }`, `err(message, code='VALIDATION'): UserError`, `fail(message, code): ApiResult`. Konstanta `DEPTS`, `LOGGED`, `GUEST`, `ALL`, `SHIFTS`, `CASE_OPEN`, `SESSION_TTL` sama dengan `Code.gs`.
- `lib/db.ts`: `db` (supabase-js, `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` dari env runtime), `selectAll<T>(table: string, filter?: (q) => q): Promise<T[]>` (paginasi `range` per 1.000 sampai habis, urut primary key), `insertRows(table, rows): Promise<void>`, `upsertRows(table, rows): Promise<void>`, `updateWhere(table, patch, match: Record<string,string>): Promise<number>` (jumlah baris berubah; dipakai untuk "klaim hanya bila status masih X").
- `lib/settings.ts`: `DEFAULTS` (salin objek default setting dari `Code.gs` baris ~44–58), `settings(): Promise<Record<string,string>>`, `setSetting(key, value, by)`, `audit(s, action, type, id, before, after, reason)` (port `audit_`).
- `lib/routes.ts`: `ROUTES: Record<string, { roles: string[]|null; fn: RouteFn }>` (daftar & role persis `ROUTES` di `Code.gs`), `api(token: string|null, action: string, args: object): Promise<ApiResult>` (port `api()`, tanpa `cachedRead_`, tanpa cek `installed_` — selalu terpasang). Modul task berikutnya mendaftarkan fungsinya di sini; aksi yang belum diporting melempar `err('Belum tersedia', 'NOT_FOUND')`.
- `index.ts`: `Deno.serve`. `OPTIONS` → 204 + header CORS (`Access-Control-Allow-Origin: *`, `Allow-Methods: POST, OPTIONS`, `Allow-Headers: content-type, x-cron-secret`). `POST` body teks JSON `[token, action, args]` → `api()`; body rusak → `fail('Permintaan tidak valid','BAD_REQUEST')`. Cron: body `['CRON', name, {}]` + header `x-cron-secret` = env `CRON_SECRET` → jalankan fungsi cron (Task 8); secret salah → 403. Semua respons `content-type: application/json` + CORS.
- `publicInfo` (port `publicInfo_`): `{ installed: true, ready, persons }`.
- `tests/api_helpers.ts`: `call(token, action, args): Promise<ApiResult>` (POST `API_URL`, `content-type: text/plain`), `seed(fixture)`: hapus semua baris semua tabel lalu insert fixture lewat service role — **menolak jalan bila `system_settings` berisi key `MIGRATED_AT`** (pengaman data produksi). Fixture dasar `BASE_FIXTURE`: 2 alat (1 `DAILY` PIC, 1 `SHIFT` grup RODA DOFFING), 5 checkpoint terpetakan, personel 2 PIC/1 MAINTENANCE/1 UTILITY, akun `admin`/`spv`/`head` dengan salt `0b7e5c1a-1111-4222-8333-944455556666` dan password `rahasia123`.

- [ ] **Step 1: Uji unit `lib/util_test.ts`**
  - `opDate(new Date('2026-11-16T23:59:00Z'))` (06:59 WIB tgl 17) → `'2026-11-16'`.
  - `opDate(new Date('2026-11-17T00:00:00Z'))` (07:00 WIB) → `'2026-11-17'`.
  - `shiftOf` untuk 07:00, 14:59, 15:00, 22:59, 23:00, 06:59 WIB → `'1','1','2','2','3','3'`.
  - `ts(new Date('2026-11-16T01:02:03Z'))` → `'2026-11-16 08:02:03'`; `pts('2026-11-16 08:02:03').toISOString()` → `'2026-11-16T01:02:03.000Z'`.
  - `fill('{a}-{b}', {a:'x', b:''})` → `'x--'`.
- [ ] **Step 2: Uji integrasi `tests/api_core_test.ts`**
  - `publicInfo` tanpa token → `success:true`, `data.installed === true`, `data.persons.PIC.length === 2`.
  - aksi tak dikenal → `code === 'NOT_FOUND'`.
  - body bukan JSON → `code === 'BAD_REQUEST'`.
  - `OPTIONS` → status 204, header `access-control-allow-origin` = `*`.
  - **selectAll > 1.000 baris** (`lib/db_test.ts`, env `.env.test.local`): seed 1.205 baris `schedule`, `selectAll('schedule')` → panjang `1205`.
- [ ] **Step 3: Jalankan → FAIL.** `npx deno test -A supabase/functions/api/lib/` dan `npx deno test -A --env-file=.env.test.local tests/api_core_test.ts`.
- [ ] **Step 4: Implementasi** file-file di atas.
- [ ] **Step 5: Deploy** — `npx supabase functions deploy api --no-verify-jwt --use-api` → "Deployed Functions".
- [ ] **Step 6: Jalankan uji → PASS.**
- [ ] **Step 7: Commit** — `git commit -m "Add api edge function core and publicInfo"`.

### Task 3: Autentikasi & sesi

**Files:**
- Create: `supabase/functions/api/lib/auth.ts`, `lib/auth_test.ts`, `tests/auth_test.ts`
- Modify: `lib/routes.ts` (daftarkan aksi)

**Interfaces:**
- `hash(pw: string, salt: string): Promise<string>` (Web Crypto SHA-256).
- `newSession(data: Session): Promise<string>` (token 2×`crypto.randomUUID()`, `expires_at = now + 6 jam`), `sess(token): Promise<Session|null>` (null bila tidak ada/kedaluwarsa), `validSess(s): Promise<boolean>` (port `validSess_`).
- Route: `login`, `guestLogin`, `logout`, `changePassword` (port `login_`, `guestLogin_`, `logout_`, `changePassword_`). Batas gagal login: 5 kali → `LOCKED` 10 menit via tabel `login_fail`.
- `routes.ts` `api()` memakai `sess` + `validSess` → `fail('Sesi berakhir, silakan masuk lagi','AUTH')`.

- [ ] **Step 1: Uji unit** — `hash('rahasia123','0b7e5c1a-1111-4222-8333-944455556666')` → `'UD8BCEAElCl8Qe99+tzOZn1YQAijyLi3fb/VYtcQlnI='` (dihitung dengan algoritme `hash_`).
- [ ] **Step 2: Uji integrasi `tests/auth_test.ts`**
  - login `admin`/`rahasia123` → `data.me.role === 'ADMIN'`, `data.token.length === 72`; `master_account.last_login_at` terisi.
  - password salah → `code 'AUTH_FAIL'`; 5× salah lalu benar → `code 'LOCKED'`.
  - `guestLogin` PIC valid → `me.type === 'GUEST'`; role tidak cocok → `success:false`.
  - aksi ber-role untuk uji sesi: `changePassword` dengan password lama salah → sesi valid memberi `code 'VALIDATION'`, sesi tidak valid memberi `code 'AUTH'`.
  - setelah `logout`, `changePassword` dengan token itu → `code 'AUTH'`.
  - **akun dinonaktifkan**: login spv, set `master_account.active='FALSE'` via service role, `changePassword` → `code 'AUTH'`.
  - sesi kedaluwarsa: set `session.expires_at` ke masa lalu → `changePassword` → `code 'AUTH'`.
  - `changePassword` lama salah → gagal; benar → login dengan password baru berhasil.
- [ ] **Step 3: Jalankan → FAIL.** **Step 4: Implementasi.** **Step 5: Deploy & jalankan → PASS.**
- [ ] **Step 6: Commit** — `git commit -m "Port authentication and sessions"`.

### Task 4: Jadwal, checklist, foto

**Files:**
- Create: `supabase/functions/api/lib/schedule.ts`, `lib/photos.ts`, `tests/checklist_test.ts`
- Modify: `lib/routes.ts`

**Interfaces:**
- `schedule.ts` (port bagian 7–9 `Code.gs`): `isMasterReady()`, `slots(asset, day)`, `ensureSchedules(force: boolean)` (insert `on conflict do nothing`, `schedule_id` deterministik `SCH-yyyymmdd-<asset>-<1|2|3|D>`), `markMissed()`, `effStatus(s, now)`, `checkableAssetIds(s)`, `picsOfAsset(asset, assets)`; route `worklist`, `checklistForm`, `submitChecklist`, `todaySchedules`, `checklistDetail`.
- `mergeFindings(asset, noks, nowStr)` (port `mergeFindings_`) beserta `resetItem`, `logRepair`, `recomputeCase` diletakkan di `schedule.ts` agar Task 4 mandiri; Task 5 mengimpornya dari sana. Kasus baru: `case_id = 'CASE-' + pad(max+1, 5)`; bila insert gagal `23505` (kasus terbuka sudah dibuat proses lain atau ID bentrok) → muat ulang kasus terbuka alat itu dan gabungkan, maksimal 3 kali coba.
- `submitChecklist`: update schedule `WHERE status='OPEN'` (via `updateWhere`); 0 baris → `err('Jadwal sudah diperiksa')`. Notifikasi NO OK memanggil `notify()` dari Task 7 — sampai Task 7 selesai, `notify` adalah stub no-op di `lib/notify.ts` dengan signature `notify(type: string, eventId: string, vars: Record<string,string>, tplKey?: string): Promise<void>`.
- `photos.ts`: `savePhoto(dataUrl: string, asset, name: string): Promise<{ id: string; url: string }>` (validasi seperti `savePhoto_`; batas `PHOTO_MAX_KB`; simpan di bucket `photos` path = `id` = `uid('PH')` + 12 karakter acak tambahan agar ≥ 20 karakter; `url` = `''`), `photoSignedUrl(id: string, seconds: number): Promise<string>`; route `photo` (validasi regex `^[-\w]{20,}$`, kembalikan signed URL 1 jam).

- [ ] **Step 1: Uji `tests/checklist_test.ts`** (seed `BASE_FIXTURE`, set `ACTIVATED_AT` kemarin)
  - `ensureSchedules` via `worklist` PIC → item untuk alat DAILY hari ini; alat SHIFT hanya shift berjalan.
  - `checklistForm` lalu `submitChecklist` semua OK → `checklist_header.ok_count` = jumlah point, `nok_count '0'`, schedule `DONE`.
  - submit kedua untuk schedule sama → `success:false`.
  - submit dengan 1 NO OK + foto data URL JPEG kecil → `repair_case` baru `PERLU_PERBAIKAN`, `checklist_detail.photo_file_id` terisi, `photo` aksi mengembalikan URL `https://…/storage/v1/object/sign/photos/…`.
  - foto > `PHOTO_MAX_KB` → `code 'PHOTO_TOO_BIG'`; data URL `image/gif` → `PHOTO_INVALID`.
  - **dua NO OK bersamaan** untuk alat yang sama (dua schedule berbeda, `Promise.all`) → tepat 1 baris `repair_case` terbuka untuk alat itu, dengan 2 detail tertaut.
  - schedule `OPEN` dengan `close_at` lampau → `todaySchedules` menampilkan `MISSED` sebelum `markMissed` jalan; setelah `markMissed()`, kolom `status` di tabel = `MISSED`.
- [ ] **Step 2: FAIL. Step 3: Implementasi. Step 4: Deploy → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "Port schedules, checklist and photos"`.

### Task 5: Kasus perbaikan & approval

**Files:**
- Create: `supabase/functions/api/lib/repair.ts`, `lib/approval.ts`, `tests/repair_test.ts`
- Modify: `lib/routes.ts`

**Interfaces:**
- Consumes: `mergeFindings`, `savePhoto`, `notify` (stub).
- `repair.ts` (port bagian 10): `findItem`, `canRepair(s, item)` (memakai `resetItem`, `logRepair`, `recomputeCase` dari `schedule.ts`); route `repairQueue`, `claimItem` (`updateWhere('repair_item', {status:'CLAIMED',…}, {case_item_id, status:'OPEN'})`; 0 baris → `err` dengan pesan sama seperti `claimItem_`), `completeItem`, `releaseItem`, `caseDetail`, `caseList`.
- `approval.ts` (port bagian 11): route `approvalQueue`, `decide` (cek `cycle_no` & status saat ini memakai `updateWhere` pada `repair_case` dengan `status` lama sebagai syarat).

- [ ] **Step 1: Uji `tests/repair_test.ts`** (seed + buat kasus lewat `submitChecklist` NO OK)
  - teknisi MAINTENANCE `claimItem` → item `CLAIMED`, kasus `SEDANG_DIPERBAIKI`; PIC mengklaim item departemen MAINTENANCE → `success:false`.
  - **klaim bersamaan**: dua sesi MAINTENANCE berbeda `Promise.all(claimItem)` → tepat satu `success:true`.
  - `completeItem` tanpa foto → gagal; dengan foto → item `DONE`; semua item DONE → kasus `MENUNGGU_SPV`.
  - `decide` SPV APPROVE → `MENUNGGU_HEAD`; HEAD APPROVE → `SELESAI`, `closed_at` terisi; `approval` 2 baris.
  - `decide` REJECT dengan `item_ids` → item kembali `OPEN`, `rework_count '1'`, `cycle_no` naik, `repair_log` berisi event `REOPEN_REJECT`.
  - `decide` dengan `cycle_no` lama → `success:false`.
  - `caseList` filter status & paging `size` 20 → `total` benar.
- [ ] **Step 2: FAIL. Step 3: Implementasi. Step 4: Deploy → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "Port repair cases and approval"`.

### Task 6: Monitoring & laporan

**Files:**
- Create: `supabase/functions/api/lib/monitoring.ts`, `tests/monitoring_test.ts`
- Modify: `lib/routes.ts`

**Interfaces:**
- Port bagian 13–14: route `lookups`, `dashboard`, `kanban`, `report`; helper `scope(f)`, `inRange`, `avg`, `buildReport(f)` (8 jenis `REPORTS` persis `Code.gs`), `filterText(f)`.
- `report` menerima `all: true` → kembalikan semua baris (tanpa paging) plus `filter_text: string` dan `generated_at: string`; saat `all` dan `format` (`'xlsx'|'pdf'`) ada, catat audit `EXPORT_XLSX`/`EXPORT_PDF` seperti `exportReport_`.
- Kolom "Link Foto (Drive)" di laporan `findings`: `photo_url` bila diawali `https://drive.google.com`, selain itu `photoSignedUrl(photo_file_id, 604800)` (7 hari).
- Route `exportReport` tetap terdaftar dan melempar `err('Export dibuat di browser','NOT_FOUND')` (frontend tidak memanggilnya lagi).

- [ ] **Step 1: Uji `tests/monitoring_test.ts`** (fixture berisi 3 hari jadwal: DONE, MISSED, OPEN; 1 kasus SELESAI, 1 terbuka)
  - `lookups` → `opDate`, `shift`, `pendingSpv`, `pendingHead`, `assets.length === 2`.
  - `dashboard` periode 3 hari → `kpi.done`, `kpi.missed`, `kpi.compliance` sesuai fixture (hitung manual di fixture); `trend.length` sesuai `gran`.
  - `kanban` tanggal fixture → 7 kolom dengan kunci `BELUM, CEK_OK, PERLU_PERBAIKAN, SEDANG_DIPERBAIKI, MENUNGGU_SPV, MENUNGGU_HEAD, SELESAI`.
  - `report` tiap jenis `REPORTS` → `success:true`, `columns.length > 0`; `report` `findings` + `all:true` → link foto baru berupa signed URL dan foto lama tautan Drive.
- [ ] **Step 2: FAIL. Step 3: Implementasi. Step 4: Deploy → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "Port dashboard, kanban and reports"`.

### Task 7: Master data, pengaturan, notifikasi WhatsApp

**Files:**
- Create: `supabase/functions/api/lib/master.ts`, `tests/master_test.ts`
- Modify: `lib/notify.ts` (ganti stub), `lib/routes.ts`

**Interfaces:**
- `master.ts` (port bagian 15): route `masterData`, `saveAsset`, `saveMapping`, `savePerson`, `saveAccount`, `resetPassword`, `auditLog`. ID checkpoint baru `'CHK-' + pad(n, 3)` seperti `Code.gs`.
- `notify.ts` (port bagian 16): `fonnte(path, payload): Promise<{ ok: boolean; text: string }>` (token dari `rpc('get_fonnte_token')`), `notify(...)` (signature Task 4; dedupe `event_id`), `sendRow(row)`; route `settings` (`token_masked`, `root_folder_url = 'https://supabase.com/dashboard/project/<ref>/storage/buckets'` — `<ref>` dari env `SUPABASE_URL`), `saveSettings` (hanya `EDITABLE_SETTINGS`), `saveFonnteToken` (`rpc('set_fonnte_token')`), `testFonnte`, `notifLog`, `retryNotif`.
- Tautan di template: `appUrl()` = env `APP_URL` (secret Supabase, mis. `https://gistexgroup.web.id`), tautan kasus `APP_URL + '/?case=' + case_id`.

- [ ] **Step 1: Uji `tests/master_test.ts`**
  - non-admin memanggil `masterData` → `code 'FORBIDDEN'`.
  - `saveAsset` alat baru 2 checkpoint → `masterData.assets` bertambah, checkpoint ber-ID `CHK-…`.
  - `saveAccount` username duplikat → gagal; akun baru bisa login.
  - `saveFonnteToken('tok123456')` → `settings.token_masked` tidak memuat `tok123456` utuh; `get_fonnte_token` = `'tok123456'`.
  - `notify` dengan `NOTIF_NOK='TRUE'` dan `WA_GROUPS` kosong → baris `notification_log` status `FAILED`, `provider_response 'Group ID belum diatur'`; event_id sama dua kali → tetap 1 baris.
  - (Fonnte sungguhan tidak dipanggil di uji: `WA_GROUPS` dikosongkan.)
- [ ] **Step 2: FAIL. Step 3: Implementasi. Step 4: Deploy, set secret `npx supabase secrets set APP_URL=https://ceklist-alat-sarana-kerja-wjl.vercel.app` → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "Port master data, settings and WhatsApp notifications"`.

### Task 8: Backup & fungsi cron

**Files:**
- Create: `supabase/functions/api/lib/backup.ts`, `lib/cron.ts`, `tests/backup_cron_test.ts`
- Modify: `lib/routes.ts`, `index.ts`

**Interfaces:**
- `backup.ts`: `backup(type: 'AUTO'|'MANUAL', s: Session|null): Promise<{ file_name: string; url: string }>` — workbook SheetJS (`npm:xlsx@0.18.5`), satu sheet per tabel (kecuali `session`, `login_fail`; kolom `password_hash`/`salt` ikut agar backup bisa dipulihkan), nama `DB_BACKUP_yyyy-MM-dd_HHmm_<TYPE>.xlsx`, simpan di bucket `backups`, `backup_log.file_id` = path; hapus objek lebih tua dari `BACKUP_RETENTION_DAYS` dan isi `trashed_at`. Route `backupNow`, `backupLog` (tiap baris OK yang belum dihapus mendapat `url` signed 1 hari).
- `cron.ts`: `cronHourly()` (`ensureSchedules(true)`, `markMissed()`, `retryNotif`), `cronBackup()`, `cronReminder()` (port persis `cronReminder`). `index.ts` memetakan nama `'cronHourly'|'cronBackup'|'cronReminder'`.

- [ ] **Step 1: Uji `tests/backup_cron_test.ts`**
  - `backupNow` (admin) → `backup_log` 1 baris OK, objek ada di bucket `backups`, `backupLog[0].url` diawali `https://`.
  - file backup dibuka dengan SheetJS → ada sheet `master_asset` dengan jumlah baris = tabel.
  - retensi: buat baris `backup_log` + objek dengan `created_at` 100 hari lalu, `BACKUP_RETENTION_DAYS='90'`, `backupNow` → objek lama terhapus, `trashed_at` terisi.
  - POST cron `['CRON','cronHourly',{}]` tanpa / salah `x-cron-secret` → 403; dengan secret benar → 200 dan schedule hari ini dibuat.
- [ ] **Step 2: FAIL. Step 3: Implementasi; set `npx supabase secrets set CRON_SECRET=<acak 40 karakter>` dan simpan nilai yang sama ke Vault lewat SQL Editor/psql: `select vault.create_secret('<nilai>', 'cron_secret');` (dipakai cron di Task 11; nilai tidak masuk repo). Step 4: Deploy → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "Port backup and cron jobs"`.

### Task 9: Frontend `web/script.js`

**Files:**
- Modify: `web/script.js`
- Create: `docs/superpowers/cutover-checklist.md` (bagian "Uji frontend")

**Interfaces:**
- Consumes: semua aksi Task 2–8; `report` dengan `all:true`.
- `API_URL` = `https://<ref>.supabase.co/functions/v1/api`. Transport `fetch` yang ada tidak diubah.
- Hapus blok `MODE DEMO` (fungsi tiruan). 
- `Report.exp(fmt)`: panggil `report` dengan `Object.assign({}, S.repF, { all: true, format: fmt })`, lalu buat file di browser. Library dimuat sekali lewat `<script>` dinamis dari jsDelivr: `xlsx@0.18.5/dist/xlsx.full.min.js`, `jspdf@2.5.2/dist/jspdf.umd.min.js`, `jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js`. Isi file: 4 baris meta seperti `exportReport_` (`'GISTEX — ' + title`, `'Periode: '…`, `'Filter: ' + filter_text`, `'Dibuat: ' + generated_at + ' WIB (Asia/Jakarta) oleh ' + S.me.name`), baris kosong, header kolom, baris data; nama file `title.replace(/[^\w]+/g,'_') + '_' + from + '_' + to + '.xlsx|.pdf'`. PDF landscape A4.
- Tabel laporan: regex tautan `/^https:\/\/drive\.google\.com/` diperluas agar URL `…supabase.co/storage/v1/object/sign/` juga tampil sebagai tautan "Buka".
- Log backup: tautan memakai `b.url` (bukan `docs.google.com/spreadsheets/d/…`); tanpa `url` → teks nama file.
- Tombol Pengaturan "Buka folder Drive" → label "Buka Storage Supabase" (href tetap `st.root_folder_url`).
- Teks "API token (tersimpan di Script Properties…)" → "API token (tersimpan di Supabase Vault, tidak ditampilkan penuh)".

- [ ] **Step 1: Tulis daftar periksa browser** di `docs/superpowers/cutover-checklist.md` bagian "Uji frontend" (preview `http://localhost:5500`, data fixture Task 6, akun fixture). Sebelum implementasi, login di localhost masih menuju Apps Script → daftar periksa belum bisa lolos. Isi daftar periksa:
  - login admin → Dashboard tampil tanpa error console; KPI sama dengan uji Task 6.
  - Checklist (tamu PIC) → submit dengan 1 NO OK + foto → toast "temuan masuk kasus".
  - Perbaikan (tamu MAINTENANCE) → ambil → selesaikan dengan foto → kasus ke SPV.
  - Approval SPV lalu Head → kasus Selesai; foto sebelum/sesudah tampil di drawer kasus.
  - Laporan → Excel & PDF terunduh, berisi baris meta + data; tautan foto "Buka" bisa dibuka.
  - Pengaturan → Backup sekarang → log backup berisi tautan unduh .xlsx; tombol "Buka Storage Supabase".
- [ ] **Step 2: Implementasi perubahan di atas.**
- [ ] **Step 3: Jalankan daftar periksa Step 1 → semua lolos, console tanpa error.** Push branch `supabase-migration` (preview Vercel, **bukan** `main`), ulangi daftar periksa singkat di URL preview.
- [ ] **Step 4: Commit** — `git commit -m "Point frontend to Supabase backend"`.

### Task 10: `Migrasi.gs` (dijalankan pemilik di editor Apps Script)

**Files:**
- Create: `apps-script/Migrasi.gs`
- Create: `apps-script/README-migrasi.md` (langkah untuk pemilik, Bahasa Indonesia)

**Interfaces:**
- Script Properties yang diisi pemilik: `SB_URL`, `SB_SERVICE_KEY`. State: `MIG_STATE` (JSON posisi per tabel & foto).
- `migrasiHitung()`: log jumlah baris tiap sheet `SCHEMA`, jumlah foto unik (dari `CHECKLIST_DETAIL.photo_file_id`, `REPAIR_ITEM.after_photo_file_id`, `REPAIR_LOG.after_photo_file_id`), total ukuran asli, perkiraan setelah dikecilkan (foto > 1 MB dihitung 0,35 MB), dan kesimpulan "MUAT"/"TIDAK MUAT" terhadap batas 500 MB DB / 1 GB Storage (sisakan 30% Storage).
- `migrasiJalankan()`: upsert per tabel (POST `/rest/v1/<tabel>?on_conflict=<pk>`, header `Prefer: resolution=merge-duplicates`, batch 500, semua nilai sebagai string), lalu foto (file ≤ 1 MB → blob asli; > 1 MB → `Drive.Files.get(id,{fields:'thumbnailLink'})`, ganti akhiran `=s\d+` menjadi `=s1280`, ambil dengan `ScriptApp.getOAuthToken()`; unggah ke `/storage/v1/object/photos/<id>` dengan `x-upsert: true`). Berhenti sebelum 5 menit, simpan `MIG_STATE`, pasang trigger 1 menit untuk melanjutkan; selesai → hapus trigger, tulis `system_settings` key `MIGRATED_AT`. Kunci `SYSTEM_SETTINGS` yang dilewati: `ROOT_FOLDER_ID`, `DB_ID`, `APP_URL`.
- `migrasiLaporan()`: tabel perbandingan jumlah baris Sheets vs Supabase (`GET …?select=count` dengan `Prefer: count=exact`) dan daftar ID foto gagal.
- `migrasiBersihkan()`: hapus `SB_SERVICE_KEY`, `MIG_STATE`, trigger migrasi.
- Tidak memanggil satu pun fungsi tulis `Code.gs`; hanya membaca Sheets (`SpreadsheetApp.openById(PropertiesService…getProperty('DB_ID'))`) dan Drive.

- [ ] **Step 1: Uji kering lokal** — salin logika transformasi baris (objek sheet → payload JSON) ke fungsi murni `rowsToPayload(head: string[], values: any[][]): object[]` di bagian atas `Migrasi.gs`; uji dengan `node -e` memuat fungsi itu: tanggal Sheets (objek Date) → string `yyyy-MM-dd HH:mm:ss` WIB, angka → string, kosong → `''`.
- [ ] **Step 2: Implementasi `Migrasi.gs` + README.**
- [ ] **Step 3: Pemilik menempel `Migrasi.gs` (file baru) di proyek Apps Script, mengisi Script Properties, menjalankan `migrasiHitung()`** → agen membaca log yang dikirim pemilik; bila "TIDAK MUAT", berhenti dan laporkan.
- [ ] **Step 4: Uji coba penuh** — pemilik menjalankan `migrasiJalankan()` sampai log "SELESAI" lalu `migrasiLaporan()` → semua tabel cocok, foto gagal = 0 (atau daftar dilaporkan ke pemilik). Uji di browser: login dengan akun asli, riwayat kasus & foto lama tampil.
- [ ] **Step 5: Commit** — `git commit -m "Add one-time Migrasi.gs for data and photo transfer"`.

### Task 11: Cutover

**Files:**
- Create: `supabase/migrations/20261118000001_cron.sql` (dibuat di task ini, tidak sebelumnya)
- Modify: `docs/superpowers/cutover-checklist.md` (dibuat di Task 9; tambah bagian "Hari H" dan "Rollback")

**Interfaces:**
- Cron SQL: `create extension if not exists pg_cron; create extension if not exists pg_net;` lalu 3 `cron.schedule` (`'0 * * * *'` cronHourly, `'0 19 * * *'` cronBackup, `'30 0 * * *'` cronReminder) yang memanggil `net.http_post(url := <API_URL>, body := jsonb_build_array('CRON', '<nama>', '{}'::jsonb), headers := jsonb_build_object('content-type','text/plain','x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='cron_secret')))`.

- [ ] **Step 1: Tambahkan ke `cutover-checklist.md`** urutan Hari H di bawah dan langkah rollback (hari H saja).
- [ ] **Step 2: Hari H (bersama pemilik)**
  1. Umumkan aplikasi berhenti; pemilik mematikan 3 trigger Apps Script (menu Triggers di editor; `Code.gs` tidak diubah).
  2. Data uji dibersihkan lewat project Supabase terpisah; JANGAN menjalankan `seed()` / tes integrasi terhadap project ini (guard `ALLOW_DESTRUCTIVE_TESTS` + `MIGRATED_AT`, lihat `tests/README.md`).
  3. Set Script Property `MIG_FINAL=TRUE`, pemilik menjalankan `migrasiJalankan()` sampai SELESAI, lalu `migrasiLaporan()` → semua cocok dan "Foto gagal: 0" (MIGRATED_AT hanya ditulis bila foto gagal = 0).
  4. Isi token Fonnte HANYA pada hari cutover (Pengaturan aplikasi baru atau `set_fonnte_token`); set `npx supabase secrets set APP_URL=<domain final>` (domain final, bukan preview).
  5. `npx supabase db push` (cron SQL) → `select jobname from cron.job` berisi 3 job.
  6. Pastikan `system_settings.MIGRATED_AT` ada sebelum merge. Merge `supabase-migration` ke `main` dan push → Vercel deploy; cek situs live: login akun asli, dashboard, buka 1 kasus lama dengan foto.
  7. Pemilik menjalankan `migrasiBersihkan()`.
- [ ] **Step 3: Verifikasi 24 jam** — keesokan hari: `cron.job_run_details` menunjukkan cronHourly sukses tiap jam, backup 02:00 ada di log backup, pengingat 07:30 tercatat di log notifikasi; setelah malam pertama, log backup berisi baris dengan penanda AUTO.
- [ ] **Step 4: Commit** — `git commit -m "Enable Supabase cron and document cutover"`.

**Rollback (hanya hari H):** kembalikan `API_URL` di `web/script.js` ke URL Apps Script `…AKfycbzT…/exec`, push ke `main`, nyalakan lagi 3 trigger Apps Script, `select cron.unschedule(jobname) from cron.job`. Data yang terlanjur dicatat di Supabase hari itu dicatat manual oleh pemilik.
