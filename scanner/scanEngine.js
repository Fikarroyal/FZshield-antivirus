/**
 * scanEngine.js
 * ----------------------------------------------------------------------
 * Mesin inti pemindaian FZShield.
 *
 * Metode deteksi yang dipakai:
 *   1. Pencocokan hash (SHA-256 & MD5) terhadap basis data signature lokal
 *      (scanner/malwareSignatures.json).
 *   2. Heuristik ekstensi berisiko & ekstensi samaran ganda
 *      (mis. "foto.jpg.exe").
 *   3. Heuristik entropi Shannon. File dengan entropi sangat tinggi
 *      (umumnya di atas 7.5 dari 8 bit) sering menandakan file terenkripsi
 *      atau terkompresi/di-obfuscate, sehingga ditandai "mencurigakan"
 *      (bukan otomatis "terinfeksi").
 *
 * CATATAN PERFORMA:
 *   Hash dihitung dengan STREAMING (fs.createReadStream), bukan membaca
 *   seluruh file ke memori sekaligus. Ini membuat pemindaian aman dipakai
 *   untuk file berukuran berapa pun (video, image disk, dsb) tanpa
 *   membebani RAM. Fungsi pindaiFile/pindaiDirektori di sini bersifat
 *   ASYNC dan dipanggil dari dalam Worker Thread terpisah (lihat
 *   scanner/scanWorker.js) supaya proses utama Electron tidak pernah
 *   ikut macet/nge-freeze selama pemindaian berjalan.
 *
 * CATATAN JUJUR:
 *   Basis data signature yang disertakan hanyalah contoh (signature uji
 *   EICAR, standar industri untuk menguji antivirus). Ini BUKAN basis data
 *   antivirus komersial yang lengkap. Untuk perlindungan dunia nyata,
 *   sambungkan fungsi `cocokkanSignature()` di bawah ke feed intelijen
 *   ancaman sungguhan (VirusTotal API, MalwareBazaar, dsb).
 * ----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SIGNATURE_PATH = path.join(__dirname, 'malwareSignatures.json');
const AMBANG_ENTROPI_MENCURIGAKAN = 7.5;
const BATAS_UKURAN_ENTROPI = 25 * 1024 * 1024; // hanya hitung entropi dari 25MB pertama file (performa)

let basisData = null;

function muatBasisData() {
  if (basisData) return basisData;
  const raw = fs.readFileSync(SIGNATURE_PATH, 'utf-8');
  basisData = JSON.parse(raw);
  return basisData;
}

/**
 * Menghitung SHA-256, MD5, dan entropi Shannon sekaligus dengan membaca
 * file secara streaming (per potongan/chunk), bukan sekaligus ke memori.
 * Entropi hanya dihitung dari BATAS_UKURAN_ENTROPI byte pertama supaya
 * file raksasa tetap cepat diperiksa.
 */
function hitungHashStream(filePath) {
  return new Promise((resolve, reject) => {
    const sha256 = crypto.createHash('sha256');
    const md5 = crypto.createHash('md5');
    const frekuensi = new Array(256).fill(0);
    let byteUntukEntropi = 0;
    let ukuran = 0;

    let stream;
    try {
      stream = fs.createReadStream(filePath);
    } catch (err) {
      reject(err);
      return;
    }

    stream.on('data', (chunk) => {
      sha256.update(chunk);
      md5.update(chunk);
      ukuran += chunk.length;

      if (byteUntukEntropi < BATAS_UKURAN_ENTROPI) {
        const ambil = Math.min(chunk.length, BATAS_UKURAN_ENTROPI - byteUntukEntropi);
        for (let i = 0; i < ambil; i++) frekuensi[chunk[i]]++;
        byteUntukEntropi += ambil;
      }
    });

    stream.on('end', () => {
      resolve({
        sha256: sha256.digest('hex'),
        md5: md5.digest('hex'),
        ukuran,
        entropi: hitungEntropiDariFrekuensi(frekuensi, byteUntukEntropi),
      });
    });

    stream.on('error', reject);
  });
}

function hitungEntropiDariFrekuensi(frekuensi, totalByte) {
  if (totalByte === 0) return 0;
  let entropi = 0;
  for (const jumlah of frekuensi) {
    if (jumlah === 0) continue;
    const p = jumlah / totalByte;
    entropi -= p * Math.log2(p);
  }
  return entropi;
}

function cocokkanSignature(sha256, md5) {
  const db = muatBasisData();
  return db.signatures.find((s) => s.hash === sha256 || s.hash === md5) || null;
}

function periksaEkstensi(filePath) {
  const db = muatBasisData();
  const namaFile = path.basename(filePath).toLowerCase();
  const ganda = db.ekstensiSamaranBerisiko.find((ext) => namaFile.endsWith(ext));
  if (ganda) return { level: 'tinggi', alasan: `Ekstensi samaran ganda (${ganda}), pola umum malware yang menyamar sebagai file lain.` };
  const ext = path.extname(namaFile);
  if (db.ekstensiRiskan.includes(ext)) {
    return { level: 'rendah', alasan: `Tipe file eksekusi (${ext}). Bukan berarti berbahaya, tetap diwaspadai.` };
  }
  return null;
}

/**
 * Memindai satu file dan mengembalikan hasil terstruktur. Async & streaming
 * jadi aman dipanggil untuk file berukuran berapa pun.
 */
async function pindaiFile(filePath) {
  const hasil = {
    path: filePath,
    nama: path.basename(filePath),
    status: 'bersih', // 'bersih' | 'mencurigakan' | 'ancaman'
    detail: null,
    hash: null,
    ukuran: 0,
    waktu: new Date().toISOString(),
  };

  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      hasil.status = 'dilewati';
      return hasil;
    }

    const { sha256, md5, ukuran, entropi } = await hitungHashStream(filePath);
    hasil.hash = sha256;
    hasil.ukuran = ukuran;

    const cocok = cocokkanSignature(sha256, md5);
    if (cocok) {
      hasil.status = 'ancaman';
      hasil.detail = `Terdeteksi: ${cocok.name}. ${cocok.description}`;
      return hasil;
    }

    const cekEkstensi = periksaEkstensi(filePath);
    if (cekEkstensi && cekEkstensi.level === 'tinggi') {
      hasil.status = 'mencurigakan';
      hasil.detail = cekEkstensi.alasan;
      return hasil;
    }

    if (ukuran > 0 && entropi >= AMBANG_ENTROPI_MENCURIGAKAN) {
      hasil.status = 'mencurigakan';
      hasil.detail = `Entropi tinggi (${entropi.toFixed(2)}/8). Kemungkinan file terenkripsi, terkompresi, atau di-obfuscate.`;
      return hasil;
    }

    if (cekEkstensi && cekEkstensi.level === 'rendah') {
      hasil.detail = cekEkstensi.alasan;
    }

    return hasil;
  } catch (err) {
    hasil.status = 'error';
    hasil.detail = `Gagal memindai: ${err.message}`;
    return hasil;
  }
}

/**
 * Memindai direktori secara rekursif (async).
 * onProgress(hasilPerFile, ringkasan) dipanggil setiap satu file selesai.
 * onProgress harus mengembalikan false untuk membatalkan pemindaian.
 * cekBatal() (opsional) dicek sebelum tiap file untuk pembatalan instan
 * dari luar (dipakai worker thread untuk merespons tombol "Batalkan").
 */
async function pindaiDirektori(dirPath, onProgress, opsi = {}) {
  const abaikanFolder = opsi.abaikanFolder || ['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information'];
  const cekBatal = opsi.cekBatal || (() => false);
  let dibatalkan = false;
  let jumlahDipindai = 0;
  let jumlahAncaman = 0;
  let jumlahMencurigakan = 0;

  async function jelajah(dir) {
    if (dibatalkan || cekBatal()) { dibatalkan = true; return; }
    let entri;
    try {
      entri = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // folder tidak bisa diakses (izin, dsb): lewati
    }

    for (const item of entri) {
      if (dibatalkan || cekBatal()) { dibatalkan = true; return; }
      if (abaikanFolder.includes(item.name)) continue;
      const fullPath = path.join(dir, item.name);

      if (item.isDirectory()) {
        await jelajah(fullPath);
      } else if (item.isFile()) {
        const hasil = await pindaiFile(fullPath);
        jumlahDipindai++;
        if (hasil.status === 'ancaman') jumlahAncaman++;
        if (hasil.status === 'mencurigakan') jumlahMencurigakan++;
        const lanjut = onProgress ? onProgress(hasil, { jumlahDipindai, jumlahAncaman, jumlahMencurigakan }) : true;
        if (lanjut === false) dibatalkan = true;
      }
    }
  }

  await jelajah(dirPath);
  return { jumlahDipindai, jumlahAncaman, jumlahMencurigakan, dibatalkan };
}

module.exports = {
  muatBasisData,
  hitungHashStream,
  hitungEntropiDariFrekuensi,
  pindaiFile,
  pindaiDirektori,
};
