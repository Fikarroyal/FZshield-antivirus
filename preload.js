const { contextBridge, ipcRenderer } = require('electron');

/**
 * Semua akses ke sistem file/IPC HARUS lewat sini.
 * Renderer (UI) tidak pernah diberi akses Node.js langsung —
 * ini praktik keamanan standar Electron (contextIsolation).
 */
contextBridge.exposeInMainWorld('fzshield', {
  pilihFolder: () => ipcRenderer.invoke('pilih-folder'),
  pilihFile: () => ipcRenderer.invoke('pilih-file'),

  mulaiPindai: (mode, targetPath) => ipcRenderer.invoke('mulai-pindai', { mode, targetPath }),
  batalkanPindai: () => ipcRenderer.send('batalkan-pindai'),
  onProgresPindai: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('pindai-progress', listener);
    return () => ipcRenderer.removeListener('pindai-progress', listener);
  },
  onDeteksiRealtime: (callback) => {
    const listener = (event, hasil) => callback(hasil);
    ipcRenderer.on('realtime-deteksi', listener);
    return () => ipcRenderer.removeListener('realtime-deteksi', listener);
  },

  karantinakanFile: (hasilPindai) => ipcRenderer.invoke('karantina-file', hasilPindai),
  daftarKarantina: () => ipcRenderer.invoke('karantina-daftar'),
  pulihkanKarantina: (id) => ipcRenderer.invoke('karantina-pulihkan', id),
  hapusKarantina: (id) => ipcRenderer.invoke('karantina-hapus', id),

  muatPengaturan: () => ipcRenderer.invoke('pengaturan-muat'),
  simpanPengaturan: (pengaturan) => ipcRenderer.invoke('pengaturan-simpan', pengaturan),

  daftarAktivitas: () => ipcRenderer.invoke('aktivitas-daftar'),
  onAktivitasBaru: (callback) => {
    const listener = (event, entri) => callback(entri);
    ipcRenderer.on('aktivitas-baru', listener);
    return () => ipcRenderer.removeListener('aktivitas-baru', listener);
  },

  bukaLokasiFile: (filePath) => ipcRenderer.invoke('buka-lokasi-file', filePath),

  // Firewall & Jaringan
  infoJaringan: () => ipcRenderer.invoke('jaringan-info'),

  // Cek Tautan
  periksaTautan: (url) => ipcRenderer.invoke('tautan-periksa', url),

  // Item Startup
  daftarStartup: () => ipcRenderer.invoke('startup-daftar'),
  bukaLokasiStartup: (filePath) => ipcRenderer.invoke('startup-buka-lokasi', filePath),

  // Pembersih Sampah
  pindaiSampah: () => ipcRenderer.invoke('sampah-pindai'),
  bersihkanSampah: (folderId) => ipcRenderer.invoke('sampah-bersihkan', folderId),

  // Kesehatan Sistem
  infoKesehatan: () => ipcRenderer.invoke('kesehatan-info'),

  platform: process.platform,
});
