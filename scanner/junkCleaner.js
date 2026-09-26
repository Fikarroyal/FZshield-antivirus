/**
 * junkCleaner.js
 * ----------------------------------------------------------------------
 * Memindai & membersihkan folder cache/temporary umum. Hanya menyasar
 * lokasi cache standar per OS (bukan folder dokumen/data pengguna),
 * dan hanya menghapus ISI folder tersebut, bukan foldernya sendiri.
 * Pembersihan sesungguhnya (hapus file) hanya dijalankan setelah
 * konfirmasi eksplisit dari pengguna di main.js.
 * ----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BATAS_FILE_DIPINDAI = 15000; // pelindung performa untuk folder cache raksasa

function targetFolder() {
  const home = os.homedir();
  const platform = process.platform;
  const daftar = [{ id: 'temp-sistem', label: 'Folder temporary sistem', dir: os.tmpdir() }];

  if (platform === 'win32') {
    daftar.push({ id: 'temp-lokal', label: 'Temp pengguna (Local)', dir: path.join(process.env.LOCALAPPDATA || '', 'Temp') });
  } else if (platform === 'darwin') {
    daftar.push({ id: 'cache-mac', label: '~/Library/Caches', dir: path.join(home, 'Library', 'Caches') });
    daftar.push({ id: 'logs-mac', label: '~/Library/Logs', dir: path.join(home, 'Library', 'Logs') });
  } else {
    daftar.push({ id: 'cache-linux', label: '~/.cache', dir: path.join(home, '.cache') });
  }

  return daftar.filter((f) => f.dir && fs.existsSync(f.dir));
}

function hitungUkuran(dir) {
  let ukuran = 0;
  let jumlahFile = 0;
  let terpotong = false;

  function jelajah(d) {
    if (terpotong) return;
    let entri;
    try {
      entri = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of entri) {
      if (terpotong) return;
      const fullPath = path.join(d, item.name);
      if (item.isDirectory()) {
        jelajah(fullPath);
      } else if (item.isFile()) {
        try {
          ukuran += fs.statSync(fullPath).size;
          jumlahFile++;
          if (jumlahFile >= BATAS_FILE_DIPINDAI) terpotong = true;
        } catch {}
      }
    }
  }

  jelajah(dir);
  return { ukuran, jumlahFile, terpotong };
}

function pindaiSemua() {
  return targetFolder().map((f) => ({ ...f, ...hitungUkuran(f.dir) }));
}

function bersihkanFolder(dir) {
  let terhapus = 0;
  let dibebaskan = 0;
  let gagal = 0;

  let entri;
  try {
    entri = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    return { terhapus, dibebaskan, gagal, error: err.message };
  }

  for (const item of entri) {
    const fullPath = path.join(dir, item.name);
    try {
      const stat = fs.statSync(fullPath);
      const ukuran = item.isDirectory() ? hitungUkuran(fullPath).ukuran : stat.size;
      fs.rmSync(fullPath, { recursive: true, force: true });
      terhapus++;
      dibebaskan += ukuran;
    } catch {
      gagal++;
    }
  }

  return { terhapus, dibebaskan, gagal };
}

module.exports = { targetFolder, pindaiSemua, bersihkanFolder };
