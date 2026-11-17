# Tes integrasi

PERINGATAN: tes integrasi di folder ini bersifat DESTRUKTIF. `seed()` menghapus semua baris di semua tabel,
tes menimpa token Fonnte di Vault, menyisipkan ribuan baris `schedule`, dan menghapus objek Storage.

- Jalankan HANYA terhadap project Supabase terpisah khusus tes. JANGAN PERNAH terhadap project produksi.
- Tes menolak jalan kecuali variabel lingkungan `ALLOW_DESTRUCTIVE_TESTS` diisi sama persis dengan ref project
  (bagian pertama host `SUPABASE_URL`, mis. `abcdefgh` untuk `https://abcdefgh.supabase.co`).
- `seed()` juga menolak bila `system_settings.MIGRATED_AT` ada (tanda data produksi).
- `tests/guard_test.ts` aman dijalankan kapan saja (tidak menyentuh jaringan).
