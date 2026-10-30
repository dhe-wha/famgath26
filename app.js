const KEY = 'konsumsi-fg-v1';
const KATEGORI = ['Nasi Kotak', 'UMKM Makanan', 'UMKM Minuman'];
const ICON = ['🍱', '🍲', '🥤'];
const STATUS = [
  ['belum', 'Belum pesan'],
  ['dipesan', 'Dipesan'],
  ['dp', 'DP'],
  ['lunas', 'Lunas'],
  ['diterima', 'Diterima'],
];

// Nasi Kotak: titik pengantaran dan checklist verifikasi (dari sheet Famgat_2026)
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

let state = load();
let tab = KATEGORI[0];
let editId = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.items) return s;
  } catch {}
  return {
    items: Array.from({ length: 40 }, (_, n) => ({
      id: crypto.randomUUID(),
      kategori: NASI,
      vendor: 'Vendor ' + (n + 1),
      menu: 'Nasi kotak',
      qty: 0,
      harga: 0,
      dibayar: 0,
      status: 'belum',
      pic: '',
      kontak: '',
      catatan: '',
      desa: '',
      lokasi: '',
      cek: {},
    })),
    target: Object.fromEntries(KATEGORI.map((k) => [k, { target: 0, anggaran: 0 }])),
  };
}

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
  render();
}

function stats(kat) {
  const its = state.items.filter((i) => i.kategori === kat);
  const t = state.target[kat];
  const qty = its.reduce((a, i) => a + i.qty, 0);
  const diterima = its.filter((i) => i.status === 'diterima').reduce((a, i) => a + i.qty, 0);
  const dipesan = its.filter((i) => i.status !== 'belum').reduce((a, i) => a + i.qty, 0);
  const biaya = its.reduce((a, i) => a + i.qty * i.harga, 0);
  const dibayar = its.reduce((a, i) => a + i.dibayar, 0);
  const verif = its.filter(terverifikasi).length;
  return { n: its.length, qty, diterima, dipesan, biaya, dibayar, verif, ...t };
}

const pct = (a, b) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);

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
    <div class="prog"><label><span>Diterima</span><span>${s.diterima} / ${s.qty || s.target}</span></label>
      <div class="track"><div class="fill" style="width:${pct(s.diterima, s.qty)}%"></div></div></div>
    <div class="prog"><label><span>Dibayar</span><span>${rp(s.dibayar)} / ${rp(s.biaya)}</span></label>
      <div class="track"><div class="fill pay" style="width:${pct(s.dibayar, s.biaya)}%"></div></div></div>`;
  $('btnTarget').onclick = openTarget;
}

function renderList() {
  const f = $('filterStatus').value;
  const q = $('search').value.trim().toLowerCase();
  const its = state.items.filter(
    (i) =>
      i.kategori === tab &&
      (!f || i.status === f) &&
      (!q || [i.vendor, i.menu, i.pic].join(' ').toLowerCase().includes(q))
  );
  $('list').innerHTML = its.length
    ? its
        .map((i) => {
          const total = i.qty * i.harga;
          return `<li data-id="${i.id}">
        <div class="top"><span class="vendor">${esc(i.vendor)}</span>
          <span class="badge s-${i.status}">${statusLabel(i.status)}</span></div>
        <div class="meta">${esc(i.menu)} · ${i.qty} × ${rp(i.harga)}${i.pic ? ' · PIC ' + esc(i.pic) : ''}</div>
        ${
          tab === NASI
            ? `<div class="meta">${i.desa ? esc(i.desa) + ' · ' : ''}Lokasi ${i.lokasi || '-'} · <span class="${terverifikasi(i) ? 'vok' : ''}">Cek ${cekDone(i)}/${CEK.length}</span></div>`
            : ''
        }
        <div class="money">Total ${rp(total)} · Dibayar ${rp(i.dibayar)} · Sisa ${rp(total - i.dibayar)}</div>
      </li>`;
        })
        .join('')
    : '<li class="empty">Belum ada data</li>';
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  f.reset();
  $('itemTitle').textContent = it ? 'Ubah' : 'Tambah ke ' + tab;
  $('btnDelete').style.display = it ? '' : 'none';
  $('nkOnly').style.display = tab === NASI ? '' : 'none';
  if (it) {
    for (const k of ['vendor', 'menu', 'qty', 'harga', 'dibayar', 'status', 'pic', 'kontak', 'catatan']) f.elements[k].value = it[k];
    if (tab === NASI) {
      f.elements.desa.value = it.desa || '';
      f.elements.lokasi.value = it.lokasi || '';
      for (const [k] of CEK) f.elements['cek_' + k].checked = !!(it.cek && it.cek[k]);
    }
  }
  $('dlgItem').showModal();
}

function openTarget() {
  const t = state.target[tab];
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
  const data = {
    kategori: tab,
    vendor: f.vendor.value.trim(),
    menu: f.menu.value.trim(),
    qty: +f.qty.value,
    harga: +f.harga.value,
    dibayar: +f.dibayar.value || 0,
    status: f.status.value,
    pic: f.pic.value.trim(),
    kontak: f.kontak.value.trim(),
    catatan: f.catatan.value.trim(),
  };
  if (tab === NASI) {
    data.desa = f.desa.value.trim();
    data.lokasi = f.lokasi.value;
    data.cek = Object.fromEntries(CEK.map(([k]) => [k, f['cek_' + k].checked]));
  }
  const it = state.items.find((i) => i.id === editId);
  if (it) Object.assign(it, data);
  else state.items.push({ id: crypto.randomUUID(), ...data });
  save();
};

$('btnDelete').onclick = () => {
  if (!confirm('Hapus data ini?')) return;
  state.items = state.items.filter((i) => i.id !== editId);
  $('dlgItem').close();
  save();
};

$('formTarget').onsubmit = () => {
  const f = $('formTarget').elements;
  state.target[tab] = { target: +f.target.value, anggaran: +f.anggaran.value };
  save();
};

$('btnExport').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  a.download = 'konsumsi-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
};
$('btnImport').onclick = () => $('fileImport').click();
$('fileImport').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const s = JSON.parse(await file.text());
    if (!Array.isArray(s.items) || !s.target) throw 0;
    if (!confirm('Timpa data sekarang dengan file ini?')) return;
    state = s;
    save();
  } catch {
    alert('File tidak valid');
  }
};

$('filterStatus').innerHTML =
  '<option value="">Semua status</option>' + STATUS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
$('formItem').elements.status.innerHTML = STATUS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

$('formItem').elements.lokasi.innerHTML =
  '<option value="">-</option>' + LOKASI.map((l) => `<option>${l}</option>`).join('');
$('cek').insertAdjacentHTML(
  'beforeend',
  CEK.map(([k, l]) => `<label><input type="checkbox" name="cek_${k}">${l}</label>`).join('')
);

render();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
