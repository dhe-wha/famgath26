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
const API_URL = '';

let cfg = { ...JSON.parse(localStorage.getItem(CFG_KEY) || '{}'), url: API_URL }; // {url, user, pass, nama}
let queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
let syncMsg = '';
let busy = false;

let state = load();
let tab = KATEGORI[0];
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
    verif: its.filter(terverifikasi).length,
    ...t,
  };
}

const pct = (a, b) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderTabs() {
  $('tabs').innerHTML = KATEGORI.map(
    (k, n) =>
      `<button class="${k === tab ? 'on' : ''}" data-k="${k}"><span class="ic">${ICON[n]}</span><span>${k}</span></button>`
  ).join('');
}

function renderSummary() {
  const s = stats(tab);
  const sisa = s.anggaran - s.biaya;
  $('summary').innerHTML = `
    <div class="sumhead"><b>${tab}</b><button id="btnTarget">Atur target</button></div>
    <div class="grid">
      <div class="stat"><small>Jumlah dipesan / target</small><b>${s.dipesan} / ${s.target}</b></div>
      <div class="stat"><small>${tab === NASI ? 'Vendor terverifikasi' : 'Vendor'}</small><b>${tab === NASI ? s.verif + ' / ' + s.n : s.n}</b></div>
      <div class="stat"><small>Total biaya</small><b>${rp(s.biaya)}</b></div>
      <div class="stat"><small>Sisa anggaran (${rp(s.anggaran)})</small><b class="${sisa < 0 ? 'over' : ''}">${rp(sisa)}</b></div>
    </div>
    <div class="prog"><label><span>Dipesan</span><span>${pct(s.dipesan, s.target).toFixed(0)}%</span></label>
      <div class="track"><div class="fill" style="width:${pct(s.dipesan, s.target)}%"></div></div></div>
    <div class="prog"><label><span>Diterima</span><span>${s.diterima} / ${s.qty}</span></label>
      <div class="track"><div class="fill" style="width:${pct(s.diterima, s.qty)}%"></div></div></div>`;
  $('btnTarget').onclick = openTarget;
}

function renderList() {
  const f = $('filterStatus').value;
  const q = $('search').value.trim().toLowerCase();
  const its = state.items.filter(
    (i) =>
      i.kategori === tab &&
      (!f || i.status === f) &&
      (!q || [i.vendor, i.pic].join(' ').toLowerCase().includes(q))
  );
  $('list').innerHTML = its.length
    ? its
        .map((i) => {
          const lokasi =
            tab === NASI
              ? `<div class="meta">Lokasi ${esc(i.lokasi) || '-'} · <span class="${terverifikasi(i) ? 'vok' : ''}">Cek ${cekDone(i)}/${CEK.length}</span></div>`
              : i.lokasi
              ? `<div class="meta">Lokasi ${esc(i.lokasi)}</div>`
              : '';
          return `<li data-id="${i.id}">
        <div class="top"><span class="vendor">${esc(i.vendor)}</span>
          <span class="badge s-${i.status}">${statusLabel(i.status)}</span></div>
        <div class="meta line"><span>${i.qty} porsi${i.biaya ? ' · ' + rp(i.biaya) : ''}</span><span class="pic">${esc(i.pic)}</span></div>
        ${lokasi}
      </li>`;
        })
        .join('')
    : '<li class="empty">Belum ada data</li>';
}

function render() {
  renderTabs();
  renderSummary();
  renderList();
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
  const t = state.target[tab] || { target: 0, anggaran: 0 };
  $('targetTitle').textContent = 'Target ' + tab;
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
$('search').oninput = renderList;
$('filterStatus').onchange = renderList;
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
  state.target[tab] = { target: +f.target.value, anggaran: +f.anggaran.value };
  save();
  enqueue({ action: 'target', kategori: tab, ...state.target[tab] });
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
      const { items, target, lokasi, nama, admin } = await api({ action: 'read' });
      state = { items, target: { ...state.target, ...target }, lokasi: lokasi.length ? lokasi : LOKASI };
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

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
