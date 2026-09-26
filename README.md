# FZShield

Aplikasi desktop antivirus/pemindai keamanan lintas platform (Windows, macOS,
Linux).

## Fitur

**Perlindungan**
- **Dasbor** = status proteksi (ring gauge), statistik sesi, aktivitas terbaru
- **Pemindaian** = Pindai Cepat (folder umum), Pindai Penuh (folder pengguna), Pindai Kustom (folder pilihan), progres langsung, tabel hasil
- **Karantina** = file mencurigakan/ancaman dipindahkan & di rename (tidak bisa dieksekusi sistem), bisa dipulihkan atau dihapus permanen
- **Firewall & Jaringan** = daftar interface jaringan aktif + port yang sedang listening (read-only monitoring, lihat catatan di bagian aplikasi)
- **Cek Tautan** = pemeriksa heuristik anti-phishing lokal (IP literal, punycode, subdomain berlebih, TLD berisiko, dll) dan tautan tidak pernah dikirim keluar perangkat

**Sistem**
- **Item Startup** = daftar aplikasi/layanan yang otomatis berjalan saat sistem menyala (Windows Startup folder, macOS LaunchAgents, Linux XDG autostart)
- **Pembersih Sampah** = memindai & membersihkan folder cache/temporary umum per OS, dengan konfirmasi sebelum menghapus
- **Kesehatan Sistem** = ringkasan OS, CPU, memori, uptime, ruang disk, dan postur keamanan FZShield (status real-time, pemindaian terakhir, versi signature)
- **Aktivitas** = riwayat seluruh pemindaian, deteksi, dan pembersihan, tersimpan lokal
- **Pengaturan** = real-time protection, folder pantauan, notifikasi

## Build installer untuk tiap OS

FZShield memakai [electron-builder](https://www.electron.build).

```bash
# Di Windows:
npm run dist:win     # menghasilkan installer .exe (NSIS) di /release

# Di macOS:
npm run dist:mac      # menghasilkan .dmg di /release

# Di Linux:
npm run dist:linux    # menghasilkan .AppImage dan .deb di /release
```
