const PAPERS = [
  {id: '6x4',    name: '6 × 4 in',  w: 152.4, h: 101.6},
  {id: '7x5',    name: '7 × 5 in',  w: 177.8, h: 127},
  {id: '10x8',   name: '10 × 8 in', w: 254,   h: 203.2},
  {id: 'a6',     name: 'A6',        w: 148,   h: 105},
  {id: 'a5',     name: 'A5',        w: 210,   h: 148},
  {id: 'a4',     name: 'A4',        w: 297,   h: 210},
  {id: 'letter', name: 'US Letter', w: 279.4, h: 215.9},
];
const PREVIEW_MAX_PX = 2400;
const FACES = {
  sans:  {family: 'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', bold: 600, regular: 400},
  serif: {family: 'Georgia, "Times New Roman", serif', bold: 700, regular: 400},
  mono:  {family: 'ui-monospace, Consolas, Menlo, monospace', bold: 700, regular: 400},
};

const $ = id => document.getElementById(id);
const cv = $('preview');
const S = {img: null, file: null, meta: null, rot: 0, panX: 0, panY: 0, maxOffX: 0, maxOffY: 0};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} },
};

const SETTINGS_KEY = 'astroPrint.settings';
const SETTING_IDS = ['paper', 'orient', 'dpi', 'fit', 'corner', 'face', 'tone', 'backing', 'pt', 'mm', 'procTag', 'pause', 'dry', 'skipChecklist'];

function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(store.get(SETTINGS_KEY)) || {}; } catch {}
  SETTING_IDS.forEach(id => {
    if (!(id in saved)) return;
    const el = $(id);
    if (el.type === 'checkbox') el.checked = !!saved[id];
    else if (el.tagName !== 'SELECT' || [...el.options].some(o => o.value === saved[id])) el.value = saved[id];
  });
}
function saveSettings() {
  const out = {};
  SETTING_IDS.forEach(id => { const el = $(id); out[id] = el.type === 'checkbox' ? el.checked : el.value; });
  store.set(SETTINGS_KEY, JSON.stringify(out));
}

function fmtExposure(s) {
  if (!s) return '';
  if (s >= 1) return (Math.round(s * 10) / 10) + 's';
  return '1/' + Math.round(1 / s) + 's';
}
function fmtDate(d) {
  if (!d) return '';
  const hasTime = d.getHours() || d.getMinutes() || d.getSeconds();
  const opts = {day: 'numeric', month: 'short', year: 'numeric'};
  return hasTime
    ? d.toLocaleString(undefined, {...opts, hour: 'numeric', minute: '2-digit'})
    : d.toLocaleDateString(undefined, opts);
}
const fmtMm = n => String(Math.round(n * 10) / 10);
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c])); }

function paper() { return PAPERS.find(p => p.id === $('paper').value) || PAPERS[0]; }
function sheetMm() {
  const p = paper();
  return $('orient').value === 'portrait' ? {w: p.h, h: p.w} : {w: p.w, h: p.h};
}
function sheetPx(dpi) {
  const {w, h} = sheetMm();
  return {W: Math.round(w / 25.4 * dpi), H: Math.round(h / 25.4 * dpi)};
}
function previewDpi() {
  const {w, h} = sheetMm();
  return Math.min(+$('dpi').value, PREVIEW_MAX_PX / (Math.max(w, h) / 25.4));
}

function applyPaper() {
  const {w, h} = sheetMm();
  const dpi = +$('dpi').value, {W, H} = sheetPx(dpi);
  document.documentElement.style.setProperty('--sheet-ar', w / h);
  $('pageStyle').textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`;
  $('printSheet').style.width = w + 'mm';
  $('printSheet').style.height = h + 'mm';
  $('info').textContent = `${W} × ${H} px (${fmtMm(w)} × ${fmtMm(h)} mm)`;
}

function buildMethod() {
  const m = S.meta || {};
  const parts = [];
  if ($('preset').value) parts.push($('preset').value);
  if (m.camera) parts.push(m.camera);
  if (m.lens && m.lens.trim()) parts.push(m.lens);
  if (m.focal) parts.push(Math.round(m.focal) + 'mm');
  if (m.fnum) parts.push('f/' + (Math.round(m.fnum * 10) / 10));
  if (m.exposure) parts.push(fmtExposure(m.exposure));
  if (m.iso) parts.push('ISO ' + m.iso);
  if ($('procTag').checked && m.editors && m.editors.length) parts.push('processed in ' + m.editors.join(', '));
  $('method').value = parts.join(' · ');
}

function showMeta() {
  const m = S.meta;
  const row = (k, v) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`;
  let h = row('Size', `${S.img.naturalWidth} × ${S.img.naturalHeight}`);
  if (m.camera) h += row('Camera', m.camera);
  if (m.editors.length) h += row('Software', m.editors.join(', '));
  h += row('Subject', 'from ' + m.subjectSrc);
  h += row('Date', m.dateSrc ? 'from ' + m.dateSrc : 'not found');
  m.warnings.forEach(w => h += `<tr class="warn"><td colspan="2">${esc(w)}</td></tr>`);
  $('metaBox').innerHTML = h;
  $('metaBox').hidden = false;
}

function notice(msg) {
  $('notice').textContent = msg || '';
  $('notice').hidden = !msg;
}

async function loadFile(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    notice('Unsupported file type. Use JPG, PNG or WebP.');
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch { URL.revokeObjectURL(url); notice('Couldn\'t read that image.'); return; }
  if (S.img) URL.revokeObjectURL(S.img.src);
  notice('');

  Object.assign(S, {img, file, rot: 0, panX: 0, panY: 0});
  setZoom(100);

  let raw = {tiff: {}, xmp: '', iptc: {}, text: {}};
  try { raw = extractRaw(await file.arrayBuffer()); } catch (e) { console.warn(e); }
  S.meta = buildMeta(raw, file.name, file.lastModified);

  $('subject').value = S.meta.subject || '';
  $('date').value = fmtDate(S.meta.date);
  $('preset').value = S.meta.smart ? 'Smart telescope' : '';
  buildMethod();
  showMeta();

  $('fileName').textContent = file.name;
  $('fileName').classList.remove('muted');
  $('empty').hidden = true;
  $('exportBtn').disabled = false;
  updatePrintBtn();
  render();
}

function render(target, dpi) {
  dpi = dpi || previewDpi();
  const c = target || cv;
  const {W, H} = sheetPx(dpi);
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  if (!S.img) return c;

  const iw0 = S.img.naturalWidth, ih0 = S.img.naturalHeight;
  const sideways = S.rot % 180 !== 0;
  const iw = sideways ? ih0 : iw0, ih = sideways ? iw0 : ih0;
  const base = $('fit').value === 'fill' ? Math.max(W / iw, H / ih) : Math.min(W / iw, H / ih);
  const sc = base * (+$('zoom').value / 100);
  S.maxOffX = Math.max(0, (iw * sc - W) / 2);
  S.maxOffY = Math.max(0, (ih * sc - H) / 2);
  const cx = W / 2 + S.panX / 100 * S.maxOffX, cy = H / 2 + S.panY / 100 * S.maxOffY;

  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.save();
  g.translate(cx, cy);
  g.rotate(S.rot * Math.PI / 180);
  g.drawImage(S.img, -iw0 * sc / 2, -ih0 * sc / 2, iw0 * sc, ih0 * sc);
  g.restore();
  drawCaption(g, W, H, dpi);
  return c;
}

function fitText(g, text, maxW) {
  if (g.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

function drawCaption(g, W, H, dpi) {
  const face = FACES[$('face').value] || FACES.sans;
  const px = +$('pt').value / 72 * dpi;
  const margin = +$('mm').value / 25.4 * dpi;
  const corner = $('corner').value;
  const atTop = corner[0] === 't', atRight = corner[1] === 'r';

  const lines = [];
  const add = (show, id, weight, alpha) => {
    const t = $(id).value.trim();
    if ($(show).checked && t) lines.push({t, w: weight, a: alpha});
  };
  add('showSubject', 'subject', face.bold, 1);
  add('showDate', 'date', face.regular, .82);
  add('showMethod', 'method', face.regular, .82);
  if (!lines.length) return;

  const lh = px * 1.32;
  let widest = 0;
  lines.forEach(l => {
    g.font = `${l.w} ${px}px ${face.family}`;
    l.t = fitText(g, l.t, W * 0.62);
    widest = Math.max(widest, g.measureText(l.t).width);
  });

  const blockH = lines.length * lh;
  const top = atTop ? margin - px * 0.3 : H - margin - blockH;
  const x = atRight ? W - margin : margin;
  const dark = $('tone').value === 'dark';

  if ($('backing').value === 'soft') {
    const pad = px * 0.55;
    g.fillStyle = dark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.42)';
    g.beginPath();
    g.roundRect(atRight ? x - widest - pad : x - pad, top - pad * 0.8, widest + pad * 2, blockH + pad * 1.4, px * 0.45);
    g.fill();
  }

  g.textAlign = atRight ? 'right' : 'left';
  g.textBaseline = 'alphabetic';
  lines.forEach((l, i) => {
    g.font = `${l.w} ${px}px ${face.family}`;
    g.fillStyle = dark ? `rgba(17,19,24,${l.a})` : `rgba(255,255,255,${l.a})`;
    g.fillText(l.t, x, top + (i + 1) * lh - px * 0.18);
  });
}

let raf = 0;
function queue() { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => render()); }

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

async function finalPng() {
  const dpi = +$('dpi').value;
  const c = render(document.createElement('canvas'), dpi);
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const buf = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const ch = new Uint8Array(21), dv = new DataView(ch.buffer);
  dv.setUint32(0, 9);
  ch.set([0x70, 0x48, 0x59, 0x73], 4);
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  ch[16] = 1;
  dv.setUint32(17, crc32(ch.subarray(4, 17)));

  const out = new Uint8Array(buf.length + 21);
  out.set(buf.subarray(0, 33));
  out.set(ch, 33);
  out.set(buf.subarray(33), 54);
  return new Blob([out], {type: 'image/png'});
}

function fileBase() {
  const s = ($('subject').value || 'astro').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_').slice(0, 60) || 'astro';
  return `${s}_${paper().id}_${$('dpi').value}dpi`;
}

$('exportBtn').onclick = async () => {
  $('exportBtn').disabled = true;
  try {
    const blob = await finalPng();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileBase() + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } finally {
    $('exportBtn').disabled = !S.img;
  }
};

const LOCK_KEY = 'astroPrint.lockUntil';
let lockTimer = 0, printing = false;

const lockUntil = () => +store.get(LOCK_KEY) || 0;
const setLock = v => store.set(LOCK_KEY, v || null);
const isLocked = () => printing || lockUntil() > Date.now();
function updatePrintBtn() { $('printBtn').disabled = !S.img || isLocked(); }

function tickLock() {
  clearInterval(lockTimer);
  const step = () => {
    const left = Math.ceil((lockUntil() - Date.now()) / 1000);
    if (left > 0) {
      $('lockMsg').textContent = `Next print in ${left} s`;
      $('lock').hidden = false;
    } else {
      setLock(0);
      $('lock').hidden = true;
      clearInterval(lockTimer);
    }
    updatePrintBtn();
  };
  step();
  if (lockUntil()) lockTimer = setInterval(step, 500);
}
$('unlock').onclick = () => { setLock(0); tickLock(); };

function showChecklist() {
  const {w, h} = sheetMm();
  const p = paper();
  const rows = [
    ['Paper size', `${p.name} (${fmtMm(Math.max(w, h))} × ${fmtMm(Math.min(w, h))} mm)`],
    ['Orientation', $('orient').value === 'portrait' ? 'Portrait' : 'Landscape'],
    ['Scale', '100%'],
    ['Margins', 'None (borderless)'],
    ['Quality', 'Best'],
  ];
  $('checklist').innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');
  $('modal').hidden = false;
  $('goPrint').focus();
}
const closeChecklist = () => { $('modal').hidden = true; };

async function doPrint() {
  if (isLocked() || !S.img) return;
  printing = true;
  updatePrintBtn();
  try {
    const blob = await finalPng();
    const sheet = $('printSheet');
    const old = sheet.querySelector('img');
    if (old) URL.revokeObjectURL(old.src);
    const img = new Image();
    img.alt = '';
    img.src = URL.createObjectURL(blob);
    await img.decode();
    sheet.replaceChildren(img);
    if ($('pause').checked) setLock(Date.now() + +$('dry').value * 1000);
  } finally {
    printing = false;
  }
  tickLock();
  setTimeout(() => window.print(), 50);
}

$('printBtn').onclick = () => {
  if (isLocked() || !S.img) return;
  $('skipChecklist').checked ? doPrint() : showChecklist();
};
$('cancelPrint').onclick = closeChecklist;
$('goPrint').onclick = () => { closeChecklist(); saveSettings(); doPrint(); };
$('modal').addEventListener('click', e => { if (e.target === $('modal')) closeChecklist(); });

window.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('modal').hidden) closeChecklist();

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    if (!$('printBtn').disabled) $('printBtn').click();
  }
});

$('paper').innerHTML = PAPERS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

const openPicker = () => $('file').click();
$('open').onclick = openPicker;
$('empty').onclick = openPicker;
$('file').onchange = e => { loadFile(e.target.files[0]); e.target.value = ''; };

let dragDepth = 0;
document.addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('sheet').classList.add('drag-over'); });
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('sheet').classList.remove('drag-over'); } });
document.addEventListener('drop', e => {
  e.preventDefault();
  dragDepth = 0;
  $('sheet').classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (!files.length) return;
  loadFile(files[0]).then(() => { if (files.length > 1) notice('Only the first file was used.'); });
});

function setZoom(z) { $('zoom').value = z; syncOutputs(); }
function syncOutputs() {
  $('ptVal').textContent = $('pt').value + ' pt';
  $('mmVal').textContent = $('mm').value + ' mm';
  $('zoomVal').textContent = $('zoom').value + '%';
  $('dryVal').textContent = $('dry').value + ' s';
  $('pauseField').hidden = !$('pause').checked;
}

['subject', 'date', 'method'].forEach(id => $(id).addEventListener('input', queue));
['showSubject', 'showDate', 'showMethod', 'tone', 'backing', 'fit', 'corner', 'face'].forEach(id => $(id).addEventListener('change', queue));
['paper', 'orient', 'dpi'].forEach(id => $(id).addEventListener('change', () => { S.panX = S.panY = 0; applyPaper(); queue(); }));
['preset', 'procTag'].forEach(id => $(id).addEventListener('change', () => { buildMethod(); queue(); }));
['pt', 'mm', 'zoom'].forEach(id => $(id).addEventListener('input', () => { syncOutputs(); queue(); }));
['dry', 'pause'].forEach(id => $(id).addEventListener('input', syncOutputs));
$('controls').addEventListener('change', saveSettings);

$('rotate').onclick = () => { S.rot = (S.rot + 90) % 360; S.panX = S.panY = 0; queue(); };
$('recenter').onclick = () => { S.panX = S.panY = 0; setZoom(100); queue(); };

let drag = null;
cv.addEventListener('pointerdown', e => {
  if (!S.img) return;
  drag = {x: e.clientX, y: e.clientY};
  cv.setPointerCapture(e.pointerId);
  cv.classList.add('dragging');
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const k = cv.width / cv.getBoundingClientRect().width;
  const dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k;
  drag = {x: e.clientX, y: e.clientY};
  if (S.maxOffX) S.panX = Math.max(-100, Math.min(100, S.panX + dx / S.maxOffX * 100));
  if (S.maxOffY) S.panY = Math.max(-100, Math.min(100, S.panY + dy / S.maxOffY * 100));
  queue();
});
['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { drag = null; cv.classList.remove('dragging'); }));
cv.addEventListener('wheel', e => {
  if (!S.img) return;
  e.preventDefault();
  setZoom(Math.max(100, Math.min(400, +$('zoom').value - Math.sign(e.deltaY) * 8)));
  queue();
}, {passive: false});

loadSettings();
syncOutputs();
applyPaper();
render();
tickLock();
