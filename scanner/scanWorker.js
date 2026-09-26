/**
 * scanWorker.js
 * ----------------------------------------------------------------------
 * Dijalankan di dalam Worker Thread terpisah (lihat main.js).
 *
 * KENAPA WORKER THREAD:
 *   Memindai ribuan file (apalagi yang berukuran besar) butuh waktu.
 *   Kalau dijalankan langsung di proses utama Electron, seluruh aplikasi
 *   akan macet/freeze selama proses berjalan; termasuk tombol "Batalkan"
 *   itu sendiri jadi tidak bisa diklik. Dengan Worker Thread, pemindaian
 *   berjalan di thread terpisah sehingga jendela aplikasi & IPC tetap
 *   responsif sepenuhnya, dan pembatalan bisa langsung diproses.
 *
 * Pesan yang diterima dari main.js (parentPort.on('message')):
 *   { type: 'mulai', folderSasaran: string[] }
 *   { type: 'batal' }
 *
 * Pesan yang dikirim ke main.js (parentPort.postMessage):
 *   { type: 'progress', hasil, ringkasan }
 *   { type: 'selesai', ringkasan }
 *   { type: 'error', pesan }
 * ----------------------------------------------------------------------
 */

const { parentPort } = require('worker_threads');
const { pindaiDirektori } = require('./scanEngine');

let dibatalkan = false;

parentPort.on('message', (pesan) => {
  if (pesan?.type === 'batal') dibatalkan = true;
  if (pesan?.type === 'mulai') jalankan(pesan.folderSasaran || []);
});

async function jalankan(folderSasaran) {
  const ringkasanTotal = { jumlahDipindai: 0, jumlahAncaman: 0, jumlahMencurigakan: 0 };

  try {
    for (const folder of folderSasaran) {
      if (dibatalkan) break;

      await pindaiDirektori(
        folder,
        (hasil, ringkasan) => {
          ringkasanTotal.jumlahDipindai = ringkasan.jumlahDipindai;
          if (hasil.status === 'ancaman') ringkasanTotal.jumlahAncaman++;
          if (hasil.status === 'mencurigakan') ringkasanTotal.jumlahMencurigakan++;
          parentPort.postMessage({ type: 'progress', hasil, ringkasan: { ...ringkasanTotal } });
          return !dibatalkan;
        },
        { cekBatal: () => dibatalkan }
      );
    }

    parentPort.postMessage({ type: 'selesai', ringkasan: { ...ringkasanTotal, dibatalkan } });
  } catch (err) {
    parentPort.postMessage({ type: 'error', pesan: err.message });
  }
}
