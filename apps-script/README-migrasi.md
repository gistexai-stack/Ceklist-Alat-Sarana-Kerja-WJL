# Migrasi data dari Google Sheets/Drive ke Supabase

`Migrasi.gs` dipakai SEKALI untuk menyalin semua data (Sheets) dan foto (Drive) ke Supabase. File ini hanya MEMBACA Sheets dan Drive; tidak ada yang diubah atau dihapus di sana.

## 1. Pasang file
1. Buka proyek Apps Script aplikasi lama (yang berisi `Code.gs`).
2. Klik **+** di sebelah "File" lalu pilih **Skrip**, beri nama `Migrasi`.
3. Hapus isi bawaan, tempel seluruh isi `apps-script/Migrasi.gs`, lalu **Simpan**.
4. Pastikan layanan **Drive API** sudah aktif (Services). Ini sudah aktif di proyek lama.

## 2. Isi Script Properties
**Project Settings** (ikon roda gigi) -> **Script Properties** -> **Add script property**:

| Nama | Isi |
|---|---|
| `SB_URL` | `https://liijxffmljyboznmgqjq.supabase.co` |
| `SB_SERVICE_KEY` | Secret key dari dashboard Supabase: **Project Settings -> API Keys -> Secret key** (diawali `sb_secret_`). Salin lalu tempel. |

Kunci ini sangat rahasia: jangan dibagikan, jangan ditempel di chat, dokumen, atau Git. Kunci dihapus di langkah 6.

## 3. Cek dulu: `migrasiHitung`
Pilih fungsi `migrasiHitung` di menu atas, klik **Run**, lalu buka **Execution log**. Log menampilkan:
- jumlah baris tiap sheet, dan jumlah foto serta ukurannya;
- **DUPLIKAT / PELANGGARAN INDEKS UNIK**: data ganda yang akan ditolak Supabase (satu kasus terbuka per alat, item perbaikan ganda, event notifikasi ganda, username ganda). Rapikan di Sheets dulu bila ada;
- baris **KESIMPULAN: MUAT** atau **TIDAK MUAT**. Jika TIDAK MUAT, berhenti dan hubungi pengembang.

## 4. Uji coba: `migrasiJalankan` lalu `migrasiLaporan`
1. Jalankan `migrasiJalankan`. Bila data banyak, proses berhenti sekitar 5 menit lalu **lanjut sendiri** tiap 1 menit lewat trigger. Tunggu sampai log berisi **SELESAI**. Bila muncul error, perbaiki penyebabnya lalu jalankan `migrasiJalankan` lagi; skrip akan melanjutkan dari posisi terakhir.
2. Jalankan `migrasiLaporan`: semua tabel harus **COCOK** dan "Foto gagal: 0". Bila ada foto gagal, daftar ID-nya muncul di log; kirim ke pengembang.
3. Uji coba ini AMAN diulang: data yang sama ditimpa, bukan digandakan. Uji coba **tidak** menulis penanda `MIGRATED_AT`.

## 5. Hari cutover (`MIG_FINAL`)
Pada hari pindah resmi (setelah aplikasi lama berhenti dipakai):
1. Tambah Script Property `MIG_FINAL` = `TRUE`.
2. Jalankan `migrasiJalankan` lagi sampai **SELESAI**, lalu `migrasiLaporan`. Pastikan "Foto gagal: 0" di laporan sebelum cutover.

Hanya bila `MIG_FINAL` = `TRUE` dan tidak ada foto gagal, migrasi menulis `MIGRATED_AT` ke pengaturan sistem Supabase sebagai tanda migrasi final. Jangan set `MIG_FINAL` sebelum hari cutover.

## 6. Bersihkan
Setelah semuanya benar, jalankan `migrasiBersihkan`. Ini menghapus `SB_SERVICE_KEY`, `MIG_STATE`, `MIG_FINAL`, dan trigger migrasi. Setelah itu, `Migrasi.gs` boleh dihapus dari proyek.
