/**
 * quarantine.js
 * ----------------------------------------------------------------------
 * Mengelola folder karantina FZShield.
 * File yang dikarantina dipindahkan ke folder data aplikasi, diberi nama
 * acak (bukan nama asli) dan TIDAK diberi ekstensi asli, supaya sistem
 * operasi tidak menjalankannya secara tidak sengaja. Metadata asli
 * (path asli, nama asli, hash, alasan) disimpan terpisah di quarantine.json.
 * ----------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function buatPengelolaKarantina(folderData) {
  const folderKarantina = path.join(folderData, 'karantina');
  const fileMetadata = path.join(folderData, 'karantina.json');

  if (!fs.existsSync(folderKarantina)) fs.mkdirSync(folderKarantina, { recursive: true });
  if (!fs.existsSync(fileMetadata)) fs.writeFileSync(fileMetadata, '[]', 'utf-8');

  function bacaMetadata() {
    try {
      return JSON.parse(fs.readFileSync(fileMetadata, 'utf-8'));
    } catch {
      return [];
    }
  }

  function simpanMetadata(data) {
    fs.writeFileSync(fileMetadata, JSON.stringify(data, null, 2), 'utf-8');
  }

  function karantinakan(filePath, hasilPindai) {
    const id = crypto.randomUUID();
    const tujuan = path.join(folderKarantina, `${id}.qtn`);
    fs.renameSync(filePath, tujuan);

    const data = bacaMetadata();
    const entri = {
      id,
      namaAsli: path.basename(filePath),
      pathAsli: filePath,
      pathKarantina: tujuan,
      hash: hasilPindai?.hash || null,
      alasan: hasilPindai?.detail || 'Ditandai oleh pengguna',
      status: hasilPindai?.status || 'mencurigakan',
      waktuKarantina: new Date().toISOString(),
    };
    data.unshift(entri);
    simpanMetadata(data);
    return entri;
  }

  function daftar() {
    return bacaMetadata();
  }

  function pulihkan(id) {
    const data = bacaMetadata();
    const idx = data.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('Entri karantina tidak ditemukan');
    const entri = data[idx];

    let tujuan = entri.pathAsli;
    if (fs.existsSync(tujuan)) {
      const ext = path.extname(tujuan);
      const base = tujuan.slice(0, -ext.length || undefined);
      tujuan = `${base} (dipulihkan ${Date.now()})${ext}`;
    }
    fs.mkdirSync(path.dirname(tujuan), { recursive: true });
    fs.renameSync(entri.pathKarantina, tujuan);

    data.splice(idx, 1);
    simpanMetadata(data);
    return tujuan;
  }

  function hapusPermanen(id) {
    const data = bacaMetadata();
    const idx = data.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('Entri karantina tidak ditemukan');
    const entri = data[idx];
    if (fs.existsSync(entri.pathKarantina)) fs.unlinkSync(entri.pathKarantina);
    data.splice(idx, 1);
    simpanMetadata(data);
  }

  return { karantinakan, daftar, pulihkan, hapusPermanen };
}

module.exports = { buatPengelolaKarantina };
