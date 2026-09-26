# FZShield

Aplikasi desktop antivirus/pemindai keamanan lintas platform (Windows, macOS,
Linux), dibangun dengan Electron. Tampilan terang bergaya Apple/macOS, inti
pemindaian nyata berbasis hash & heuristik yang berjalan di Worker Thread
terpisah (supaya aplikasi tidak pernah macet saat memindai), karantina file,
pemantauan folder real-time, dan riwayat aktivitas.

## Penting — baca dulu

FZShield dibangun sebagai **kerangka aplikasi antivirus yang benar-benar
berfungsi** (bukan sekadar tampilan kosong): mesin pemindai menghitung hash
SHA-256/MD5 setiap file, mencocokkannya ke basis data signature lokal,
menandai ekstensi berisiko/samaran ganda, dan mendeteksi entropi tinggi
(indikasi file terenkripsi/di-obfuscate).

Namun basis data signature yang disertakan (`scanner/malwareSignatures.json`)
**hanya berisi signature uji EICAR** — file uji standar industri yang aman,
dipakai di seluruh dunia untuk memverifikasi bahwa mesin antivirus bekerja.
Ini **bukan** basis data malware komersial yang lengkap. Untuk perlindungan
dunia nyata, kembangkan `scanner/scanEngine.js` agar terhubung ke feed
intelijen ancaman sungguhan (mis. VirusTotal API, MalwareBazaar/AbuseCH, atau
langganan feed komersial) sebelum dipakai sebagai satu-satunya lapisan
proteksi di perangkat produksi.

## Tampilan

Tema terang bergaya Apple/macOS: kanvas putih, sidebar abu muda berkelompok,
aksen hijau (aman/proteksi), kuning-emas (waspada), dan merah (ancaman).
Font UI memakai **Plus Jakarta Sans** (di-bundle lokal, tanpa CDN) dan seluruh
ikon — termasuk logo aplikasi — memakai **Lucide** (inline SVG, ISC license,
sumber & lisensinya disertakan di `src/assets/LICENSE-Lucide.txt` dan
`src/assets/fonts/LICENSE-PlusJakartaSans.txt`).
Di macOS, jendela memakai `titleBarStyle: 'hiddenInset'` supaya traffic-light
bawaan menyatu dengan sidebar.

## Fitur

**Perlindungan**
- **Dasbor** — status proteksi (ring gauge), statistik sesi, aktivitas terbaru
- **Pemindaian** — Pindai Cepat (folder umum), Pindai Penuh (folder pengguna), Pindai Kustom (folder pilihan), progres langsung, tabel hasil
- **Karantina** — file mencurigakan/ancaman dipindahkan & di-rename (tidak bisa dieksekusi sistem), bisa dipulihkan atau dihapus permanen
- **Firewall & Jaringan** — daftar interface jaringan aktif + port yang sedang listening (read-only monitoring, lihat catatan di bagian aplikasi)
- **Cek Tautan** — pemeriksa heuristik anti-phishing lokal (IP literal, punycode, subdomain berlebih, TLD berisiko, dll) — tautan tidak pernah dikirim keluar perangkat

**Sistem**
- **Item Startup** — daftar aplikasi/layanan yang otomatis berjalan saat sistem menyala (Windows Startup folder, macOS LaunchAgents, Linux XDG autostart)
- **Pembersih Sampah** — memindai & membersihkan folder cache/temporary umum per OS, dengan konfirmasi sebelum menghapus
- **Kesehatan Sistem** — ringkasan OS, CPU, memori, uptime, ruang disk, dan postur keamanan FZShield (status real-time, pemindaian terakhir, versi signature)
- **Aktivitas** — riwayat seluruh pemindaian, deteksi, dan pembersihan, tersimpan lokal
- **Pengaturan** — real-time protection, folder pantauan, notifikasi

Semua data (riwayat, karantina, pengaturan) tersimpan **lokal** di folder data
aplikasi (`app.getPath('userData')`). Tidak ada data yang dikirim ke server
mana pun — aplikasi ini sepenuhnya offline secara desain, termasuk Cek Tautan.

## Struktur proyek

```
FZShield/
├── main.js                 # Proses utama Electron (jendela, IPC, tray, real-time watcher)
├── preload.js               # Jembatan aman renderer <-> main (contextBridge)
├── package.json             # Konfigurasi proyek + target build electron-builder
├── scanner/
│   ├── scanEngine.js         # Mesin pemindai: hashing streaming, signature, heuristik entropi
│   ├── scanWorker.js         # Worker Thread pembungkus scanEngine (lihat "Performa & arsitektur")
│   ├── quarantine.js         # Pengelola karantina file
│   ├── network.js            # Info interface jaringan & port listening (fitur Firewall & Jaringan)
│   ├── linkCheck.js          # Heuristik anti-phishing lokal (fitur Cek Tautan)
│   ├── startup.js            # Daftar item startup lintas OS (fitur Item Startup)
│   ├── junkCleaner.js        # Pindai & bersihkan cache/temp (fitur Pembersih Sampah)
│   ├── systemHealth.js       # Info OS/CPU/memori/disk (fitur Kesehatan Sistem)
│   └── malwareSignatures.json  # Basis data signature (demo: EICAR)
└── src/
    ├── index.html            # Struktur UI
    ├── styles.css             # Tema visual
    ├── renderer.js            # Logika UI
    └── assets/
        ├── icon.svg           # Sumber logo (ikon Lucide "shield-check" di atas latar hijau)
        ├── icon.png           # Logo di-render ke PNG (ikon Linux, brand mark)
        ├── icon.ico           # Logo di-render ke ICO (ikon Windows)
        └── fonts/              # Plus Jakarta Sans, di-bundle lokal (SIL OFL)
```

## Performa & arsitektur

Pemindaian file (hashing SHA-256/MD5 + analisis entropi) berjalan di dalam
**Worker Thread terpisah** (`scanner/scanWorker.js`), bukan langsung di
proses utama Electron. Dua alasannya:

1. **Jendela aplikasi tidak pernah freeze.** Kalau pemindaian dijalankan
   langsung di proses utama, seluruh UI (termasuk tombol "Batalkan" itu
   sendiri) akan macet selama proses berjalan, apalagi pada "Pindai Penuh"
   dengan ribuan file.
2. **Hemat memori pada file besar.** Hash dihitung dengan streaming
   (`fs.createReadStream`), bukan membaca seluruh file ke memori sekaligus,
   jadi memindai file berukuran ratusan MB/GB tidak membuat RAM melonjak.

Tombol "Batalkan" mengirim sinyal ke worker yang sedang berjalan dan
dihentikan hampir seketika, walau sedang memindai folder besar.

## Menjalankan dalam mode pengembangan

Butuh [Node.js](https://nodejs.org) 18+ terpasang.

```bash
cd FZShield
npm install
npm start
```

## Build installer untuk tiap OS

FZShield memakai [electron-builder](https://www.electron.build). Umumnya
setiap target OS paling andal di-build **di OS yang sama** (batasan
electron-builder, bukan batasan FZShield):

```bash
# Di Windows:
npm run dist:win     # menghasilkan installer .exe (NSIS) di /release

# Di macOS:
npm run dist:mac      # menghasilkan .dmg di /release

# Di Linux:
npm run dist:linux    # menghasilkan .AppImage dan .deb di /release
```

Untuk menghasilkan ketiganya sekaligus dari satu mesin, cara paling andal
adalah lewat CI (GitHub Actions dengan matrix `windows-latest` / `macos-latest`
/ `ubuntu-latest`) — build lintas-OS secara lokal (cross-compiling) sering
gagal karena beberapa tahap packaging (terutama tanda tangan kode macOS)
memang memerlukan mesin aslinya.

### Ikon aplikasi

`icon.png` (Linux) dan `icon.ico` (Windows) sudah disediakan di
`src/assets/`. File `icon.icns` (macOS) belum disertakan karena format ICNS
asli paling andal dibuat di macOS. Jalankan salah satu dari ini di mesin
macOS sebelum `npm run dist:mac`:

```bash
npx electron-icon-builder --input=src/assets/icon.png --output=build --flatten
# lalu salin build/icons/mac/icon.icns ke src/assets/icon.icns
```

### Menandatangani aplikasi (code signing)

Belum dikonfigurasi. Tanpa tanda tangan kode, Windows SmartScreen dan macOS
Gatekeeper akan menampilkan peringatan "publisher tidak dikenal" saat
instalasi. Untuk distribusi publik, siapkan sertifikat code-signing
(Windows: sertifikat EV/OV; macOS: Apple Developer ID) dan tambahkan
konfigurasinya di bagian `build` pada `package.json`.

## Mengembangkan basis data signature

Buka `scanner/scanEngine.js`, fungsi `cocokkanSignature()`. Saat ini fungsi
ini hanya mencocokkan ke file JSON lokal. Untuk memperluas cakupan deteksi,
opsi umum yang dipakai produk antivirus sungguhan:

- **VirusTotal API** — kirim hash (bukan isi file, agar hemat kuota & privat) ke endpoint `/files/{hash}` untuk memeriksa reputasi lintas puluhan mesin antivirus.
- **MalwareBazaar / abuse.ch** — feed basis data hash malware yang bisa diunduh berkala dan disimpan lokal (mirip pendekatan `malwareSignatures.json` saat ini, tetapi terus diperbarui).
- Pemindaian heuristik tambahan (analisis PE header, deteksi macro berbahaya di dokumen Office, dsb.) — di luar cakupan starter project ini.

## Lisensi & kepemilikan

Kode ini milik Anda (Vrise Studio) sepenuhnya — silakan diubah, di-rebrand,
atau dikembangkan sesuai kebutuhan.
