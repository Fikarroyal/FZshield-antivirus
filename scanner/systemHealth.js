/**
 * systemHealth.js
 * ----------------------------------------------------------------------
 * Ringkasan kondisi sistem: OS, memori, uptime, dan ruang disk.
 * Bagian keamanan (real-time protection, pemindaian terakhir, dsb)
 * digabung di sisi main.js karena datanya berasal dari pengaturan &
 * riwayat aktivitas FZShield sendiri, bukan dari modul ini.
 * ----------------------------------------------------------------------
 */

const os = require('os');
const { spawn } = require('child_process');

function jalankanPerintah(cmd, args) {
  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, args, { windowsHide: true });
      let keluaran = '';
      proc.stdout.on('data', (d) => { keluaran += d.toString(); });
      proc.on('error', () => resolve(null));
      proc.on('close', () => resolve(keluaran));
      setTimeout(() => { try { proc.kill(); } catch {} resolve(keluaran); }, 4000);
    } catch {
      resolve(null);
    }
  });
}

async function ambilRuangDisk() {
  try {
    if (process.platform === 'win32') {
      const teks = await jalankanPerintah('wmic', ['logicaldisk', 'get', 'size,freespace,caption']);
      if (!teks) return [];
      const baris = teks.split('\n').map((l) => l.trim()).filter(Boolean).slice(1);
      return baris.map((l) => {
        const [caption, freespace, size] = l.split(/\s+/);
        if (!caption || !size) return null;
        return {
          drive: caption,
          totalGB: (Number(size) / 1e9).toFixed(1),
          bebasGB: (Number(freespace) / 1e9).toFixed(1),
        };
      }).filter(Boolean);
    }

    const teks = await jalankanPerintah('df', ['-h']);
    if (!teks) return [];
    const baris = teks.split('\n').slice(1).filter(Boolean);
    return baris
      .map((l) => l.trim().split(/\s+/))
      .filter((k) => k.length >= 6 && k[0].startsWith('/'))
      .slice(0, 8)
      .map((k) => ({ drive: k[k.length - 1], totalGB: k[1], bebasGB: k[3] }));
  } catch {
    return [];
  }
}

async function ambilKesehatanSistem() {
  const ruangDisk = await ambilRuangDisk();
  return {
    platform: os.platform(),
    rilis: os.release(),
    arsitektur: os.arch(),
    hostname: os.hostname(),
    totalMemoriGB: (os.totalmem() / 1e9).toFixed(1),
    memoriBebasGB: (os.freemem() / 1e9).toFixed(1),
    uptimeJam: (os.uptime() / 3600).toFixed(1),
    loadAverage: os.loadavg(),
    cpuModel: os.cpus()?.[0]?.model || 'Tidak diketahui',
    jumlahCpu: os.cpus()?.length || 0,
    ruangDisk,
  };
}

module.exports = { ambilKesehatanSistem };
