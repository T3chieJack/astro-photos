const ascii = (u8, s, n) => { let r = ''; for (let i = 0; i < n && s + i < u8.length; i++) r += String.fromCharCode(u8[s + i]); return r; };
const utf8 = u8 => new TextDecoder('utf-8').decode(u8);

function readTiff(dv, base) {
  const out = {};
  if (base + 8 > dv.byteLength) return out;
  const le = dv.getUint16(base) === 0x4949;
  const u16 = o => dv.getUint16(base + o, le), u32 = o => dv.getUint32(base + o, le), s32 = o => dv.getInt32(base + o, le);
  const sizes = {1:1,2:1,3:2,4:4,5:8,7:1,8:2,9:4,10:8,11:4,12:8};
  const seen = new Set();
  function ifd(off, depth) {
    if (!off || depth > 3 || seen.has(off) || base + off + 2 > dv.byteLength) return;
    seen.add(off);
    const n = u16(off);
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      if (base + e + 12 > dv.byteLength) break;
      const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
      const sz = (sizes[type] || 1) * cnt;
      const vo = sz <= 4 ? e + 8 : u32(e + 8);
      if (base + vo + sz > dv.byteLength) continue;
      let v;
      if (type === 2) {
        const bytes = new Uint8Array(dv.buffer, dv.byteOffset + base + vo, cnt);
        let end = bytes.indexOf(0); if (end < 0) end = cnt;
        v = utf8(bytes.subarray(0, end)).trim();
      } else if (type === 3) v = cnt === 1 ? u16(vo) : Array.from({length: cnt}, (_, k) => u16(vo + k * 2));
      else if (type === 4) v = u32(vo);
      else if (type === 9) v = s32(vo);
      else if (type === 8) v = dv.getInt16(base + vo, le);
      else if (type === 11) v = dv.getFloat32(base + vo, le);
      else if (type === 12) v = dv.getFloat64(base + vo, le);
      else if (type === 5 || type === 10) {
        const a = type === 5 ? u32(vo) : s32(vo), b = type === 5 ? u32(vo + 4) : s32(vo + 4);
        v = b ? a / b : 0;
      } else v = new Uint8Array(dv.buffer, dv.byteOffset + base + vo, cnt);
      out[tag] = v;
      if (tag === 0x8769) ifd(v, depth + 1);
    }
  }
  ifd(u32(4), 0);
  return out;
}

function readIptc(u8, s, e) {
  const out = {};
  for (let i = s; i < e - 5; i++) {
    if (u8[i] === 0x1C && u8[i + 1] === 0x02) {
      const ds = u8[i + 2], len = (u8[i + 3] << 8) | u8[i + 4];
      if (len > 0 && len < 2000 && i + 5 + len <= e) {
        if (!(ds in out)) out[ds] = utf8(u8.subarray(i + 5, i + 5 + len)).trim();
        i += 4 + len;
      }
    }
  }
  return out;
}

function extractRaw(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  const raw = {tiff: null, xmp: '', iptc: {}, text: {}};
  if (u8[0] === 0xFF && u8[1] === 0xD8) {
    let p = 2;
    while (p + 4 < u8.length) {
      if (u8[p] !== 0xFF) { p++; continue; }
      const m = u8[p + 1];
      if (m === 0xD9 || m === 0xDA) break;
      if (m === 0xFF) { p++; continue; }
      if ((m >= 0xD0 && m <= 0xD7) || m === 0x01) { p += 2; continue; }
      const len = dv.getUint16(p + 2), s = p + 4, end = Math.min(p + 2 + len, u8.length);
      if (m === 0xE1) {
        const hdr = ascii(u8, s, 6);
        if (hdr === 'Exif\0\0' && !raw.tiff) raw.tiff = readTiff(dv, s + 6);
        else {
          const str = utf8(u8.subarray(s, end));
          const i = str.indexOf('<x:xmpmeta');
          if (i >= 0) raw.xmp += str.slice(i);
        }
      } else if (m === 0xED) {
        Object.assign(raw.iptc, readIptc(u8, s, end));
      }
      p += 2 + len;
    }
  } else if (u8[0] === 0x89 && ascii(u8, 1, 3) === 'PNG') {
    let p = 8;
    while (p + 12 <= u8.length) {
      const L = dv.getUint32(p), t = ascii(u8, p + 4, 4), d = p + 8;
      if (d + L > u8.length) break;
      const seg = u8.subarray(d, d + L);
      if (t === 'eXIf') {
        let off = d; if (ascii(u8, d, 6) === 'Exif\0\0') off += 6;
        raw.tiff = readTiff(dv, off);
      } else if (t === 'iTXt' || t === 'tEXt') {
        const k = seg.indexOf(0);
        if (k > 0) {
          const key = ascii(seg, 0, k);
          let val = '';
          if (t === 'tEXt') val = utf8(seg.subarray(k + 1));
          else if (seg[k + 1] === 0) {
            let q = k + 3; q = seg.indexOf(0, q) + 1; q = seg.indexOf(0, q) + 1;
            if (q > 0) val = utf8(seg.subarray(q));
          }
          if (key === 'XML:com.adobe.xmp') raw.xmp += val; else if (val) raw.text[key] = val.trim();
        }
      }
      if (t === 'IEND') break;
      p += 12 + L;
    }
  } else if (ascii(u8, 0, 4) === 'RIFF' && ascii(u8, 8, 4) === 'WEBP') {
    let p = 12;
    while (p + 8 <= u8.length) {
      const t = ascii(u8, p, 4), size = dv.getUint32(p + 4, true), d = p + 8;
      if (t === 'EXIF') { let off = d; if (ascii(u8, d, 6) === 'Exif\0\0') off += 6; raw.tiff = readTiff(dv, off); }
      else if (t === 'XMP ') raw.xmp += utf8(u8.subarray(d, d + size));
      p += 8 + size + (size & 1);
    }
  }
  raw.tiff = raw.tiff || {};
  return raw;
}

const ENT = {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&#39;':"'"};
const decodeEnt = s => s.replace(/&(amp|lt|gt|quot|apos|#39);/g, m => ENT[m]).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
function xget(xmp, name) {
  if (!xmp) return '';
  const a = xmp.match(new RegExp(name + '="([^"]*)"'));
  if (a && a[1].trim()) return decodeEnt(a[1].trim());
  const e = xmp.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>'));
  if (!e) return '';
  let inner = e[1];
  const li = inner.match(/<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/);
  if (li) inner = li[1];
  return decodeEnt(inner.replace(/<[^>]+>/g, '').trim());
}
function xall(xmp, name) {
  const out = [];
  if (!xmp) return out;
  for (const m of xmp.matchAll(new RegExp(name + '="([^"]*)"', 'g'))) out.push(decodeEnt(m[1]));
  for (const m of xmp.matchAll(new RegExp('<' + name + '>([^<]*)</' + name + '>', 'g'))) out.push(decodeEnt(m[1]));
  return out;
}

function parseExifDate(s) {
  const m = /^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s || '');
  if (!m || m[1] === '0000') return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  return isNaN(d) ? null : d;
}
function parseXmpDate(s) {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) return parseExifDate(s);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-'); return new Date(+y, m - 1, +d); }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}
function decodeXP(v) {
  if (!(v instanceof Uint8Array)) return '';
  return new TextDecoder('utf-16le').decode(v).replace(/\0+$/, '').trim();
}

const GENERIC = /^(sony dsc|olympus digital camera|digital camera|default|untitled|image|picture|samsung|lg|dsc|camera|\s*)$/i;
const EDITORS = /photoshop|lightroom|camera raw|gimp|affinity|pixinsight|siril|deepskystacker|astro ?pixel ?processor|startools|graxpert|sequator|registax|autostakkert|pixelmator|snapseed|darktable|rawtherapee|capture one/i;

function catalogFromName(name) {
  const m = name.match(/\b(M\s?\d{1,3}|NGC\s?\d{1,4}|IC\s?\d{1,4}|Sh2[-\s]?\d{1,3}|C\s?\d{1,3}|Caldwell\s?\d{1,3})\b/i);
  return m ? m[1].replace(/\s+/, ' ').toUpperCase().replace(/^M (\d)/, 'M$1') : '';
}
function nameToSubject(name) {
  const cat = catalogFromName(name.replace(/_/g, ' '));
  if (cat) return cat;
  return name.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function nameToDate(name) {
  const m = name.match(/(20\d{2})[\-_]?(\d{2})[\-_]?(\d{2})[\-_T ]?(\d{2})[\-_:]?(\d{2})[\-_:]?(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return isNaN(d) || +m[2] > 12 ? null : d;
}

function buildMeta(raw, fileName, fileModified) {
  const t = raw.tiff, x = raw.xmp, ip = raw.iptc, tx = raw.text;
  const meta = {warnings: []};

  const subj = [
    [xget(x, 'dc:title'), 'title'],
    [ip[5], 'Photoshop title'],
    [decodeXP(t[0x9C9B]), 'Windows title'],
    [t[0x010E], 'description'],
    [tx.Title, 'title'],
    [ip[120], 'Photoshop caption'],
    [xget(x, 'dc:description'), 'description'],
    [tx.Description, 'description'],
    [decodeXP(t[0x9C9F]), 'Windows subject'],
  ].find(([v]) => v && !GENERIC.test(v));
  if (subj) { meta.subject = subj[0]; meta.subjectSrc = subj[1]; }
  else { meta.subject = nameToSubject(fileName); meta.subjectSrc = 'file name'; meta.warnings.push('No title in metadata, subject taken from the file name'); }

  const software = new Set();
  [t[0x0131], xget(x, 'xmp:CreatorTool'), tx.Software, ...xall(x, 'stEvt:softwareAgent')].forEach(s => { if (s && typeof s === 'string') software.add(s.trim()); });
  meta.software = [...software];
  const editors = meta.software.filter(s => EDITORS.test(s));
  meta.photoshop = editors.some(s => /photoshop/i.test(s));
  meta.editors = [...new Set(editors.map(s => {
    const m = s.match(EDITORS); return m ? m[0].replace(/^./, c => c.toUpperCase()).replace(/^Deepskystacker$/i, 'DeepSkyStacker').replace(/^Pixinsight$/i, 'PixInsight').replace(/^Gimp$/i, 'GIMP') : s;
  }))];

  const dates = [
    [parseExifDate(t[0x9003]), 'capture time (EXIF)', false],
    [parseXmpDate(xget(x, 'exif:DateTimeOriginal')), 'capture time (XMP)', false],
    [parseXmpDate(xget(x, 'photoshop:DateCreated')), 'Photoshop "date created"', false],
    [parseExifDate(t[0x9004]), 'digitised time', false],
    [parseXmpDate(xget(x, 'xmp:CreateDate')), 'XMP create date', false],
    [nameToDate(fileName), 'file name', true],
    [parseExifDate(t[0x0132]), 'last modified time in metadata', true],
    [parseXmpDate(tx['Creation Time']), 'PNG creation time', true],
    [fileModified ? new Date(fileModified) : null, 'file date on disk', true],
  ].find(([d]) => d);
  if (dates) {
    meta.date = dates[0]; meta.dateSrc = dates[1];
    if (dates[2]) meta.warnings.push('No original capture time found, date came from the ' + dates[1] + '. Please check it.');
  }
  if (meta.photoshop && meta.dateSrc && !/capture/.test(meta.dateSrc)) meta.warnings.push('Photoshop has been used on this file, so the date may be when it was edited rather than shot.');

  const make = (t[0x010F] || xget(x, 'tiff:Make') || '').trim();
  const model = (t[0x0110] || xget(x, 'tiff:Model') || '').trim();
  meta.camera = model ? (make && !model.toLowerCase().startsWith(make.split(' ')[0].toLowerCase()) ? make + ' ' + model : model) : make;
  meta.smart = /seestar|dwarf|vaonis|stellina|vespera|evscope|unistellar|origin/i.test(meta.camera + ' ' + meta.software.join(' '));
  meta.lens = t[0xA434] || xget(x, 'aux:Lens') || xget(x, 'exifEX:LensModel') || '';
  const num = v => typeof v === 'number' && isFinite(v) ? v : 0;
  meta.focal = num(t[0x920A]);
  meta.fnum = num(t[0x829D]);
  meta.exposure = num(t[0x829A]);
  const iso = t[0x8827]; meta.iso = num(Array.isArray(iso) ? iso[0] : iso);
  return meta;
}
