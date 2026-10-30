// Backend PWA Konsumsi. Tempel di Apps Script yang terikat ke sheet Famgat_2026.
// Login memakai sheet Ketentuan: kolom C = User, D = Nama, E = Password, F = Role (Admin / User).
// Hanya Role Admin yang boleh hapus vendor dan kelola user/lokasi.
const ADMIN_ACTIONS = ['delete', 'users', 'userSave', 'userDelete', 'lokasiSet'];

const KAT = ['Nasi Kotak', 'Makanan', 'Minuman', 'Jajanan'];
const STATUS = { belum: 'Belum pesan', dipesan: 'Dipesan', diterima: 'Diterima' };
const CEK = ['lauk', 'buah', 'sambal', 'sayur', 'minum', 'sendok'];

// Kolom (0-based): 0 No, 1 Vendor, 2 Desa, 3 Handphone, 4 Qty_pesan, 5 Biaya, 6 Status, 7 Lokasi, 8 PIC,
// khusus Nasi Kotak: 9-14 Lauk..Sendok, 15 Check
const WIDTH = { 'Nasi Kotak': 16 };
const widthOf_ = (kat) => WIDTH[kat] || 9;

function doGet() {
  return out_({ ok: true, msg: 'konsumsi api' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const req = JSON.parse(e.postData.contents);
    const a = auth_(req);
    if (a.error) return out_({ ok: false, error: a.error });
    if (req.action === 'read') return out_({ ok: true, nama: a.nama, admin: a.admin, ...readAll_() });
    if (req.action === 'upsert') return out_({ ok: true, id: upsert_(req.item, a.nama) });
    if (req.action === 'target') {
      setTarget_(req.kategori, req.target, req.anggaran);
      return out_({ ok: true });
    }
    if (!ADMIN_ACTIONS.includes(req.action)) return out_({ ok: false, error: 'aksi tidak dikenal' });
    if (!a.admin) return out_({ ok: false, error: 'Hanya admin yang boleh' });
    if (req.action === 'delete') remove_(req.kategori, req.id);
    else if (req.action === 'users') return out_({ ok: true, users: listUsers_() });
    else if (req.action === 'userSave') saveUser_(req);
    else if (req.action === 'userDelete') deleteUser_(req.user);
    else if (req.action === 'lokasiSet') setLokasi_(req.list);
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function auth_(req) {
  const sh = SpreadsheetApp.getActive().getSheetByName('Ketentuan');
  const rows = sh.getRange(2, 3, Math.max(sh.getLastRow() - 1, 1), 4).getValues(); // C:F
  const u = String(req.user || '').trim().toLowerCase();
  for (const r of rows) {
    if (!r[0] || String(r[0]).trim().toLowerCase() !== u) continue;
    if (r[2] === '' || r[2] === null) return { error: 'Password user ini belum diisi di sheet Ketentuan' };
    if (String(r[2]) !== String(req.pass)) break;
    return { nama: r[1] || r[0], admin: isAdminRole_(r[3]) };
  }
  return { error: 'User atau password salah' };
}

const isAdminRole_ = (role) => String(role).trim().toLowerCase() === 'admin';
const sameUser_ = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const ketSheet_ = () => SpreadsheetApp.getActive().getSheetByName('Ketentuan');

// Tabel user ada di Ketentuan kolom C:F, berbagi baris dengan daftar lokasi di kolom A,
// jadi menghapus user hanya mengosongkan sel, bukan menghapus baris.
function userRows_() {
  const sh = ketSheet_();
  const n = Math.max(sh.getLastRow() - 1, 1);
  return { sh, n, rows: sh.getRange(2, 3, n, 4).getValues() };
}

function listUsers_() {
  return userRows_()
    .rows.filter((r) => r[0])
    .map((r) => ({ user: String(r[0]), nama: String(r[1]), pass: String(r[2]), role: isAdminRole_(r[3]) ? 'Admin' : 'User' }));
}

const countAdmins_ = (rows) => rows.filter((r) => r[0] && isAdminRole_(r[3])).length;

function saveUser_(u) {
  const user = String(u.user || '').trim();
  const nama = String(u.nama || '').trim();
  const pass = String(u.pass || '');
  const role = isAdminRole_(u.role) ? 'Admin' : 'User';
  if (!user || !nama || !pass) throw new Error('User, nama, dan password wajib diisi');
  const { sh, n, rows } = userRows_();
  const find = (name) => rows.findIndex((r) => r[0] && sameUser_(r[0], name));
  const old = u.oldUser ? find(u.oldUser) : -1;
  const dup = find(user);
  if (dup > -1 && dup !== old) throw new Error('User sudah ada');
  let row;
  if (old > -1) row = old + 2;
  else {
    const empty = rows.findIndex((r) => !r[0]);
    row = empty > -1 ? empty + 2 : n + 2;
  }
  // jangan sampai tidak ada admin sama sekali
  const after = rows.map((r) => r.slice());
  after[row - 2] = [user, nama, pass, role];
  if (countAdmins_(after) === 0) throw new Error('Minimal harus ada satu Admin');
  sh.getRange(row, 3, 1, 4).setValues([[user, nama, pass, role]]);
}

function deleteUser_(user) {
  const { sh, rows } = userRows_();
  const i = rows.findIndex((r) => r[0] && sameUser_(r[0], user));
  if (i === -1) return;
  const after = rows.map((r) => r.slice());
  after[i] = ['', '', '', ''];
  if (countAdmins_(after) === 0) throw new Error('Minimal harus ada satu Admin');
  sh.getRange(i + 2, 3, 1, 4).clearContent();
}

function setLokasi_(list) {
  const sh = ketSheet_();
  const clean = (list || []).map((l) => String(l).trim()).filter(String);
  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).clearContent();
  if (clean.length) sh.getRange(2, 1, clean.length, 1).setValues(clean.map((l) => [l]));
}

const statusKey_ = (label) => Object.keys(STATUS).find((k) => STATUS[k] === label) || 'belum';

function sheet_(kat) {
  const sh = SpreadsheetApp.getActive().getSheetByName(kat);
  if (!sh) throw new Error('Sheet "' + kat + '" tidak ditemukan');
  return sh;
}

function targetSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('Target');
  if (!sh) {
    sh = ss.insertSheet('Target');
    sh.appendRow(['Kategori', 'Target', 'Anggaran']);
    KAT.forEach((k) => sh.appendRow([k, 0, 0]));
  }
  return sh;
}

function rowToItem_(kat, r) {
  const it = {
    id: String(r[0]),
    kategori: kat,
    vendor: r[1],
    desa: r[2] || '',
    kontak: String(r[3] || ''),
    qty: Number(r[4]) || 0,
    biaya: Number(r[5]) || 0,
    status: statusKey_(r[6]),
    lokasi: r[7] || '',
    pic: r[8] || '',
    cek: {},
  };
  if (kat === KAT[0]) CEK.forEach((k, i) => (it.cek[k] = r[9 + i] === true));
  return it;
}

function readAll_() {
  const items = [];
  KAT.forEach((kat) => {
    const sh = sheet_(kat);
    if (sh.getLastRow() < 2) return;
    sh.getRange(2, 1, sh.getLastRow() - 1, widthOf_(kat)).getValues().forEach((r) => {
      if (r[1]) items.push(rowToItem_(kat, r));
    });
  });

  const target = Object.fromEntries(KAT.map((k) => [k, { target: 0, anggaran: 0 }]));
  targetSheet_().getDataRange().getValues().slice(1).forEach((r) => {
    if (target[r[0]]) target[r[0]] = { target: Number(r[1]) || 0, anggaran: Number(r[2]) || 0 };
  });

  const ket = SpreadsheetApp.getActive().getSheetByName('Ketentuan');
  const lokasi = ket.getRange(2, 1, Math.max(ket.getLastRow() - 1, 1), 1).getValues().map((r) => r[0]).filter(String);

  return { items, target, lokasi };
}

// "No" (kolom A) dipakai sebagai id baris.
function findRow_(sh, id) {
  if (sh.getLastRow() < 2) return 0;
  const nos = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < nos.length; i++) if (String(nos[i][0]) === String(id)) return i + 2;
  return 0;
}

function upsert_(it, nama) {
  const sh = sheet_(it.kategori);
  const w = widthOf_(it.kategori);
  let row = findRow_(sh, it.id);
  let r;
  if (row) {
    r = sh.getRange(row, 1, 1, w).getValues()[0];
  } else {
    row = sh.getLastRow() + 1;
    r = new Array(w).fill('');
    const nos = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().flat() : [];
    r[0] = Math.max(0, ...nos.map(Number).filter((n) => !isNaN(n))) + 1;
  }
  r[1] = it.vendor;
  r[2] = it.desa;
  r[3] = it.kontak;
  r[4] = it.qty;
  r[5] = it.biaya || '';
  r[6] = STATUS[it.status];
  r[7] = it.lokasi;
  r[8] = nama; // PIC = user yang login
  if (it.kategori === KAT[0]) {
    CEK.forEach((k, i) => (r[9 + i] = !!(it.cek && it.cek[k])));
    r[15] = CEK.every((k) => it.cek && it.cek[k]);
  }
  sh.getRange(row, 1, 1, w).setValues([r]);
  return String(r[0]);
}

function remove_(kat, id) {
  const sh = sheet_(kat);
  const row = findRow_(sh, id);
  if (row) sh.deleteRow(row);
}

function setTarget_(kat, target, anggaran) {
  const sh = targetSheet_();
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === kat) return sh.getRange(i + 1, 2, 1, 2).setValues([[target, anggaran]]);
  }
  sh.appendRow([kat, target, anggaran]);
}
