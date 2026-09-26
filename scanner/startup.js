/**
 * startup.js
 * ----------------------------------------------------------------------
 * Mendaftar aplikasi/layanan yang otomatis berjalan saat sistem
 * dinyalakan. Berguna untuk mengenali persistensi malware (banyak
 * malware menanamkan diri di lokasi startup supaya tetap aktif setelah
 * restart). Hanya MEMBACA lokasi standar tiap OS — tidak mengubah apa
 * pun kecuali pengguna eksplisit menghapus lewat fitur ini.
 * ----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function bacaFolder(dir, sumber) {
  const hasil = [];
  try {
    if (!fs.existsSync(dir)) return hasil;
    for (const nama of fs.readdirSync(dir)) {
      if (nama.startsWith('.')) continue;
      const fullPath = path.join(dir, nama);
      let waktu = null;
      try { waktu = fs.statSync(fullPath).mtime.toISOString(); } catch {}
      hasil.push({ nama, path: fullPath, sumber, waktu });
    }
  } catch {
    // folder tidak bisa diakses (izin) — lewati secara senyap
  }
  return hasil;
}

function daftarStartup() {
  const platform = process.platform;
  const home = os.homedir();
  let lokasi = [];

  if (platform === 'win32') {
    lokasi = [
      { dir: path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'), label: 'Startup pengguna' },
      { dir: path.join(process.env.PROGRAMDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'StartUp'), label: 'Startup semua pengguna' },
    ];
  } else if (platform === 'darwin') {
    lokasi = [
      { dir: path.join(home, 'Library', 'LaunchAgents'), label: 'LaunchAgents pengguna' },
      { dir: '/Library/LaunchAgents', label: 'LaunchAgents sistem' },
      { dir: '/Library/LaunchDaemons', label: 'LaunchDaemons sistem' },
    ];
  } else {
    lokasi = [
      { dir: path.join(home, '.config', 'autostart'), label: 'Autostart pengguna (XDG)' },
      { dir: '/etc/xdg/autostart', label: 'Autostart sistem (XDG)' },
    ];
  }

  const hasil = [];
  for (const { dir, label } of lokasi) {
    for (const item of bacaFolder(dir, label)) hasil.push(item);
  }
  return hasil.sort((a, b) => a.nama.localeCompare(b.nama));
}

module.exports = { daftarStartup };
