const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker } = require('worker_threads');

const { pindaiFile } = require('./scanner/scanEngine');
const { buatPengelolaKarantina } = require('./scanner/quarantine');
const { ambilInfoJaringan } = require('./scanner/network');
const { periksaTautan } = require('./scanner/linkCheck');
const { daftarStartup } = require('./scanner/startup');
const { targetFolder, pindaiSemua: pindaiSampah, bersihkanFolder } = require('./scanner/junkCleaner');
const { ambilKesehatanSistem } = require('./scanner/systemHealth');
const basisDataSignature = require('./scanner/malwareSignatures.json');

let jendelaUtama = null;
let trayIcon = null;
let pemantauRealtime = null; // instance chokidar aktif
let workerPindaiAktif = null; // Worker Thread yang sedang menjalankan pemindaian (null bila tidak ada)

const FOLDER_DATA = app.getPath('userData');
const FILE_PENGATURAN = path.join(FOLDER_DATA, 'pengaturan.json');
const FILE_AKTIVITAS = path.join(FOLDER_DATA, 'aktivitas.json');
const karantina = buatPengelolaKarantina(FOLDER_DATA);

const PENGATURAN_DEFAULT = {
  proteksiRealtime: false,
  folderDipantau: [],
  pindaiOtomatisHarian: false,
  notifikasiAktif: true,
};

// ---------------------------------------------------------------------
// Util penyimpanan lokal sederhana
// ---------------------------------------------------------------------
function muatPengaturan() {
  try {
    return { ...PENGATURAN_DEFAULT, ...JSON.parse(fs.readFileSync(FILE_PENGATURAN, 'utf-8')) };
  } catch {
    return { ...PENGATURAN_DEFAULT };
  }
}

function simpanPengaturan(pengaturan) {
  fs.writeFileSync(FILE_PENGATURAN, JSON.stringify(pengaturan, null, 2), 'utf-8');
}

function muatAktivitas() {
  try {
    return JSON.parse(fs.readFileSync(FILE_AKTIVITAS, 'utf-8'));
  } catch {
    return [];
  }
}

function catatAktivitas(entri) {
  const data = muatAktivitas();
  data.unshift({ ...entri, waktu: new Date().toISOString() });
  fs.writeFileSync(FILE_AKTIVITAS, JSON.stringify(data.slice(0, 500), null, 2), 'utf-8');
  jendelaUtama?.webContents.send('aktivitas-baru', data[0]);
}

function beriNotifikasi(judul, isi) {
  const pengaturan = muatPengaturan();
  if (!pengaturan.notifikasiAktif) return;
  if (Notification.isSupported()) {
    new Notification({ title: judul, body: isi }).show();
  }
}

// ---------------------------------------------------------------------
// Jendela & tray
// ---------------------------------------------------------------------
function buatJendela() {
  jendelaUtama = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: 'FZShield',
    backgroundColor: '#F3F4F6',
    icon: path.join(__dirname, 'src/assets/icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 18, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  jendelaUtama.setMenuBarVisibility(false);
  jendelaUtama.loadFile(path.join(__dirname, 'src/index.html'));

  jendelaUtama.on('close', (e) => {
    const pengaturan = muatPengaturan();
    if (pengaturan.proteksiRealtime && trayIcon) {
      e.preventDefault();
      jendelaUtama.hide();
    }
  });
}

function buatTray() {
  const iconPath = path.join(__dirname, 'src/assets/icon.png');
  if (!fs.existsSync(iconPath)) return;
  trayIcon = new Tray(iconPath);
  trayIcon.setToolTip('FZShield (perlindungan aktif)');
  const menu = Menu.buildFromTemplate([
    { label: 'Buka FZShield', click: () => jendelaUtama?.show() },
    { type: 'separator' },
    { label: 'Keluar', click: () => { app.exit(0); } },
  ]);
  trayIcon.setContextMenu(menu);
  trayIcon.on('click', () => jendelaUtama?.show());
}

app.whenReady().then(() => {
  buatJendela();
  buatTray();

  const pengaturan = muatPengaturan();
  if (pengaturan.proteksiRealtime && pengaturan.folderDipantau.length) {
    aktifkanRealtime(pengaturan.folderDipantau);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) buatJendela();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------
// Pemantauan real-time (chokidar)
// ---------------------------------------------------------------------
function aktifkanRealtime(folderList) {
  if (pemantauRealtime) pemantauRealtime.close();
  let chokidar;
  try {
    chokidar = require('chokidar');
  } catch {
    return; // dependensi belum terpasang (npm install belum dijalankan)
  }

  pemantauRealtime = chokidar.watch(folderList, {
    ignoreInitial: true,
    depth: 6,
    ignored: /(^|[/\\])\.(git|DS_Store)/,
  });

  pemantauRealtime.on('add', async (filePath) => {
    const hasil = await pindaiFile(filePath);
    if (hasil.status === 'ancaman' || hasil.status === 'mencurigakan') {
      catatAktivitas({ tipe: 'realtime', hasil });
      beriNotifikasi(
        hasil.status === 'ancaman' ? 'Ancaman terdeteksi' : 'File mencurigakan',
        `${hasil.nama}${hasil.detail ? `: ${hasil.detail}` : ''}`
      );
      jendelaUtama?.webContents.send('realtime-deteksi', hasil);
    }
  });
}

function matikanRealtime() {
  if (pemantauRealtime) {
    pemantauRealtime.close();
    pemantauRealtime = null;
  }
}

// ---------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------
ipcMain.handle('pilih-folder', async () => {
  const hasil = await dialog.showOpenDialog(jendelaUtama, { properties: ['openDirectory'] });
  return hasil.canceled ? null : hasil.filePaths[0];
});

ipcMain.handle('pilih-file', async () => {
  const hasil = await dialog.showOpenDialog(jendelaUtama, { properties: ['openFile', 'multiSelections'] });
  return hasil.canceled ? [] : hasil.filePaths;
});

ipcMain.handle('mulai-pindai', async (event, { mode, targetPath }) => {
  if (workerPindaiAktif) return { error: 'Pemindaian lain sedang berjalan' };

  let folderSasaran = [];
  if (mode === 'cepat') {
    folderSasaran = [app.getPath('downloads'), app.getPath('desktop'), app.getPath('documents')].filter(fs.existsSync);
  } else if (mode === 'penuh') {
    folderSasaran = [os.homedir()];
  } else if (mode === 'kustom' && targetPath) {
    folderSasaran = [targetPath];
  }

  const mulai = Date.now();

  // Pemindaian dijalankan di Worker Thread terpisah (scanner/scanWorker.js)
  // supaya jendela aplikasi & tombol "Batalkan" tetap responsif sepenuhnya,
  // walau sedang memindai folder besar atau file berukuran besar.
  const ringkasanAkhir = await new Promise((resolve) => {
    const worker = new Worker(path.join(__dirname, 'scanner', 'scanWorker.js'));
    workerPindaiAktif = worker;

    worker.on('message', (pesan) => {
      if (pesan.type === 'progress') {
        jendelaUtama?.webContents.send('pindai-progress', { hasil: pesan.hasil, ringkasan: pesan.ringkasan });
      } else if (pesan.type === 'selesai') {
        selesaikan({ ...pesan.ringkasan, durasiDetik: Math.round((Date.now() - mulai) / 1000), mode });
      } else if (pesan.type === 'error') {
        selesaikan({ jumlahDipindai: 0, jumlahAncaman: 0, jumlahMencurigakan: 0, dibatalkan: false, error: pesan.pesan, mode });
      }
    });

    worker.on('error', (err) => {
      selesaikan({ jumlahDipindai: 0, jumlahAncaman: 0, jumlahMencurigakan: 0, dibatalkan: false, error: err.message, mode });
    });

    let sudahSelesai = false;
    function selesaikan(hasilAkhir) {
      if (sudahSelesai) return;
      sudahSelesai = true;
      worker.terminate();
      workerPindaiAktif = null;
      resolve(hasilAkhir);
    }

    worker.postMessage({ type: 'mulai', folderSasaran });
  });

  if (!ringkasanAkhir.error) {
    catatAktivitas({ tipe: 'pindaian', ringkasan: ringkasanAkhir });
    beriNotifikasi(
      'Pemindaian selesai',
      ringkasanAkhir.jumlahAncaman > 0
        ? `${ringkasanAkhir.jumlahAncaman} ancaman ditemukan dari ${ringkasanAkhir.jumlahDipindai} file.`
        : `Tidak ada ancaman. ${ringkasanAkhir.jumlahDipindai} file diperiksa.`
    );
  }
  return ringkasanAkhir;
});

ipcMain.on('batalkan-pindai', () => {
  workerPindaiAktif?.postMessage({ type: 'batal' });
});

ipcMain.handle('karantina-file', async (event, hasilPindai) => {
  try {
    const entri = karantina.karantinakan(hasilPindai.path, hasilPindai);
    catatAktivitas({ tipe: 'karantina', entri });
    return { ok: true, entri };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('karantina-daftar', () => karantina.daftar());

ipcMain.handle('karantina-pulihkan', (event, id) => {
  try {
    const tujuan = karantina.pulihkan(id);
    return { ok: true, tujuan };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('karantina-hapus', (event, id) => {
  try {
    karantina.hapusPermanen(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('pengaturan-muat', () => muatPengaturan());

ipcMain.handle('pengaturan-simpan', (event, pengaturanBaru) => {
  const pengaturan = { ...muatPengaturan(), ...pengaturanBaru };
  simpanPengaturan(pengaturan);
  if (pengaturan.proteksiRealtime && pengaturan.folderDipantau.length) {
    aktifkanRealtime(pengaturan.folderDipantau);
  } else {
    matikanRealtime();
  }
  return pengaturan;
});

ipcMain.handle('aktivitas-daftar', () => muatAktivitas());

ipcMain.handle('buka-lokasi-file', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// ---------------------------------------------------------------------
// Firewall & Jaringan
// ---------------------------------------------------------------------
ipcMain.handle('jaringan-info', () => ambilInfoJaringan());

// ---------------------------------------------------------------------
// Cek Tautan
// ---------------------------------------------------------------------
ipcMain.handle('tautan-periksa', (event, url) => periksaTautan(url));

// ---------------------------------------------------------------------
// Item Startup
// ---------------------------------------------------------------------
ipcMain.handle('startup-daftar', () => daftarStartup());

ipcMain.handle('startup-buka-lokasi', (event, filePath) => {
  shell.showItemInFolder(filePath);
});

// ---------------------------------------------------------------------
// Pembersih Sampah
// ---------------------------------------------------------------------
ipcMain.handle('sampah-pindai', () => pindaiSampah());

ipcMain.handle('sampah-bersihkan', async (event, folderId) => {
  const target = targetFolder().find((f) => f.id === folderId);
  if (!target) return { ok: false, error: 'Folder tidak ditemukan' };

  const konfirmasi = await dialog.showMessageBox(jendelaUtama, {
    type: 'warning',
    buttons: ['Batal', 'Bersihkan'],
    defaultId: 0,
    cancelId: 0,
    title: 'Konfirmasi pembersihan',
    message: `Bersihkan isi "${target.label}"?`,
    detail: `Semua file di dalam ${target.dir} akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`,
  });
  if (konfirmasi.response !== 1) return { ok: false, dibatalkan: true };

  const hasil = bersihkanFolder(target.dir);
  catatAktivitas({ tipe: 'pembersihan', target: target.label, hasil });
  beriNotifikasi('Pembersihan selesai', `${target.label}: ${(hasil.dibebaskan / 1e6).toFixed(1)} MB dibebaskan.`);
  return { ok: true, ...hasil };
});

// ---------------------------------------------------------------------
// Kesehatan Sistem
// ---------------------------------------------------------------------
ipcMain.handle('kesehatan-info', async () => {
  const sistem = await ambilKesehatanSistem();
  const pengaturan = muatPengaturan();
  const aktivitas = muatAktivitas();
  const pemindaianTerakhir = aktivitas.find((a) => a.tipe === 'pindaian');
  const daftarKarantina = karantina.daftar();

  return {
    sistem,
    keamanan: {
      realtimeAktif: !!pengaturan.proteksiRealtime,
      folderDipantau: pengaturan.folderDipantau?.length || 0,
      pemindaianTerakhir: pemindaianTerakhir
        ? { waktu: pemindaianTerakhir.waktu, ringkasan: pemindaianTerakhir.ringkasan }
        : null,
      itemKarantina: daftarKarantina.length,
      versiSignature: basisDataSignature.version,
      jumlahSignature: basisDataSignature.signatures.length,
    },
  };
});
