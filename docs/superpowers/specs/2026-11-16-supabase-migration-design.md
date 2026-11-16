# Rancangan: Pindah backend dari Google Apps Script ke Supabase

Tanggal: 16 Nov 2026 · Aplikasi: Monitoring Checklist Alat / Sarana Kerja (PT. Gistex · Weaving WJL)

## 1. Maksud dan alasan

Aplikasi saat ini terdiri dari:

- **Frontend statis** di repo ini (`web/index.html`, `web/script.js`, `web/style.css`), di-hosting di Vercel
  (`ceklist-alat-sarana-kerja-wjl.vercel.app`, rencana domain `gistexgroup.web.id`).
- **Backend Google Apps Script** di repo lain:
  `C:\Users\dimas.aditia\Documents\Claude\Dashboard Ceklist Alat Kerja WJL\src\Code.gs` (1.629 baris).
  Google Sheets dipakai sebagai database, Google Drive untuk foto & backup, CacheService untuk sesi,
  PropertiesService untuk token Fonnte, dan 3 trigger terjadwal.

Pemilik ingin backend **tidak lagi memakai Apps Script**, dan memilih **Supabase**. Akun Supabase sudah
dibuat, dan menurut pemilik repo GitHub ini sudah terhubung ke proyek Supabase-nya (belum diverifikasi, lihat §7).

`Code.gs` adalah **acuan perilaku**: semua aturan bisnis (jadwal, kasus, approval, notifikasi, hak akses)
harus berperilaku sama setelah pindah. Baca `Code.gs` untuk detail tiap aksi.

## 2. Tujuan

1. Semua 38 aksi API yang dipakai `script.js` berjalan di Supabase dengan perilaku dan bentuk respons yang sama
   (`{ success, data, message, code }`), termasuk kode `AUTH` yang membuat frontend logout.
2. **Semua data lama dipindah**: 16 sheet (lihat `SCHEMA` di `Code.gs` baris 27–42) dan **semua foto** di Drive.
3. **Password akun tetap berlaku** (Admin/SPV/Head tidak perlu reset).
4. Tampilan dan alur frontend **tidak berubah** bagi pengguna.
5. Jadwal otomatis tetap jalan tanpa ada yang membuka aplikasi.

## 3. Bukan tujuan

- Mengubah tampilan, menu, atau alur kerja aplikasi.
- Memakai Supabase Auth (email/password Supabase). Login tetap username + password milik aplikasi, dan tamu
  (PIC/Maintenance/Utility) tetap masuk dengan memilih nama tanpa password.
- Menghapus Apps Script atau Google Sheets. Keduanya dibiarkan sebagai cadangan read-only setelah pindah.

## 4. Anti-tujuan (gagal walau "jalan")

- `Code.gs` diubah. **Tidak boleh disentuh.**
- Data bisa dibaca/diubah langsung dari browser dengan anon/publishable key (melewati aturan role/approval).
- Token Fonnte, service-role key, atau secret lain ada di `script.js` atau di repo.
- Ada data/foto lama yang hilang, atau riwayat kasus/approval yang tidak cocok dengan Sheets.
- Pengguna harus reset password.

## 5. Keputusan yang sudah diambil pemilik

| Hal | Keputusan |
|---|---|
| Backend baru | Supabase |
| `Code.gs` | Tidak disentuh sama sekali |
| Perubahan frontend | Hanya `web/script.js` (index.html & style.css tidak diubah kecuali benar-benar perlu) |
| Data lama | **Pindahkan semua** (master + transaksi + log + foto) |
| Alat pemindahan | Skrip sekali pakai **`Migrasi.gs` sebagai file terpisah** di proyek Apps Script yang sama, dihapus setelah selesai |
| Backup harian 02.00 | Satu file **Excel (.xlsx) berisi semua tabel** di Supabase Storage, retensi sesuai setting `BACKUP_RETENTION_DAYS` (default 90); tombol "Backup sekarang" & "Log backup" tetap ada |
| Export laporan Excel/PDF | Dibuat **di browser** saat tombol diklik; kolom sama dengan sekarang (`buildReport_`) |
| WhatsApp Fonnte | Tetap, template & setting sama; token disimpan sebagai secret di Supabase, bukan di browser |
| Tautan di pesan WA | Ke domain frontend Vercel (`…/?case=CASE-xxxx`), bukan URL Apps Script |
| Kapasitas paket gratis | Tetap paket gratis. **Foto lama dikecilkan saat dipindah** (target ≤ 1 MB per foto, sisi terpanjang ±1280 px, JPEG) supaya muat |
| Rollback | **Hanya pada hari cutover.** Setelah itu masalah diperbaiki di Supabase; tidak dibuat alat salin balik Supabase → Sheets |

## 6. Arsitektur (keputusan perancang, belum dikonfirmasi pemilik — lihat §9)

```
Browser (web/script.js)
   │  POST [token, action, args]  (text/plain, tanpa header khusus → tanpa preflight CORS)
   ▼
Supabase Edge Function "api"  (TypeScript; port logika Code.gs)
   │  service role (hanya di server)
   ├── Postgres: 16 tabel + tabel sesi        (RLS aktif, anon/authenticated TIDAK punya akses)
   ├── Storage: bucket privat "photos", "backups"
   └── Fonnte API (token dari secret)
pg_cron (+ pg_net) ──► Edge Function "api" aksi cron: hourly, 02:00 backup, 07:30 reminder (WIB)
```

- **Satu Edge Function `api`** dengan dispatcher yang meniru `api(token, action, args)` dan tabel `ROUTES`
  (`Code.gs` baris 94–150), termasuk pengecekan role. Alasan: logika `Code.gs` sudah JavaScript, jadi port
  ke TypeScript jauh lebih aman daripada menulis ulang di PL/pgSQL. `verify_jwt` dimatikan untuk fungsi ini
  supaya browser bisa memanggil tanpa header Authorization (keamanan dijaga oleh token sesi aplikasi).
- **Frontend**: `API_URL` diganti ke URL Edge Function. Transport `fetch` yang sudah ada di `script.js`
  (baris ~1–10 setelah blok demo) dipakai apa adanya. Blok mode demo boleh dihapus.
- **Database**: nama tabel & kolom mengikuti `SCHEMA` (boleh huruf kecil di Postgres). Tipe data boleh dirapikan
  (timestamp, boolean, integer) asalkan **respons API ke frontend tetap berbentuk sama** seperti sekarang
  (mis. `active: 'TRUE'/'FALSE'`, timestamp string `yyyy-MM-dd HH:mm:ss` WIB). Frontend bergantung pada format itu.
- **Keamanan**: RLS aktif di semua tabel tanpa policy untuk anon/authenticated; hanya Edge Function (service role)
  yang membaca/menulis. Bucket Storage privat.
- **Sesi**: pengganti CacheService → tabel `session` (token acak 2×UUID, data sesi, kedaluwarsa 6 jam), dengan
  validasi ulang akun/person aktif seperti `validSess_`.
- **Password**: tiru `hash_` (`Code.gs` baris 432–438): 300× `base64(sha256(salt + h + salt))`, kolom
  `password_hash` & `salt` dipindah apa adanya.
- **Foto**: aksi `photo` sekarang mengembalikan data URL. Setelah pindah boleh mengembalikan **signed URL**
  (frontend hanya memakainya sebagai `src`/`background-image`, jadi tetap jalan). Upload foto dari frontend
  tetap lewat aksi `submitChecklist`/`completeItem` (data URL), dibatasi `PHOTO_MAX_KB`.
  ID foto lama (Drive file id) dipertahankan sebagai kunci, objek disimpan di `photos/<file_id>.jpg`.
- **Cache baca** (`cachedRead_`) tidak wajib ditiru; Postgres cukup cepat. Builder boleh menambah cache bila perlu.
- **Jadwal**: `cronHourly` (= `ensureSchedules_(true)` + `markMissed_` + `retryNotif_`), `cronBackup` 02:00,
  `cronReminder` 07:30, semua WIB. Dipanggil oleh `pg_cron` lewat `pg_net` ke Edge Function dengan secret
  khusus cron (bukan token sesi). Perhatikan `pg_cron` memakai UTC (02:00 WIB = 19:00 UTC hari sebelumnya,
  07:30 WIB = 00:30 UTC).
- **Locking**: `withLock_` diganti transaksi Postgres / constraint unik (mis. `schedule_id` deterministik,
  klaim item dengan `UPDATE … WHERE status='OPEN'`) supaya dua teknisi tidak bisa klaim item yang sama.
- **Aksi `install`** dan layar Instalasi Awal tidak dipakai lagi; `publicInfo` selalu `installed: true`
  setelah data dipindah.
- **Token Fonnte** *(keputusan perancang)*: disimpan di **Supabase Vault**, dibaca/ditulis hanya oleh Edge Function
  lewat fungsi SQL `security definer` (mis. `vault.update_secret`). Dengan begitu `saveFonnteToken` (ganti/hapus token
  dari layar Pengaturan) dan tampilan token tersamar di `settings` tetap berfungsi seperti sekarang.
- **Tautan yang dulu ke Google Drive** *(keputusan perancang)*:
  - Kolom "Link Foto (Drive)" di laporan NO OK: foto lama tetap memakai tautan Drive lama (`photo_url`);
    foto baru memakai signed URL Supabase (berlaku 7 hari) di laporan layar dan file export.
  - Log backup: `backupLog` mengembalikan field `url` (signed URL unduhan .xlsx), dan `script.js` memakai field itu
    sebagai pengganti tautan `docs.google.com/spreadsheets/d/<file_id>`.
  - Tombol "Buka folder Drive" di Pengaturan: diarahkan (`root_folder_url`) ke halaman Storage proyek di dashboard
    Supabase; labelnya diubah di `script.js` menjadi "Buka Storage Supabase".

## 7. Pemindahan data (Migrasi.gs)

- File baru `Migrasi.gs` di proyek Apps Script yang sama (punya akses ke Sheets `DB_ID` & folder Drive).
  **Tidak mengubah `Code.gs`** dan tidak mengubah isi Sheets/Drive (hanya membaca).
- Service-role key Supabase disimpan **sementara** di Script Properties (dihapus setelah selesai), tidak di kode.
- Mengirim semua baris tiap sheet ke Supabase (upsert berdasarkan primary key → aman diulang), lalu mengunggah
  setiap foto yang dirujuk `CHECKLIST_DETAIL.photo_file_id`, `REPAIR_ITEM.after_photo_file_id`,
  `REPAIR_LOG.after_photo_file_id` ke bucket `photos`.
- **Langkah 0 — hitung dulu**: sebelum memindahkan apa pun, Migrasi.gs melaporkan jumlah baris per sheet, jumlah foto,
  total ukuran foto asli, dan perkiraan ukuran setelah dikecilkan. Pemindahan baru dijalankan bila perkiraan muat
  di paket gratis (database < 500 MB, Storage < 1 GB dengan sisa ruang untuk foto baru & backup).
- **Foto dikecilkan saat dipindah** (keputusan pemilik): target ≤ 1 MB, sisi terpanjang ±1280 px, JPEG. Apps Script
  tidak punya library resize gambar; cara mengecilkan diserahkan ke builder (mis. mengambil versi resize dari
  Drive API `thumbnailLink` dengan parameter ukuran memakai `ScriptApp.getOAuthToken()`), asalkan hasilnya
  masih jelas untuk bukti. Foto yang sudah ≤ 1 MB dipindah apa adanya.
- Apps Script dibatasi ±6 menit per eksekusi → skrip harus bisa **dilanjutkan** (simpan posisi di Script
  Properties) dan bisa dijalankan berulang.
- Akhir pemindahan menampilkan **laporan pencocokan**: jumlah baris per tabel di Sheets vs Supabase, jumlah foto
  sukses/gagal beserta ID yang gagal.
- `SYSTEM_SETTINGS` ikut dipindah, kecuali kunci internal Apps Script yang tidak relevan.
  Token Fonnte (di Script Properties, bukan Sheets) dipindah manual oleh pemilik ke secret Supabase.

**Urutan pindah (cutover):**
1. Siapkan skema, Edge Function, cron (belum aktif) di Supabase.
2. Jalankan Migrasi.gs sebagai uji coba; cek laporan pencocokan; uji aplikasi terhadap Supabase di localhost.
3. Hari H: umumkan aplikasi berhenti sebentar → jalankan Migrasi.gs sekali lagi (upsert, hanya selisih) →
   matikan trigger Apps Script (dari menu Triggers di editor, tanpa mengubah `Code.gs`) → aktifkan cron Supabase →
   ganti `API_URL` di `script.js` dan push ke `main`.
4. Rollback bila gagal — **hanya pada hari cutover**: kembalikan `API_URL` ke URL Apps Script dan nyalakan lagi
   trigger-nya. Data yang terlanjur dicatat di Supabase pada hari itu dicatat manual. Setelah hari cutover,
   masalah diperbaiki di Supabase (tidak ada salin balik ke Sheets).

## 8. Batasan

- Paket Supabase **gratis**: proyek dijeda bila tidak ada aktivitas 7 hari (aplikasi dipakai harian, jadi aman),
  tidak ada backup otomatis yang bisa diunduh (karena itu ada backup .xlsx harian sendiri), batas ukuran storage.
- Edge Function: batas ukuran request/respons; foto sudah dikompres frontend ke ≤1,5 MB (`compress`).
- Zona waktu semua logika & tampilan: **Asia/Jakarta (WIB)**. Hari operasional mulai 07.00 (`opDate_`).
- Frontend tetap file statis tanpa build step; library tambahan (mis. SheetJS untuk Excel, jsPDF untuk PDF,
  supabase-js bila perlu) dimuat dari CDN yang sudah dipakai (`cdn.jsdelivr.net`) dengan versi pasti.
- Repo publik di GitHub → tidak boleh ada secret di repo.

## 9. Diserahkan ke builder

- Struktur folder `supabase/` (migrations, functions), tipe kolom, index.
- Cara deploy Edge Function: lewat integrasi GitHub–Supabase bila mendukung, atau GitHub Action / Supabase CLI.
  Pengaturan integrasi di dashboard Supabase (repo, working directory, branch `main`) perlu dicek pemilik.
- Library Excel/PDF di browser, asalkan isi & kolom laporan sama.
- Penanganan foto yang gagal dipindah (dilaporkan; tampil "Gagal muat" di frontend seperti sekarang).
- Uji otomatis: minimal satu skrip uji yang memanggil tiap aksi penting (login, guestLogin, submitChecklist
  dengan NO OK, claimItem, completeItem, decide SPV & HEAD, dashboard) terhadap proyek Supabase.

## 10. Yang dibutuhkan dari pemilik

- **Project URL** dan **publishable/anon key** Supabase (untuk `script.js`; aman dipakai di browser).
- **Service-role / secret key** hanya dimasukkan sendiri oleh pemilik ke Script Properties (untuk Migrasi.gs) dan
  ke secret Supabase bila diperlukan — tidak dikirim lewat chat dan tidak di repo.
- Token Fonnte dimasukkan ke secret Supabase.
- Konfirmasi pengaturan integrasi GitHub di dashboard Supabase.
- Menentukan waktu cutover (aplikasi berhenti sebentar).
