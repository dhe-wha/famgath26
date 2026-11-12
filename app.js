const KEY = 'konsumsi-fg-v2';
const CFG_KEY = 'konsumsi-fg-cfg';
const QUEUE_KEY = 'konsumsi-fg-queue';

const KATEGORI = ['Nasi Kotak', 'Makanan', 'Minuman', 'Jajanan'];
const ICON = ['🍱', '🍲', '🥤', '🍡'];
const STATUS = [
  ['belum', 'Belum pesan'],
  ['dipesan', 'Dipesan'],
  ['diterima', 'Diterima'],
];

// Nasi Kotak: titik pengantaran (diganti dari sheet Ketentuan saat sinkron) dan checklist verifikasi
const LOKASI = ['VIP', ...['A', 'B', 'C', 'D'].flatMap((z) => [1, 2, 3].map((n) => z + n))];
const CEK = [
  ['lauk', 'Lauk'],
  ['buah', 'Buah'],
  ['sambal', 'Sambal'],
  ['sayur', 'Sayur'],
  ['minum', 'Minum'],
  ['sendok', 'Sendok'],
];
const NASI = KATEGORI[0];
const cekDone = (i) => CEK.filter(([k]) => i.cek && i.cek[k]).length;
const terverifikasi = (i) => cekDone(i) === CEK.length;

const $ = (id) => document.getElementById(id);
const rp = (n) => 'Rp ' + Math.round(n || 0).toLocaleString('id-ID');
const statusLabel = (s) => STATUS.find((x) => x[0] === s)[1];

// URL Web App Apps Script (Deploy > Web app > URL berakhiran /exec). Kosong = mode lokal tanpa sinkron.
const API_URL = 'https://script.google.com/macros/s/AKfycbzo4oeSgF1JdjRvTvBB33m12vilOT8fZ3LP6Fnv0cnjCoqRj2pZzz2rc4HibedYotV5/exec';

let cfg = { ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}'), url: API_URL }; // {url, user, pass, nama}
let queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
let syncMsg = '';
let busy = false;

let state = load();
const UPDATE = 'Update';
const PESERTA = 'Peserta';
const TABS = [[NASI, '🍱'], [UPDATE, '📊'], [PESERTA, '👥']];
const PER = 10;
let tab = NASI;
let page = 1;
let editId = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.items) return s;
  } catch {}
  return {
    items: cfg.url
      ? []
      : Array.from({ length: 40 }, (_, n) => ({
          id: crypto.randomUUID(),
          kategori: NASI,
          vendor: 'Vendor ' + (n + 1),
          desa: '',
          kontak: '',
          qty: 30,
          biaya: 0,
          status: 'belum',
          lokasi: '',
          pic: '',
          cek: {},
        })),
    target: Object.fromEntries(KATEGORI.map((k) => [k, { target: 0, anggaran: 0 }])),
    lokasi: LOKASI,
  };
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}

function stats(kat) {
  const its = state.items.filter((i) => i.kategori === kat);
  const t = state.target[kat] || { target: 0, anggaran: 0 };
  return {
    n: its.length,
    qty: its.reduce((a, i) => a + i.qty, 0),
    dipesan: its.filter((i) => i.status !== 'belum').reduce((a, i) => a + i.qty, 0),
    diterima: its.filter((i) => i.status === 'diterima').reduce((a, i) => a + i.qty, 0),
    biaya: its.reduce((a, i) => a + (i.biaya || 0), 0),
    nDiterima: its.filter((i) => i.status === 'diterima').length,
    ...t,
  };
}

// waktu terakhir diubah, mis. "12 Nov 16.42"
const fmtTs = (ms) =>
  ms ? new Date(ms).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

// biaya dan anggaran hanya untuk admin (mode lokal tanpa Sheet bebas)
const showBiaya = () => !cfg.url || cfg.admin;

const pct = (a, b) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTabs() {
  $('tabs').innerHTML = TABS.map(
    ([k, ic]) =>
      `<button class="${k === tab ? 'on' : ''}" data-k="${k}"><span class="ic">${ic}</span><span>${k}</span></button>`
  ).join('');
}

function renderSummary() {
  const s = stats(NASI);
  const sisa = s.anggaran - s.biaya;
  $('summary').innerHTML = `
    <div class="sumhead"><b>${NASI}</b><button id="btnTarget">Atur target</button></div>
    <div class="grid">
      <div class="stat"><small>Jumlah diterima / dipesan</small><b>${s.diterima} / ${s.dipesan}</b></div>
      <div class="stat"><small>Vendor diterima</small><b>${s.nDiterima} / ${s.n}</b></div>
      ${
        showBiaya()
          ? `<div class="stat"><small>Total biaya</small><b>${rp(s.biaya)}</b></div>
      <div class="stat"><small>Sisa anggaran (${rp(s.anggaran)})</small><b class="${sisa < 0 ? 'over' : ''}">${rp(sisa)}</b></div>`
          : ''
      }
    </div>
    <div class="prog"><label><span>Dipesan</span><span>${pct(s.dipesan, s.target).toFixed(0)}%</span></label>
      <div class="track"><div class="fill" style="width:${pct(s.dipesan, s.target)}%"></div></div></div>
    <div class="prog"><label><span>Diterima</span><span>${s.diterima} / ${s.qty}</span></label>
      <div class="track"><div class="fill" style="width:${pct(s.diterima, s.qty)}%"></div></div></div>
    <div class="meta upd">Terakhir diperbarui: ${fmtTs(Math.max(0, ...state.items.map((i) => i.updated || 0))) || '-'}</div>`;
  $('btnTarget').onclick = openTarget;
}

// ringkasan diterima per titik lokasi (hanya Nasi Kotak)
function renderLokasi() {
  const its = state.items.filter((i) => i.kategori === NASI && i.status === 'diterima');
  const dipakai = state.items.map((i) => i.lokasi).filter(Boolean);
  const lok = [...new Set([...(state.lokasi || LOKASI), ...dipakai])];
  $('lokList').innerHTML = lok
    .map((l) => {
      const a = its.filter((i) => i.lokasi === l);
      const qty = a.reduce((n, i) => n + i.qty, 0);
      return `<li><div class="top"><span class="vendor">${esc(l)}</span><span class="badge ${a.length ? 's-diterima' : 's-belum'}">${a.length} vendor</span></div>
        <div class="meta">${qty} porsi diterima</div></li>`;
    })
    .join('');
}

function renderList() {
  const f = $('filterStatus').value;
  const q = $('search').value.trim().toLowerCase();
  const all = state.items.filter(
    (i) =>
      i.kategori === NASI &&
      (!f || i.status === f) &&
      (!q || [i.vendor, i.pic].join(' ').toLowerCase().includes(q))
  );
  const pages = Math.max(1, Math.ceil(all.length / PER));
  page = Math.min(page, pages);
  const its = all.slice((page - 1) * PER, page * PER);
  $('list').innerHTML = its.length
    ? its
        .map((i) => {
          const lokasi =
            tab === NASI
              ? `<div class="meta line"><span>Lokasi ${esc(i.lokasi) || '-'} · <span class="${terverifikasi(i) ? 'vok' : ''}">Cek ${cekDone(i)}/${CEK.length}</span></span><span class="upd">${i.updated ? 'Update ' + fmtTs(i.updated) : ''}</span></div>`
              : i.lokasi
              ? `<div class="meta">Lokasi ${esc(i.lokasi)}</div>`
              : '';
          return `<li data-id="${i.id}">
        <div class="top"><span class="vendor">${esc(i.vendor)}</span>
          <span class="badge s-${i.status}">${statusLabel(i.status)}</span></div>
        <div class="meta line"><span>${i.qty} porsi${i.biaya && showBiaya() ? ' · ' + rp(i.biaya) : ''}</span><span class="pic">${esc(i.pic)}</span></div>
        ${lokasi}
      </li>`;
        })
        .join('')
    : '<li class="empty">Belum ada data</li>';
  const from = all.length ? (page - 1) * PER + 1 : 0;
  $('pager').innerHTML = `<button data-p="-1" ${page <= 1 ? 'disabled' : ''}>‹ Prev</button><span>${from}–${Math.min(page * PER, all.length)} dari ${all.length}<br>Hal ${page} / ${pages}</span><button data-p="1" ${page >= pages ? 'disabled' : ''}>Next ›</button>`;
}

// ---- peserta: jumlah orang per lokasi duduk vs nasi kotak di lokasi yang sama ----
// Kekurangan di satu lokasi diambil dari kelebihan di lokasi terdekat. Kedekatan = jarak urutan
// di daftar lokasi (atur urutannya di panel admin > Lokasi).
function renderPeserta() {
  const pes = state.peserta || [];
  const nasi = state.items.filter((i) => i.kategori === NASI);
  const lok = [...new Set([...(state.lokasi || LOKASI), ...pes.map((p) => p.lokasi), ...nasi.map((i) => i.lokasi)].filter(Boolean))];
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
  const totPes = sum(pes, (p) => p.jumlah);
  const totNasi = sum(nasi, (i) => i.qty);
  const sel = (n) => (n > 0 ? '+' : '') + n;
  $('pesSum').innerHTML = `<div class="grid">
      <div class="stat"><small>Total peserta</small><b>${totPes}</b></div>
      <div class="stat"><small>Total nasi kotak</small><b>${totNasi}</b></div>
      <div class="stat"><small>Selisih (nasi − peserta)</small><b class="${totNasi < totPes ? 'over' : ''}">${sel(totNasi - totPes)}</b></div>
      <div class="stat"><small>Departemen</small><b>${pes.length}</b></div></div>`;

  const diff = {};
  $('pesLok').innerHTML = lok
    .map((l) => {
      const p = sum(pes.filter((x) => x.lokasi === l), (x) => x.jumlah);
      const n = sum(nasi.filter((i) => i.lokasi === l), (i) => i.qty);
      diff[l] = n - p;
      const cls = diff[l] < 0 ? 's-bad' : diff[l] > 0 ? 's-dipesan' : 's-diterima';
      return `<li><div class="top"><span class="vendor">${esc(l)}</span><span class="badge ${cls}">${sel(diff[l])}</span></div>
        <div class="meta">Peserta ${p} · Nasi kotak ${n}</div></li>`;
    })
    .join('');
  const tanpaLokP = sum(pes.filter((p) => !p.lokasi), (p) => p.jumlah);
  const tanpaLokN = sum(nasi.filter((i) => !i.lokasi), (i) => i.qty);
  if (tanpaLokP || tanpaLokN)
    $('pesLok').insertAdjacentHTML('beforeend', `<li><div class="top"><span class="vendor">Belum ada lokasi</span></div><div class="meta">Peserta ${tanpaLokP} · Nasi kotak ${tanpaLokN}</div></li>`);

  // greedy: kekurangan diisi dari lokasi berlebih yang paling dekat
  const sisa = { ...diff };
  const saran = [];
  lok.forEach((d, di) => {
    if (sisa[d] >= 0) return;
    lok
      .map((s, si) => ({ s, jarak: Math.abs(si - di) }))
      .filter((x) => sisa[x.s] > 0)
      .sort((a, b) => a.jarak - b.jarak)
      .forEach(({ s }) => {
        const ambil = Math.min(-sisa[d], sisa[s]);
        if (ambil <= 0) return;
        saran.push(`<li><b>${esc(d)}</b> kurang → ambil <b>${ambil}</b> dari <b>${esc(s)}</b></li>`);
        sisa[d] += ambil;
        sisa[s] -= ambil;
      });
    if (sisa[d] < 0) saran.push(`<li><b>${esc(d)}</b> masih kurang <b>${-sisa[d]}</b>, tidak ada lokasi berlebih</li>`);
  });
  $('pesSaran').innerHTML = saran.length ? saran.join('') : '<li class="empty">Semua lokasi seimbang atau belum ada data</li>';

  $('btnPesAdd').hidden = !cfg.admin;
  $('pesList').innerHTML = pes.length
    ? pes
        .map(
          (p) => `<li data-id="${esc(p.id)}"><div class="top"><span class="vendor">${esc(p.dept)}</span><span class="badge s-belum">${p.jumlah} orang</span></div>
        <div class="meta">${p.lokasi ? 'Lokasi ' + esc(p.lokasi) : 'Belum ada lokasi'}</div></li>`
        )
        .join('')
    : '<li class="empty">Belum ada data peserta</li>';
}

function render() {
  $('viewList').hidden = tab !== NASI;
  $('viewUpdate').hidden = tab !== UPDATE;
  $('viewPeserta').hidden = tab !== PESERTA;
  $('fab').hidden = tab !== NASI;
  renderTabs();
  if (tab === UPDATE) {
    renderSummary();
    renderLokasi();
  } else if (tab === PESERTA) renderPeserta();
  else renderList();
}

function openItem(id) {
  editId = id || null;
  const f = $('formItem');
  const it = state.items.find((i) => i.id === id);
  const nasi = tab === NASI;
  f.reset();
  $('itemTitle').textContent = it ? 'Ubah' : 'Tambah ke ' + tab;
  // hapus vendor hanya admin (mode lokal tanpa Sheet bebas)
  $('btnDelete').style.display = it && (!cfg.url || cfg.admin) ? '' : 'none';
  $('nkOnly').style.display = nasi ? '' : 'none';
  // Nasi Kotak: Desa, Handphone, Biaya hanya tampil untuk admin
  f.querySelectorAll('.nk-hide').forEach((el) => (el.style.display = nasi && !cfg.admin ? 'none' : ''));
  f.querySelectorAll('.lok-txt').forEach((el) => (el.style.display = nasi ? 'none' : ''));
  f.elements.lokasi.innerHTML =
    '<option value="">-</option>' + (state.lokasi || LOKASI).map((l) => `<option>${esc(l)}</option>`).join('');
  $('picNote').textContent = cfg.nama ? 'PIC: ' + cfg.nama + ' (otomatis dari akun login)' : '';
  if (it) {
    f.elements.vendor.value = it.vendor;
    f.elements.qty.value = it.qty;
    f.elements.status.value = it.status;
    f.elements.desa.value = it.desa || '';
    f.elements.kontak.value = it.kontak || '';
    f.elements.biaya.value = it.biaya || '';
    if (nasi) {
      f.elements.lokasi.value = it.lokasi || '';
      for (const [k] of CEK) f.elements['cek_' + k].checked = !!(it.cek && it.cek[k]);
    } else {
      f.elements.lokasiTxt.value = it.lokasi || '';
    }
  }
  $('dlgItem').showModal();
}

function openTarget() {
  const t = state.target[NASI] || { target: 0, anggaran: 0 };
  $('targetTitle').textContent = 'Target ' + NASI;
  $('formTarget').elements.target.value = t.target;
  $('formTarget').elements.anggaran.value = t.anggaran;
  $('dlgTarget').showModal();
}

$('tabs').onclick = (e) => {
  const k = e.target.closest('button')?.dataset.k;
  if (k) { tab = k; render(); window.scrollTo(0, 0); }
};
$('list').onclick = (e) => {
  const li = e.target.closest('li[data-id]');
  if (li) openItem(li.dataset.id);
};
$('fab').onclick = () => openItem();
$('search').oninput = () => { page = 1; renderList(); };
$('filterStatus').onchange = () => { page = 1; renderList(); };
$('pager').onclick = (e) => {
  const d = +e.target.closest('button[data-p]')?.dataset.p;
  if (d) { page += d; renderList(); window.scrollTo(0, 0); }
};
$('btnCancel').onclick = () => $('dlgItem').close();
$('btnTargetCancel').onclick = () => $('dlgTarget').close();

$('formItem').onsubmit = () => {
  const f = $('formItem').elements;
  const data = { vendor: f.vendor.value.trim(), qty: +f.qty.value, status: f.status.value };
  if (tab === NASI) {
    data.lokasi = f.lokasi.value;
    data.cek = Object.fromEntries(CEK.map(([k]) => [k, f['cek_' + k].checked]));
  } else {
    data.lokasi = f.lokasiTxt.value.trim();
  }
  if (tab !== NASI || cfg.admin) {
    data.desa = f.desa.value.trim();
    data.kontak = f.kontak.value.trim();
    data.biaya = +f.biaya.value || 0;
  }
  let item = state.items.find((i) => i.id === editId);
  if (item) Object.assign(item, data);
  else {
    item = { id: crypto.randomUUID(), kategori: tab, desa: '', kontak: '', biaya: 0, lokasi: '', cek: {}, ...data };
    state.items.push(item);
  }
  item.pic = cfg.nama || item.pic || '';
  if (tab === NASI) item.updated = Date.now();
  save();
  enqueue({ action: 'upsert', item: { ...item } });
};

$('btnDelete').onclick = () => {
  if (!confirm('Hapus data ini?')) return;
  state.items = state.items.filter((i) => i.id !== editId);
  $('dlgItem').close();
  save();
  enqueue({ action: 'delete', kategori: tab, id: editId });
};

$('formTarget').onsubmit = () => {
  const f = $('formTarget').elements;
  state.target[NASI] = { target: +f.target.value, anggaran: +f.anggaran.value };
  save();
  enqueue({ action: 'target', kategori: NASI, ...state.target[NASI] });
};

// ---- sinkron Google Sheet (lewat Apps Script web app) ----
function showSync() {
  const el = $('sync');
  if (!cfg.url) el.textContent = 'Mode lokal (belum terhubung ke Sheet)';
  else el.textContent = (cfg.nama ? cfg.nama + ' · ' : '') + syncMsg + (queue.length ? ` · ${queue.length} menunggu kirim` : '');
  $('btnSync').classList.toggle('spin', busy);
}

async function api(body) {
  // text/plain agar tidak memicu preflight CORS di Apps Script
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ user: cfg.user, pass: cfg.pass, ...body }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'gagal');
  return j;
}

function saveQueue() {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function enqueue(op) {
  if (!cfg.url) return;
  queue.push(op);
  saveQueue();
  sync(false);
}

// vendor baru dapat id (kolom No) dari sheet; ganti id sementara di data lokal dan antrian
function remapId(oldId, newId) {
  const it = state.items.find((i) => i.id === oldId);
  if (it) it.id = newId;
  queue.forEach((op) => {
    if (op.item && op.item.id === oldId) op.item.id = newId;
    if (op.id === oldId) op.id = newId;
  });
  localStorage.setItem(KEY, JSON.stringify(state));
}

async function sync(pull = true) {
  if (!cfg.url || !cfg.user || busy) return;
  busy = true;
  syncMsg = 'Menyinkronkan…';
  showSync();
  try {
    while (queue.length) {
      const op = queue[0];
      const res = await api(op);
      if (op.action === 'upsert' && res.id && res.id !== op.item.id) remapId(op.item.id, res.id);
      queue.shift();
      saveQueue();
    }
    if (pull) {
      const { items, target, lokasi, nama, admin, peserta } = await api({ action: 'read' });
      state = { items, target: { ...state.target, ...target }, lokasi: lokasi.length ? lokasi : LOKASI, peserta: peserta || [] };
      cfg.nama = nama;
      cfg.admin = !!admin;
      $('btnAdmin').hidden = !cfg.admin;
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      localStorage.setItem(KEY, JSON.stringify(state));
      render();
    }
    syncMsg = 'Tersinkron ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    syncMsg = 'Gagal: ' + e.message;
    // sesi tidak berlaku lagi (password diganti / user dihapus): minta login ulang
    if (/User atau password|Password user/.test(e.message)) {
      cfg.nama = '';
      cfg.admin = false;
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
      $('btnAdmin').hidden = true;
      busy = false;
      showSync();
      if (!$('dlgCfg').open || $('cfgMsg').textContent === 'Memeriksa…') openCfg(e.message);
      return;
    }
  }
  busy = false;
  showSync();
}

// Dengan Sheet terhubung, isi aplikasi tersembunyi sampai user berhasil login.
const locked = () => !!cfg.url && !cfg.nama;
const updateLock = () => document.body.classList.toggle('locked', locked());

function openCfg(msg = '') {
  const f = $('formCfg').elements;
  f.user.value = cfg.user || '';
  f.pass.value = cfg.pass || '';
  $('cfgMsg').textContent = msg;
  $('cfgTitle').textContent = locked() ? 'Masuk' : 'Akun';
  $('btnCfgCancel').hidden = $('btnLogout').hidden = locked();
  updateLock();
  if (!$('dlgCfg').open) $('dlgCfg').showModal();
}

$('dlgCfg').addEventListener('cancel', (e) => locked() && e.preventDefault());
$('btnSync').onclick = () => (cfg.url && cfg.user ? sync() : openCfg());
$('btnCfg').onclick = () => openCfg();
$('btnCfgCancel').onclick = () => $('dlgCfg').close();
$('btnLogout').onclick = () => {
  cfg = { url: cfg.url };
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  $('btnAdmin').hidden = true;
  showSync();
  openCfg();
};
$('formCfg').onsubmit = async (e) => {
  e.preventDefault();
  const f = $('formCfg').elements;
  cfg = { url: API_URL, user: f.user.value.trim(), pass: f.pass.value };
  $('cfgMsg').textContent = 'Memeriksa…';
  await sync();
  if (cfg.nama) {
    $('dlgCfg').close();
    updateLock();
  } else {
    $('cfgMsg').textContent = syncMsg.replace('Gagal: ', '');
  }
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') sync();
});
setInterval(() => document.visibilityState === 'visible' && sync(), 60000);

$('filterStatus').innerHTML =
  '<option value="">Semua status</option>' + STATUS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
$('formItem').elements.status.innerHTML = STATUS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
$('cek').insertAdjacentHTML(
  'beforeend',
  CEK.map(([k, l]) => `<label><input type="checkbox" name="cek_${k}">${l}</label>`).join('')
);

// hitung mundur ke hari acara
const hari = Math.ceil((new Date('2026-11-14T00:00:00') - new Date().setHours(0, 0, 0, 0)) / 864e5);
$('hday').textContent = hari > 0 ? 'H-' + hari : hari === 0 ? 'Hari ini!' : 'Selesai';

if (!cfg.url) $('btnSync').hidden = $('btnCfg').hidden = true;
$('btnAdmin').hidden = !cfg.admin;

// ---- peserta (admin: tambah / ubah / hapus langsung ke Sheet) ----
let editPes = null;
function openPeserta(id) {
  editPes = id || null;
  const p = (state.peserta || []).find((x) => x.id === id);
  const f = $('formPeserta');
  f.reset();
  $('pesTitle').textContent = p ? 'Ubah departemen' : 'Tambah departemen';
  $('pesMsg').textContent = '';
  f.elements.lokasi.innerHTML = '<option value="">-</option>' + (state.lokasi || LOKASI).map((l) => `<option>${esc(l)}</option>`).join('');
  $('btnPesDel').style.display = p ? '' : 'none';
  if (p) {
    f.elements.dept.value = p.dept;
    f.elements.jumlah.value = p.jumlah;
    f.elements.lokasi.value = p.lokasi;
  }
  $('dlgPeserta').showModal();
}
async function pesCall(body) {
  $('pesMsg').textContent = 'Memproses…';
  try {
    await api(body);
    $('dlgPeserta').close();
    await sync();
  } catch (e) {
    $('pesMsg').textContent = e.message;
  }
}
$('btnPesAdd').onclick = () => openPeserta();
$('pesList').onclick = (e) => {
  const li = e.target.closest('li[data-id]');
  if (li && cfg.admin) openPeserta(li.dataset.id);
};
$('btnPesCancel').onclick = () => $('dlgPeserta').close();
$('btnPesDel').onclick = () => {
  if (editPes && confirm('Hapus departemen ini?')) pesCall({ action: 'pesertaDelete', id: editPes });
};
$('formPeserta').onsubmit = (e) => {
  e.preventDefault();
  const f = $('formPeserta').elements;
  pesCall({ action: 'pesertaSave', id: editPes, dept: f.dept.value.trim(), jumlah: +f.jumlah.value, lokasi: f.lokasi.value });
};

// ---- panel admin: kelola user, password, dan daftar lokasi ----
let users = [];
let editUser = null;

function adminMsg(text, err) {
  $('adminMsg').textContent = text;
  $('adminMsg').classList.toggle('err', !!err);
}

function renderUsers() {
  $('userList').innerHTML = users
    .map(
      (u) =>
        `<li data-u="${esc(u.user)}" class="${u.user === editUser ? 'sel' : ''}"><b>${esc(u.nama)}</b> <small>${esc(u.user)} · ${esc(u.pass)} · ${esc(u.role)}</small></li>`
    )
    .join('');
}

function fillUserForm(u) {
  editUser = u ? u.user : null;
  const f = $('formUser').elements;
  f.user.value = u ? u.user : '';
  f.nama.value = u ? u.nama : '';
  f.pass.value = u ? u.pass : '';
  f.role.value = u ? u.role : 'User';
  $('btnUserDel').style.display = u ? '' : 'none';
  renderUsers();
}

async function adminCall(body, okMsg) {
  adminMsg('Memproses…');
  try {
    const r = await api(body);
    adminMsg(okMsg);
    return r;
  } catch (e) {
    adminMsg(e.message, true);
  }
}

async function loadUsers() {
  const r = await adminCall({ action: 'users' }, '');
  if (r) users = r.users;
  fillUserForm(null);
}

$('btnAdmin').onclick = () => {
  adminMsg('');
  $('formLokasi').elements.list.value = (state.lokasi || LOKASI).join('\n');
  $('dlgAdmin').showModal();
  loadUsers();
};
$('btnAdminClose').onclick = () => $('dlgAdmin').close();
document.querySelectorAll('.seg button').forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
    $('pUser').hidden = b.dataset.p !== 'user';
    $('pLokasi').hidden = b.dataset.p !== 'lokasi';
    adminMsg('');
  };
});
$('userList').onclick = (e) => {
  const li = e.target.closest('li[data-u]');
  if (li) fillUserForm(users.find((u) => u.user === li.dataset.u));
};
$('btnUserNew').onclick = () => fillUserForm(null);
$('formUser').onsubmit = async (e) => {
  e.preventDefault();
  const f = $('formUser').elements;
  const u = { user: f.user.value.trim(), nama: f.nama.value.trim(), pass: f.pass.value, role: f.role.value };
  const r = await adminCall({ action: 'userSave', oldUser: editUser, ...u }, 'User tersimpan');
  if (r) {
    if (cfg.user && editUser && editUser.toLowerCase() === cfg.user.toLowerCase()) {
      cfg.pass = u.pass;
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    }
    await loadUsers();
    adminMsg('User tersimpan');
  }
};
$('btnUserDel').onclick = async () => {
  if (!editUser || !confirm('Hapus user ' + editUser + '?')) return;
  if (await adminCall({ action: 'userDelete', user: editUser }, 'User dihapus')) {
    await loadUsers();
    adminMsg('User dihapus');
  }
};
$('formLokasi').onsubmit = async (e) => {
  e.preventDefault();
  const list = $('formLokasi').elements.list.value.split('\n').map((l) => l.trim()).filter(Boolean);
  if (await adminCall({ action: 'lokasiSet', list }, 'Lokasi tersimpan')) {
    state.lokasi = list;
    localStorage.setItem(KEY, JSON.stringify(state));
  }
};

render();
showSync();
updateLock();
if (locked()) openCfg();
else sync();

// banner mengecil saat scroll supaya konten terlihat; jeda (hysteresis) mencegah berkedip
addEventListener('scroll', () => {
  const f = document.querySelector('.frozen');
  if (scrollY > 80) f.classList.add('shrunk');
  else if (scrollY < 10) f.classList.remove('shrunk');
}, { passive: true });

// Service worker baru yang mengambil alih memunculkan tombol muat ulang (halaman masih memakai kode lama).
if ('serviceWorker' in navigator) {
  const sudahAktif = !!navigator.serviceWorker.controller; // false = instal pertama, tidak perlu pesan
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (sudahAktif) $('update').hidden = false;
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const cek = () => reg.update().catch(() => {});
    setInterval(cek, 60000);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && cek());
  });
}
$('btnReload').onclick = () => location.reload();
