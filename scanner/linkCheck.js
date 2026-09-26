/**
 * linkCheck.js
 * ----------------------------------------------------------------------
 * Pemeriksa tautan berbasis heuristik lokal (tidak memanggil layanan
 * eksternal apa pun — tautan yang diperiksa TIDAK dikirim ke mana-mana).
 *
 * CATATAN JUJUR: ini adalah heuristik pola umum, bukan basis data
 * phishing yang terus diperbarui. Skor "berisiko" adalah indikasi,
 * bukan vonis pasti. Untuk cakupan lebih luas, hubungkan ke layanan
 * reputasi URL sungguhan (mis. Google Safe Browsing API).
 * ----------------------------------------------------------------------
 */

const TLD_BERISIKO = ['.zip', '.mov', '.top', '.country', '.gq', '.cf', '.tk', '.work', '.click', '.rest', '.xin', '.loan'];
const KATA_KUNCI_SENSITIF = ['login', 'verify', 'verifikasi', 'akun', 'account', 'secure', 'update', 'confirm', 'password', 'wallet', 'bank'];

function periksaTautan(input) {
  const alasan = [];
  let skor = 0;
  let url;

  let teks = (input || '').trim();
  if (!/^https?:\/\//i.test(teks)) teks = `http://${teks}`;

  try {
    url = new URL(teks);
  } catch {
    return { valid: false, alasan: ['Format tautan tidak dikenali.'], skor: 0, level: 'tidak-valid' };
  }

  const host = url.hostname.toLowerCase();

  if (!/^https:/i.test(url.protocol) && /^https?:\/\//i.test(input.trim())) {
    // hanya tandai bila pengguna memang menulis http:// secara eksplisit
    skor += 1;
    alasan.push('Tautan tidak memakai HTTPS, jadi data yang dikirim lewat tautan ini tidak terenkripsi.');
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    skor += 3;
    alasan.push('Alamat memakai IP langsung, bukan nama domain. Ini pola umum pada tautan phishing.');
  }

  if (host.includes('xn--')) {
    skor += 3;
    alasan.push('Domain memakai encoding punycode (xn--), bisa jadi karakter mirip huruf lain (homograph) untuk meniru domain asli.');
  }

  if (url.username || teks.includes('@') && host.includes('@') === false && teks.split('@').length > 1 && teks.indexOf('@') < teks.indexOf(host)) {
    skor += 3;
    alasan.push('Tautan mengandung karakter "@" sebelum domain. Ini trik umum untuk menyamarkan domain asli.');
  }

  const jumlahSubdomain = host.split('.').length - 2;
  if (jumlahSubdomain >= 3) {
    skor += 2;
    alasan.push(`Domain memiliki ${jumlahSubdomain} subdomain, struktur yang tidak wajar.`);
  }

  const tldCocok = TLD_BERISIKO.find((tld) => host.endsWith(tld));
  if (tldCocok) {
    skor += 2;
    alasan.push(`Akhiran domain (${tldCocok}) sering disalahgunakan untuk kampanye phishing.`);
  }

  const kataCocok = KATA_KUNCI_SENSITIF.filter((k) => host.includes(k));
  if (kataCocok.length && (host.match(/-/g) || []).length >= 2) {
    skor += 2;
    alasan.push(`Domain mengandung kata sensitif (${kataCocok.join(', ')}) dikombinasikan dengan banyak tanda hubung, pola umum domain tiruan.`);
  }

  if (host.length > 40) {
    skor += 1;
    alasan.push('Nama domain sangat panjang, sering dipakai untuk menyembunyikan domain asli.');
  }

  let level = 'aman';
  if (skor >= 6) level = 'berisiko-tinggi';
  else if (skor >= 3) level = 'perlu-waspada';
  else if (skor > 0) level = 'perhatian-ringan';

  if (alasan.length === 0) alasan.push('Tidak ada pola mencurigakan yang terdeteksi dari struktur tautan.');

  return { valid: true, host, skor, level, alasan, urlBersih: url.href };
}

module.exports = { periksaTautan };
