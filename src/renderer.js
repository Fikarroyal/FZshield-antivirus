(() => {
  'use strict';

  const RING_CIRCUMFERENCE = 540; // 2 * PI * r(86), dibulatkan mengikuti stroke-dasharray CSS

  // ---------------------------------------------------------------------
  // Navigasi antar tampilan
  // ---------------------------------------------------------------------
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');

  const pemuatTampilan = {}; // diisi tiap bagian fitur di bawah — dipanggil tiap kali tampilan dibuka

  function pindahTampilan(nama) {
    navItems.forEach((el) => el.classList.toggle('is-active', el.dataset.view === nama));
    views.forEach((el) => el.classList.toggle('is-active', el.id === `view-${nama}`));
    pemuatTampilan[nama]?.();
  }

  navItems.forEach((el) => el.addEventListener('click', () => pindahTampilan(el.dataset.view)));

  if (window.fzshield.platform === 'darwin') {
    document.body.classList.add('platform-mac');
  }

  // ---------------------------------------------------------------------
  // Toast notifikasi dalam-aplikasi
  // ---------------------------------------------------------------------
  const toastStack = document.getElementById('toast-stack');
  function tampilkanToast(pesan, tipe = 'info') {
    const el = document.createElement('div');
    el.className = `toast${tipe === 'ancaman' ? ' is-ancaman' : ''}`;
    el.textContent = pesan;
    toastStack.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ---------------------------------------------------------------------
  // Dashboard: ring status + statistik sesi
  // ---------------------------------------------------------------------
  const ringFill = document.getElementById('ring-fill');
  const ringLabel = document.getElementById('ring-label');
  const ringShieldIcon = document.getElementById('ring-shield-icon');
  const ringCaption = document.getElementById('ring-caption');
  const statDipindai = document.getElementById('stat-dipindai');
  const statAncaman = document.getElementById('stat-ancaman');
  const statMencurigakan = document.getElementById('stat-mencurigakan');
  const miniLog = document.getElementById('mini-log');
  const statusChip = document.getElementById('status-chip');
  const statusChipText = document.getElementById('status-chip-text');

  const sesi = { dipindai: 0, ancaman: 0, mencurigakan: 0 };

  function setRing(persen, warna) {
    const offset = RING_CIRCUMFERENCE * (1 - persen);
    ringFill.style.strokeDashoffset = offset;
    ringFill.style.stroke = warna;
    ringShieldIcon.style.color = warna;
  }

  function perbaruiRingIdle() {
    if (sesi.ancaman > 0) {
      setRing(1, 'var(--red)');
      ringLabel.textContent = 'Ancaman';
      ringCaption.textContent = `${sesi.ancaman} ancaman perlu ditindaklanjuti di tab Pemindaian.`;
    } else if (sesi.mencurigakan > 0) {
      setRing(1, 'var(--amber)');
      ringLabel.textContent = 'Waspada';
      ringCaption.textContent = `${sesi.mencurigakan} file mencurigakan ditemukan.`;
    } else if (sesi.dipindai > 0) {
      setRing(1, 'var(--green)');
      ringLabel.textContent = 'Aman';
      ringCaption.textContent = `${sesi.dipindai} file diperiksa, tidak ada ancaman.`;
    } else {
      setRing(1, 'var(--green)');
      ringLabel.textContent = 'Siap';
      ringCaption.textContent = 'Belum ada pemindaian pada sesi ini.';
    }
  }

  function tambahMiniLog(teks) {
    const kosong = miniLog.querySelector('.mini-log-empty');
    if (kosong) kosong.remove();
    const item = document.createElement('div');
    item.className = 'mini-log-item';
    const jam = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    item.innerHTML = `<span>${teks}</span><span class="mini-log-time">${jam}</span>`;
    miniLog.prepend(item);
    while (miniLog.children.length > 6) miniLog.lastChild.remove();
  }

  // ---------------------------------------------------------------------
  // Pemindaian
  // ---------------------------------------------------------------------
  const scanProgress = document.getElementById('scan-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  const progressFile = document.getElementById('progress-file');
  const btnBatalPindai = document.getElementById('btn-batal-pindai');
  const tabelHasilBody = document.getElementById('tabel-hasil-body');
  const scanSummary = document.getElementById('scan-summary');

  let estimasiTarget = 400; // estimasi jumlah file untuk progress bar (disesuaikan berjalan)
  let sedangMemindai = false;

  function labelStatus(status) {
    return { bersih: 'Bersih', mencurigakan: 'Mencurigakan', ancaman: 'Ancaman', dilewati: 'Dilewati', error: 'Error' }[status] || status;
  }

  function baris(hasil) {
    const tr = document.createElement('tr');
    const tampilkanTombol = hasil.status === 'ancaman' || hasil.status === 'mencurigakan';
    tr.innerHTML = `
      <td class="cell-file" title="${hasil.path}">${hasil.nama}</td>
      <td><span class="pill pill-${hasil.status}">${labelStatus(hasil.status)}</span></td>
      <td class="cell-detail">${hasil.detail || ''}</td>
      <td>${tampilkanTombol ? '<button class="btn btn-sm btn-danger-outline" data-aksi="karantina">Karantina</button>' : ''}</td>
    `;
    if (tampilkanTombol) {
      tr.querySelector('[data-aksi="karantina"]').addEventListener('click', async () => {
        const res = await window.fzshield.karantinakanFile(hasil);
        if (res.ok) {
          tampilkanToast(`${hasil.nama} dipindahkan ke karantina.`);
          tr.querySelector('td:last-child').innerHTML = '<span class="cell-detail">Dikarantina</span>';
          perbaruiDaftarKarantina();
        } else {
          tampilkanToast(`Gagal mengarantina: ${res.error}`, 'ancaman');
        }
      });
    }
    return tr;
  }

  function resetTabelHasil() {
    tabelHasilBody.innerHTML = '';
  }

  async function mulaiPindai(mode) {
    if (sedangMemindai) return;
    let targetPath = null;
    if (mode === 'kustom') {
      targetPath = await window.fzshield.pilihFolder();
      if (!targetPath) return;
    }

    sedangMemindai = true;
    resetTabelHasil();
    sesi.dipindai = 0; sesi.ancaman = 0; sesi.mencurigakan = 0;
    scanProgress.hidden = false;
    progressFill.style.width = '4%';
    progressText.textContent = mode === 'cepat' ? 'Pindai cepat berjalan…' : mode === 'penuh' ? 'Pindai penuh berjalan…' : 'Memindai folder terpilih…';
    scanSummary.textContent = '';
    pindahTampilan('pindai');

    const ringInterval = setInterval(() => {
      const persen = Math.min(0.96, sesi.dipindai / estimasiTarget);
      setRing(Math.max(0.06, persen), 'var(--green)');
    }, 200);

    const hasilAkhir = await window.fzshield.mulaiPindai(mode, targetPath);

    clearInterval(ringInterval);
    sedangMemindai = false;
    scanProgress.hidden = true;

    if (hasilAkhir?.error) {
      tampilkanToast(hasilAkhir.error, 'ancaman');
      return;
    }

    scanSummary.textContent = `${hasilAkhir.jumlahDipindai} file diperiksa • ${hasilAkhir.jumlahAncaman} ancaman • ${hasilAkhir.jumlahMencurigakan} mencurigakan • ${hasilAkhir.durasiDetik}s`;
    tambahMiniLog(`Pindai ${mode === 'kustom' ? 'folder' : mode} selesai (${hasilAkhir.jumlahAncaman} ancaman)`);
    perbaruiRingIdle();
    perbaruiDaftarAktivitas();

    if (tabelHasilBody.children.length === 0) {
      tabelHasilBody.innerHTML = '<tr class="table-empty"><td colspan="4">Tidak ada file yang cocok untuk diperiksa.</td></tr>';
    }
  }

  window.fzshield.onProgresPindai(({ hasil, ringkasan }) => {
    sesi.dipindai = ringkasan.jumlahDipindai;
    sesi.ancaman = ringkasan.jumlahAncaman;
    sesi.mencurigakan = ringkasan.jumlahMencurigakan;

    statDipindai.textContent = sesi.dipindai;
    statAncaman.textContent = sesi.ancaman;
    statMencurigakan.textContent = sesi.mencurigakan;

    progressFile.textContent = hasil.path;
    estimasiTarget = Math.max(estimasiTarget, sesi.dipindai + 20);
    progressFill.style.width = `${Math.min(96, (sesi.dipindai / estimasiTarget) * 100)}%`;

    if (hasil.status === 'ancaman' || hasil.status === 'mencurigakan') {
      if (tabelHasilBody.querySelector('.table-empty')) tabelHasilBody.innerHTML = '';
      tabelHasilBody.prepend(baris(hasil));
    }
  });

  document.querySelectorAll('[data-scan]').forEach((btn) => {
    btn.addEventListener('click', () => mulaiPindai(btn.dataset.scan));
  });
  btnBatalPindai.addEventListener('click', () => window.fzshield.batalkanPindai());

  // ---------------------------------------------------------------------
  // Karantina
  // ---------------------------------------------------------------------
  const tabelKarantinaBody = document.getElementById('tabel-karantina-body');
  const badgeKarantina = document.getElementById('badge-karantina');

  function formatWaktu(iso) {
    return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  }

  async function perbaruiDaftarKarantina() {
    const daftar = await window.fzshield.daftarKarantina();
    badgeKarantina.hidden = daftar.length === 0;
    badgeKarantina.textContent = daftar.length;

    if (daftar.length === 0) {
      tabelKarantinaBody.innerHTML = '<tr class="table-empty"><td colspan="4">Karantina kosong.</td></tr>';
      return;
    }

    tabelKarantinaBody.innerHTML = '';
    daftar.forEach((entri) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cell-file">${entri.namaAsli}</td>
        <td class="cell-detail">${entri.alasan}</td>
        <td class="cell-detail">${formatWaktu(entri.waktuKarantina)}</td>
        <td style="display:flex; gap:8px;">
          <button class="btn btn-sm btn-ghost" data-aksi="pulihkan">Pulihkan</button>
          <button class="btn btn-sm btn-danger-outline" data-aksi="hapus">Hapus</button>
        </td>
      `;
      tr.querySelector('[data-aksi="pulihkan"]').addEventListener('click', async () => {
        const res = await window.fzshield.pulihkanKarantina(entri.id);
        if (res.ok) { tampilkanToast(`${entri.namaAsli} dipulihkan.`); perbaruiDaftarKarantina(); }
        else tampilkanToast(res.error, 'ancaman');
      });
      tr.querySelector('[data-aksi="hapus"]').addEventListener('click', async () => {
        const res = await window.fzshield.hapusKarantina(entri.id);
        if (res.ok) { tampilkanToast(`${entri.namaAsli} dihapus permanen.`); perbaruiDaftarKarantina(); }
        else tampilkanToast(res.error, 'ancaman');
      });
      tabelKarantinaBody.appendChild(tr);
    });
  }

  // ---------------------------------------------------------------------
  // Aktivitas
  // ---------------------------------------------------------------------
  const activityList = document.getElementById('activity-list');

  function teksAktivitas(entri) {
    if (entri.tipe === 'pindaian') {
      const r = entri.ringkasan;
      return `Pemindaian ${r.mode}: ${r.jumlahDipindai} file, ${r.jumlahAncaman} ancaman, ${r.jumlahMencurigakan} mencurigakan (${r.durasiDetik} detik)`;
    }
    if (entri.tipe === 'karantina') {
      return `Dikarantina: ${entri.entri.namaAsli}`;
    }
    if (entri.tipe === 'realtime') {
      return `Perlindungan real-time menandai ${entri.hasil.nama}${entri.hasil.detail ? `: ${entri.hasil.detail}` : ''}`;
    }
    return 'Aktivitas tercatat';
  }

  function tambahBarisAktivitas(entri, keAwal = false) {
    const kosong = activityList.querySelector('.activity-empty');
    if (kosong) kosong.remove();
    const li = document.createElement('li');
    li.className = 'activity-item';
    li.innerHTML = `<span class="activity-main">${teksAktivitas(entri)}</span><span class="activity-time">${formatWaktu(entri.waktu)}</span>`;
    if (keAwal) activityList.prepend(li); else activityList.appendChild(li);
  }

  async function perbaruiDaftarAktivitas() {
    const daftar = await window.fzshield.daftarAktivitas();
    activityList.innerHTML = '';
    if (daftar.length === 0) {
      activityList.innerHTML = '<li class="activity-empty">Belum ada aktivitas tercatat.</li>';
      return;
    }
    daftar.forEach((entri) => tambahBarisAktivitas(entri));
  }

  window.fzshield.onAktivitasBaru((entri) => tambahBarisAktivitas(entri, true));

  // ---------------------------------------------------------------------
  // Deteksi real-time (dari main process)
  // ---------------------------------------------------------------------
  window.fzshield.onDeteksiRealtime((hasil) => {
    tampilkanToast(`Real-time mendeteksi ${hasil.nama}${hasil.detail ? `: ${hasil.detail}` : ''}`, 'ancaman');
    perbaruiDaftarAktivitas();
  });

  // ---------------------------------------------------------------------
  // Pengaturan
  // ---------------------------------------------------------------------
  const toggleRealtime = document.getElementById('toggle-realtime');
  const toggleNotifikasi = document.getElementById('toggle-notifikasi');
  const folderPantauList = document.getElementById('folder-pantau-list');
  const btnTambahFolderPantau = document.getElementById('btn-tambah-folder-pantau');

  let pengaturanAktif = null;

  function terapkanStatusChip() {
    const aktif = pengaturanAktif?.proteksiRealtime;
    statusChip.classList.toggle('is-on', !!aktif);
    statusChipText.textContent = aktif ? 'Real-time aktif' : 'Real-time nonaktif';
  }

  function renderFolderPantau() {
    const daftar = pengaturanAktif?.folderDipantau || [];
    folderPantauList.textContent = daftar.length ? daftar.join(', ') : 'Belum ada folder dipilih.';
  }

  async function muatPengaturanAwal() {
    pengaturanAktif = await window.fzshield.muatPengaturan();
    toggleRealtime.checked = !!pengaturanAktif.proteksiRealtime;
    toggleNotifikasi.checked = pengaturanAktif.notifikasiAktif !== false;
    renderFolderPantau();
    terapkanStatusChip();
  }

  async function simpanPerubahan(partial) {
    pengaturanAktif = await window.fzshield.simpanPengaturan(partial);
    terapkanStatusChip();
    renderFolderPantau();
  }

  toggleRealtime.addEventListener('change', () => {
    if (toggleRealtime.checked && (!pengaturanAktif.folderDipantau || pengaturanAktif.folderDipantau.length === 0)) {
      tampilkanToast('Tambahkan minimal satu folder untuk dipantau terlebih dahulu.', 'ancaman');
      toggleRealtime.checked = false;
      return;
    }
    simpanPerubahan({ proteksiRealtime: toggleRealtime.checked });
  });

  toggleNotifikasi.addEventListener('change', () => {
    simpanPerubahan({ notifikasiAktif: toggleNotifikasi.checked });
  });

  btnTambahFolderPantau.addEventListener('click', async () => {
    const folder = await window.fzshield.pilihFolder();
    if (!folder) return;
    const daftarBaru = Array.from(new Set([...(pengaturanAktif.folderDipantau || []), folder]));
    simpanPerubahan({ folderDipantau: daftarBaru });
  });

  // ---------------------------------------------------------------------
  // Firewall & Jaringan
  // ---------------------------------------------------------------------
  const tabelInterfaceBody = document.getElementById('tabel-interface-body');
  const tabelPortBody = document.getElementById('tabel-port-body');
  const portNote = document.getElementById('port-note');

  async function muatJaringan() {
    tabelInterfaceBody.innerHTML = '<tr class="table-empty"><td colspan="3">Memuat…</td></tr>';
    tabelPortBody.innerHTML = '<tr class="table-empty"><td colspan="3">Memuat…</td></tr>';

    const info = await window.fzshield.infoJaringan();

    if (info.interfaceList.length === 0) {
      tabelInterfaceBody.innerHTML = '<tr class="table-empty"><td colspan="3">Tidak ada interface aktif yang terdeteksi.</td></tr>';
    } else {
      tabelInterfaceBody.innerHTML = '';
      info.interfaceList.forEach((iface) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${iface.nama}</td><td class="cell-file">${iface.alamat}</td><td class="cell-detail">${iface.keluarga}</td>`;
        tabelInterfaceBody.appendChild(tr);
      });
    }

    portNote.hidden = info.didukung !== false;
    if (!info.didukung) {
      tabelPortBody.innerHTML = '<tr class="table-empty"><td colspan="3">Tidak tersedia di sistem ini.</td></tr>';
    } else if (info.port.length === 0) {
      tabelPortBody.innerHTML = '<tr class="table-empty"><td colspan="3">Tidak ada port listening yang terdeteksi.</td></tr>';
    } else {
      tabelPortBody.innerHTML = '';
      info.port.forEach((p) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${p.protokol}</td><td class="cell-file">${p.lokal}</td><td class="cell-detail">${p.pid}</td>`;
        tabelPortBody.appendChild(tr);
      });
    }
  }

  document.getElementById('btn-segarkan-jaringan').addEventListener('click', muatJaringan);
  pemuatTampilan.firewall = muatJaringan;

  // ---------------------------------------------------------------------
  // Cek Tautan
  // ---------------------------------------------------------------------
  const inputTautan = document.getElementById('input-tautan');
  const btnCekTautan = document.getElementById('btn-cek-tautan');
  const linkResult = document.getElementById('link-result');
  const linkResultPill = document.getElementById('link-result-pill');
  const linkResultHost = document.getElementById('link-result-host');
  const linkResultList = document.getElementById('link-result-list');

  const labelLevelTautan = {
    aman: 'Terlihat aman',
    'perhatian-ringan': 'Perhatian ringan',
    'perlu-waspada': 'Perlu waspada',
    'berisiko-tinggi': 'Berisiko tinggi',
    'tidak-valid': 'Format tidak valid',
  };

  async function cekTautan() {
    const nilai = inputTautan.value.trim();
    if (!nilai) return;
    const hasil = await window.fzshield.periksaTautan(nilai);

    linkResult.hidden = false;
    linkResultPill.className = `pill pill-${hasil.level}`;
    linkResultPill.textContent = labelLevelTautan[hasil.level] || hasil.level;
    linkResultHost.textContent = hasil.host || '';
    linkResultList.innerHTML = '';
    hasil.alasan.forEach((a) => {
      const li = document.createElement('li');
      li.textContent = a;
      linkResultList.appendChild(li);
    });
  }

  btnCekTautan.addEventListener('click', cekTautan);
  inputTautan.addEventListener('keydown', (e) => { if (e.key === 'Enter') cekTautan(); });

  // ---------------------------------------------------------------------
  // Item Startup
  // ---------------------------------------------------------------------
  const tabelStartupBody = document.getElementById('tabel-startup-body');

  async function muatStartup() {
    tabelStartupBody.innerHTML = '<tr class="table-empty"><td colspan="4">Memuat…</td></tr>';
    const daftar = await window.fzshield.daftarStartup();

    if (daftar.length === 0) {
      tabelStartupBody.innerHTML = '<tr class="table-empty"><td colspan="4">Tidak ada item startup yang terdeteksi di lokasi standar.</td></tr>';
      return;
    }

    tabelStartupBody.innerHTML = '';
    daftar.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.nama}</td>
        <td class="cell-detail">${item.sumber}</td>
        <td class="cell-detail">${item.waktu ? formatWaktu(item.waktu) : 'Tidak diketahui'}</td>
        <td><button class="btn btn-sm btn-ghost" data-aksi="lokasi">Buka lokasi</button></td>
      `;
      tr.querySelector('[data-aksi="lokasi"]').addEventListener('click', () => window.fzshield.bukaLokasiStartup(item.path));
      tabelStartupBody.appendChild(tr);
    });
  }

  document.getElementById('btn-segarkan-startup').addEventListener('click', muatStartup);
  pemuatTampilan.startup = muatStartup;

  // ---------------------------------------------------------------------
  // Pembersih Sampah
  // ---------------------------------------------------------------------
  const junkList = document.getElementById('junk-list');

  function formatUkuran(bytes) {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`;
    return `${bytes} B`;
  }

  async function muatSampah() {
    junkList.innerHTML = '<p class="panel-note">Memindai…</p>';
    const daftar = await window.fzshield.pindaiSampah();

    if (daftar.length === 0) {
      junkList.innerHTML = '<p class="panel-note">Tidak ada folder cache standar yang terdeteksi di sistem ini.</p>';
      return;
    }

    const totalUkuran = daftar.reduce((jumlah, f) => jumlah + f.ukuran, 0);
    junkList.innerHTML = `
      <div class="junk-summary">
        <span class="junk-summary-total">Total dapat dibersihkan: <strong>${formatUkuran(totalUkuran)}</strong></span>
      </div>
    `;

    daftar.forEach((folder) => {
      const item = document.createElement('div');
      item.className = 'junk-item';
      item.innerHTML = `
        <div>
          <div class="junk-item-name">${folder.label}</div>
          <div class="junk-item-path">${folder.dir}</div>
          <div class="junk-item-meta">${folder.jumlahFile.toLocaleString('id-ID')} file${folder.terpotong ? ' (dibatasi, folder sangat besar)' : ''}</div>
        </div>
        <div class="junk-item-actions">
          <span class="junk-item-size">${formatUkuran(folder.ukuran)}</span>
          <button class="btn btn-danger-outline" data-aksi="bersihkan">Bersihkan</button>
        </div>
      `;
      item.querySelector('[data-aksi="bersihkan"]').addEventListener('click', async () => {
        const hasil = await window.fzshield.bersihkanSampah(folder.id);
        if (hasil.dibatalkan) return;
        if (hasil.ok) {
          tampilkanToast(`${folder.label}: ${formatUkuran(hasil.dibebaskan)} dibebaskan (${hasil.terhapus} item).`);
          muatSampah();
          perbaruiDaftarAktivitas();
        } else {
          tampilkanToast(hasil.error || 'Gagal membersihkan folder.', 'ancaman');
        }
      });
      junkList.appendChild(item);
    });
  }

  document.getElementById('btn-segarkan-sampah').addEventListener('click', muatSampah);
  pemuatTampilan.sampah = muatSampah;

  // ---------------------------------------------------------------------
  // Kesehatan Sistem
  // ---------------------------------------------------------------------
  const healthGrid = document.getElementById('health-grid');

  async function muatKesehatan() {
    healthGrid.innerHTML = '<p class="panel-note">Memuat…</p>';
    const { sistem, keamanan } = await window.fzshield.infoKesehatan();

    const kartuUtama = `
      <div class="health-card"><span class="health-card-label">Sistem operasi</span><span class="health-card-value">${sistem.platform}</span><span class="health-card-sub">${sistem.rilis}</span></div>
      <div class="health-card"><span class="health-card-label">Prosesor</span><span class="health-card-value">${sistem.jumlahCpu} inti</span><span class="health-card-sub">${sistem.cpuModel}</span></div>
      <div class="health-card"><span class="health-card-label">Memori</span><span class="health-card-value">${sistem.memoriBebasGB} / ${sistem.totalMemoriGB} GB</span><span class="health-card-sub">bebas dari total</span></div>
      <div class="health-card"><span class="health-card-label">Uptime</span><span class="health-card-value">${sistem.uptimeJam} jam</span><span class="health-card-sub">${sistem.hostname}</span></div>
    `;

    const diskRows = sistem.ruangDisk.length
      ? sistem.ruangDisk.map((d) => `
        <div class="health-card"><span class="health-card-label">${d.drive}</span><span class="health-card-value">${d.bebasGB} bebas</span><span class="health-card-sub">dari ${d.totalGB}</span></div>
      `).join('')
      : '<p class="panel-note">Info ruang disk tidak tersedia di sistem ini.</p>';

    const pindaiTerakhirTeks = keamanan.pemindaianTerakhir
      ? `${formatWaktu(keamanan.pemindaianTerakhir.waktu)} (${keamanan.pemindaianTerakhir.ringkasan.jumlahAncaman} ancaman)`
      : 'Belum pernah';

    healthGrid.innerHTML = `
      <div class="health-grid health-grid-top">${kartuUtama}</div>
      <div class="panel-block">
        <h2 class="panel-title">Ruang disk</h2>
        <div class="health-grid">${diskRows}</div>
      </div>
      <div class="panel-block">
        <h2 class="panel-title">Postur keamanan FZShield</h2>
        <div class="health-security">
          <div class="health-security-row"><span>Perlindungan real-time</span><span class="pill ${keamanan.realtimeAktif ? 'pill-aman' : 'pill-tidak-valid'}">${keamanan.realtimeAktif ? 'Aktif' : 'Nonaktif'}</span></div>
          <div class="health-security-row"><span>Folder dipantau</span><span>${keamanan.folderDipantau}</span></div>
          <div class="health-security-row"><span>Pemindaian terakhir</span><span>${pindaiTerakhirTeks}</span></div>
          <div class="health-security-row"><span>Item di karantina</span><span>${keamanan.itemKarantina}</span></div>
          <div class="health-security-row"><span>Basis data signature</span><span>v${keamanan.versiSignature} • ${keamanan.jumlahSignature} entri</span></div>
        </div>
      </div>
    `;
  }

  document.getElementById('btn-segarkan-kesehatan').addEventListener('click', muatKesehatan);
  pemuatTampilan.kesehatan = muatKesehatan;

  // ---------------------------------------------------------------------
  // Inisialisasi
  // ---------------------------------------------------------------------
  perbaruiRingIdle();
  muatPengaturanAwal();
  perbaruiDaftarKarantina();
  perbaruiDaftarAktivitas();
})();
