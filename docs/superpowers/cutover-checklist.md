# Daftar periksa cutover

## Uji frontend

Preview lokal `http://localhost:5500` (`.claude/launch.json`, server `web`) dan preview Vercel branch `supabase-migration`.
Data: fixture Task 6 (`seed()` di `tests/api_helpers.ts`); akun `admin` / `spv` / `head`, password `rahasia123`; tamu PIC `Budi`, MAINTENANCE `Maman`.
Console browser harus tanpa error di setiap langkah.

- [ ] Login admin -> Dashboard tampil tanpa error console; KPI sama dengan uji Task 6.
- [ ] Checklist (tamu PIC) -> submit dengan 1 NO OK + foto -> toast "temuan masuk kasus".
- [ ] Perbaikan (tamu MAINTENANCE) -> ambil -> selesaikan dengan foto -> kasus ke SPV.
- [ ] Approval SPV lalu Head -> kasus Selesai; foto sebelum/sesudah tampil di drawer kasus.
- [ ] Laporan -> Excel & PDF terunduh, berisi baris meta + data; tautan foto "Buka" bisa dibuka.
- [ ] Pengaturan -> Backup sekarang -> log backup berisi tautan unduh .xlsx; tombol "Buka Storage Supabase".

## Hari H (tambahan)

- [ ] Migration cron bernama `20261118000001_cron.sql` (harus lebih baru dari migration yang sudah diterapkan, agar tidak ditolak `db push`).
- [ ] Set Script Property `MIG_FINAL=TRUE`, jalankan `migrasiJalankan()` sampai SELESAI, lalu `migrasiLaporan()`: pastikan "Foto gagal: 0".
- [ ] Pastikan `system_settings.MIGRATED_AT` ada sebelum merge ke `main`.
- [ ] Set `APP_URL` ke domain final (bukan URL preview).
- [ ] Isi token Fonnte hanya pada hari cutover.
- [ ] Jangan pernah jalankan tes integrasi / `seed()` terhadap project ini (lihat `tests/README.md`).
- [ ] Sebelum run final, verifikasi (query baca-saja) bahwa project tidak memuat data uji: username `admin`/`spv`/`head` di `master_account` dengan nama fixture, aset `AST-DAILY`/`AST-SHIFT`. Bila ada, hapus berdasarkan id persis hanya setelah pemilik mengonfirmasi.
- [ ] Setelah malam pertama: pastikan ada baris AUTO di log backup.

## Rollback (hanya hari H)

- [ ] Kembalikan `API_URL` di `web/script.js` ke URL Apps Script lama: `https://script.google.com/macros/s/AKfycbzT-yKjvrr41uJCmPMBL2mxhcOw7kwr1EYkaGBMmaXf7aKDTltYIoyt9mUnrKsGD6m2/exec`, lalu push ke `main`.
- [ ] Nyalakan lagi 3 trigger Apps Script.
- [ ] Matikan cron Supabase: `select cron.unschedule(jobname) from cron.job where jobname like 'api-cron-%';`
- [ ] Data yang terlanjur dicatat di Supabase hari itu dicatat manual oleh pemilik. Setelah hari H tidak ada rollback; masalah diperbaiki di Supabase.
