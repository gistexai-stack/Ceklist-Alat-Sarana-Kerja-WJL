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
