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
- [ ] Jangan jalankan tes integrasi / `seed()` terhadap project ini (lihat `tests/README.md`).
- [ ] Setelah malam pertama: pastikan ada baris AUTO di log backup.
