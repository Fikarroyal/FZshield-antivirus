/**
 * network.js
 * ----------------------------------------------------------------------
 * Informasi jaringan untuk fitur "Firewall & Jaringan".
 *
 * CATATAN JUJUR: ini adalah PEMANTAU (read-only), bukan firewall yang
 * benar-benar memblokir trafik. Memblokir koneksi di level OS butuh
 * integrasi berbeda per platform (Windows Filtering Platform, pf di
 * macOS, iptables/nftables di Linux) yang di luar cakupan starter
 * project ini. Fungsi di bawah hanya membaca dan menampilkan.
 * ----------------------------------------------------------------------
 */

const os = require('os');
const { spawn } = require('child_process');

function daftarInterface() {
  const semua = os.networkInterfaces();
  const hasil = [];
  for (const [nama, alamatList] of Object.entries(semua)) {
    for (const alamat of alamatList || []) {
      if (alamat.internal) continue;
      hasil.push({
        nama,
        alamat: alamat.address,
        keluarga: alamat.family,
        mac: alamat.mac,
      });
    }
  }
  return hasil;
}

function jalankanPerintah(cmd, args) {
  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, args, { windowsHide: true });
      let keluaran = '';
      proc.stdout.on('data', (d) => { keluaran += d.toString(); });
      proc.on('error', () => resolve(null));
      proc.on('close', () => resolve(keluaran));
      setTimeout(() => { try { proc.kill(); } catch {} resolve(keluaran); }, 5000);
    } catch {
      resolve(null);
    }
  });
}

function uraiBarisWindows(teks) {
  // Format: "  TCP    0.0.0.0:135     0.0.0.0:0      LISTENING       1234"
  const baris = [];
  for (const line of teks.split('\n')) {
    const m = line.trim().match(/^(TCP|UDP)\s+(\S+)\s+(\S+)\s+(LISTENING)?\s*(\d+)?/i);
    if (m && (m[1] === 'TCP' ? m[4] : true)) {
      baris.push({ protokol: m[1], lokal: m[2], pid: m[5] || 'Tidak diketahui' });
    }
  }
  return baris;
}

function uraiBarisUnix(teks) {
  // netstat -an (macOS/Linux) format bervariasi; ambil baris LISTEN saja
  const baris = [];
  for (const line of teks.split('\n')) {
    if (!/LISTEN/i.test(line)) continue;
    const kolom = line.trim().split(/\s+/);
    if (kolom.length < 4) continue;
    const protokol = kolom[0]?.toUpperCase().includes('TCP') ? 'TCP' : kolom[0]?.toUpperCase();
    const lokal = kolom.find((k) => k.includes('.') || k.includes(':')) || kolom[3];
    baris.push({ protokol, lokal, pid: 'Tidak diketahui' });
  }
  return baris;
}

async function daftarPortListening() {
  try {
    if (process.platform === 'win32') {
      const teks = await jalankanPerintah('netstat', ['-ano']);
      if (!teks) return { didukung: false, port: [] };
      return { didukung: true, port: uraiBarisWindows(teks).slice(0, 60) };
    }
    // macOS & Linux
    const teks = await jalankanPerintah('netstat', ['-an']);
    if (!teks) return { didukung: false, port: [] };
    return { didukung: true, port: uraiBarisUnix(teks).slice(0, 60) };
  } catch {
    return { didukung: false, port: [] };
  }
}

async function ambilInfoJaringan() {
  const [interfaceList, portInfo] = await Promise.all([
    Promise.resolve(daftarInterface()),
    daftarPortListening(),
  ]);
  return { interfaceList, ...portInfo };
}

module.exports = { ambilInfoJaringan, daftarInterface, daftarPortListening };
