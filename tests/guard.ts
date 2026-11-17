/** Pengaman: tes integrasi menghapus/menulis data. Hanya jalan bila ALLOW_DESTRUCTIVE_TESTS == ref project dari SUPABASE_URL. */
export function assertDestructiveAllowed(): void {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  let ref = '';
  try { ref = new URL(url).hostname.split('.')[0]; } catch { /* url tidak valid */ }
  if (!ref || Deno.env.get('ALLOW_DESTRUCTIVE_TESTS') !== ref) {
    throw new Error('DITOLAK: tes destruktif butuh ALLOW_DESTRUCTIVE_TESTS=<ref project SUPABASE_URL>. Jangan jalankan terhadap produksi.');
  }
}
