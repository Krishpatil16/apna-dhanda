// Apna Dhanda v10.7 — tiny text-PDF reader (self-hosted, no library). Reads the text of PDFs made on a computer/phone (Word, Excel,
// Google Docs, Chrome "Save as PDF", billing software). A scanned/photo PDF has no text inside — the caller shows an honest message.
(function(G){
  const latin = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  const bytes = s => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; };
  // tolerant inflate: keeps what was decoded even when the stream ends with junk bytes (common in real PDFs)
  async function inflate(u8){
    for (const fmt of ["deflate", "deflate-raw"]) {
      const parts = []; let n = 0;
      try { const rd = new Blob([u8]).stream().pipeThrough(new DecompressionStream(fmt)).getReader();
        for (;;) { const {done, value} = await rd.read(); if (done) break; parts.push(value); n += value.length; } }
      catch (e) { if (!n) continue; }
      const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out;
    }
    return null; }
  function dictEnd(s, i){ let d = 0; for (; i < s.length - 1; i++) { if (s[i] === "<" && s[i + 1] === "<") { d++; i++; } else if (s[i] === ">" && s[i + 1] === ">") { d--; i++; if (!d) return i + 1; } } return -1; }
  async function objects(s){
    const objs = {}; const re = /(\d+)\s+(\d+)\s+obj\b/g; let m;
    while ((m = re.exec(s))) {
      let i = m.index + m[0].length; while (/\s/.test(s[i])) i++;
      let dict = "", stream = null;
      if (s.startsWith("<<", i)) { const e = dictEnd(s, i); if (e < 0) continue; dict = s.slice(i, e); i = e; while (/\s/.test(s[i])) i++;
        if (s.startsWith("stream", i)) { i += 6; if (s[i] === "\r") i++; if (s[i] === "\n") i++; let end = s.indexOf("endstream", i); if (end < 0) continue;
          const L = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict); let stop = L && /^\s*endstream/.test(s.slice(i + +L[1], i + +L[1] + 12)) ? i + +L[1] : end;
          if (stop === end) { if (s[stop - 1] === "\n") stop--; if (s[stop - 1] === "\r") stop--; }
          let raw = bytes(s.slice(i, stop)); if (/\/FlateDecode/.test(dict)) raw = await inflate(raw) || new Uint8Array(); else if (/\/Filter/.test(dict)) raw = null; stream = raw ? latin(raw) : null; re.lastIndex = end; } }
      else { const e = s.indexOf("endobj", i); dict = s.slice(i, e < 0 ? i + 200 : e); }
      objs[m[1]] = {dict, stream};
    }
    // objects packed inside object streams (PDF 1.5+)
    for (const o of Object.values(objs)) if (/\/Type\s*\/ObjStm/.test(o.dict) && o.stream) {
      const n = +(/\/N\s+(\d+)/.exec(o.dict) || [])[1], first = +(/\/First\s+(\d+)/.exec(o.dict) || [])[1]; if (!n) continue;
      const head = o.stream.slice(0, first).trim().split(/\s+/).map(Number);
      for (let k = 0; k < n; k++) { const num = head[2 * k], off = head[2 * k + 1], next = k + 1 < n ? head[2 * k + 3] : o.stream.length - first;
        if (!objs[num]) objs[num] = {dict: o.stream.slice(first + off, first + next), stream: null}; }
    }
    return objs;
  }
  function hexBytes(h){ h = h.replace(/[^0-9a-f]/gi, ""); if (h.length % 2) h += "0"; const out = []; for (let i = 0; i < h.length; i += 2) out.push(parseInt(h.slice(i, i + 2), 16)); return out; }
  function cmapOf(text){
    const map = new Map(); let width = 1;
    const cs = /begincodespacerange\s*<([0-9a-f]+)>/i.exec(text); if (cs) width = Math.max(1, cs[1].length / 2);
    const u16 = h => { const b = hexBytes(h); let s = ""; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]); return s; };
    for (const blk of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const m of blk[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) map.set(parseInt(m[1], 16), u16(m[2]));
    for (const blk of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const m of blk[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<([0-9a-f]+)>|\[([^\]]*)\])/gi)) {
      const a = parseInt(m[1], 16), b = parseInt(m[2], 16);
      if (m[4]) { const base = u16(m[4]); for (let c = a; c <= b && c - a < 65536; c++) map.set(c, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + (c - a))); }
      else { const list = [...m[5].matchAll(/<([0-9a-f]+)>/gi)].map(x => u16(x[1])); list.forEach((v, k) => map.set(a + k, v)); } }
    return {map, width};
  }
  const ref = (d, key) => { const m = new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`).exec(d); return m ? m[1] : null; };
  function fontsOf(objs, resDict){
    // resource name → cmap, from a /Font << /F1 5 0 R >> dictionary (inline or referenced)
    let fd = ""; const inl = /\/Font\s*<<([\s\S]*?)>>/.exec(resDict); if (inl) fd = inl[1]; else { const r = ref(resDict, "Font"); if (r && objs[r]) fd = objs[r].dict; }
    const out = {};
    for (const m of fd.matchAll(/\/([^\s\/<>\[\]]+)\s+(\d+)\s+0\s+R/g)) { const f = objs[m[2]]; if (!f) continue; const tu = ref(f.dict, "ToUnicode");
      out[m[1]] = tu && objs[tu] && objs[tu].stream ? cmapOf(objs[tu].stream) : null; }
    return out;
  }
  function decodeStr(raw, font){
    if (!font) return raw.replace(/[\x00-\x08\x0e-\x1f]/g, "");
    let s = ""; const w = font.width;
    for (let i = 0; i + w - 1 < raw.length; i += w) { let c = 0; for (let k = 0; k < w; k++) c = (c << 8) | raw.charCodeAt(i + k); s += font.map.has(c) ? font.map.get(c) : (w === 1 ? String.fromCharCode(c) : ""); }
    return s;
  }
  function readLiteral(s, i){ let d = 1, out = ""; i++;
    for (; i < s.length && d; i++) { const c = s[i];
      if (c === "\\") { const n = s[++i]; const E = {n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\"};
        if (n in E) out += E[n]; else if (/[0-7]/.test(n)) { let o = n; while (o.length < 3 && /[0-7]/.test(s[i + 1])) o += s[++i]; out += String.fromCharCode(parseInt(o, 8) & 255); } else if (n === "\r" || n === "\n") { if (n === "\r" && s[i + 1] === "\n") i++; } else out += n; }
      else if (c === "(") { d++; out += c; } else if (c === ")") { d--; if (d) out += c; } else out += c; }
    return [out, i]; }
  function runContent(cs, fonts, out){
    let font = null, fs = 12, stack = [], line = "", lastY = null, endX = null, curX = 0, lmX = 0, lmY = 0;
    const flush = () => { if (line.trim()) out.push(line.replace(/\s+/g, " ").trim()); line = ""; };
    const place = (x, y) => { // same baseline → same line; a real gap → a space
      if (lastY == null || Math.abs(y - lastY) > fs * 0.5) { flush(); endX = null; }
      else if (endX != null && x - endX > fs * 0.2 && line && !line.endsWith(" ")) line += " ";
      lastY = y; curX = x; };
    const show = (txt, adv) => { line += txt; endX = curX + adv; curX = endX; };
    let i = 0;
    while (i < cs.length) {
      const c = cs[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === "%") { while (i < cs.length && cs[i] !== "\n" && cs[i] !== "\r") i++; continue; }
      if (c === "(") { const [v, j] = readLiteral(cs, i); stack.push({str: v}); i = j; continue; }
      if (c === "<" && cs[i + 1] !== "<") { const j = cs.indexOf(">", i); stack.push({str: String.fromCharCode(...hexBytes(cs.slice(i + 1, j)))}); i = j + 1; continue; }
      if (c === "<" && cs[i + 1] === "<") { const j = dictEnd(cs, i); i = j < 0 ? cs.length : j; continue; }
      if (c === "[") { stack.push({arr: true}); i++; continue; }
      if (c === "]") { const arr = []; while (stack.length && !stack[stack.length - 1].arr) arr.unshift(stack.pop()); stack.pop(); stack.push({list: arr}); i++; continue; }
      if (c === "/") { let j = i + 1; while (j < cs.length && !/[\s\/\[\]<>()]/.test(cs[j])) j++; stack.push({name: cs.slice(i + 1, j)}); i = j; continue; }
      let j = i; while (j < cs.length && !/[\s\/\[\]<>()%]/.test(cs[j])) j++; const tok = cs.slice(i, j) || cs[i]; i = j > i ? j : i + 1;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) { stack.push({num: Number(tok)}); continue; }
      const nums = stack.filter(x => "num" in x).map(x => x.num);
      switch (tok) {
        case "Tf": { const n = stack.find(x => "name" in x); font = n ? fonts[n.name] || null : null; if (nums.length) fs = Math.abs(nums[nums.length - 1]) || fs; break; }
        case "Td": case "TD": { lmX += nums[nums.length - 2] || 0; lmY += nums[nums.length - 1] || 0; place(lmX, lmY); break; }
        case "Tm": { lmX = nums[4] || 0; lmY = nums[5] || 0; place(lmX, lmY); break; }
        case "T*": lmY += fs * 2; place(lmX, lmY); break;
        case "Tj": case "'": case "\"": { const s = stack.filter(x => "str" in x).pop(); if (tok !== "Tj") { lmY += fs * 2; place(lmX, lmY); } if (s) { const t = decodeStr(s.str, font); show(t, t.length * fs * 0.5); } break; }
        case "TJ": { const l = stack.filter(x => "list" in x).pop(); if (l) { let t = "", adv = 0; for (const e of l.list) { if ("str" in e) { const d = decodeStr(e.str, font); t += d; adv += d.length * fs * 0.5; } else if ("num" in e) { adv -= e.num / 1000 * fs; if (e.num < -250) t += " "; } } show(t, adv); } break; }
      }
      if (/^[A-Za-z'"*]+$/.test(tok)) stack = [];
    }
    flush();
  }
  async function pdfText(buf){
    const s = latin(new Uint8Array(buf)); if (!s.startsWith("%PDF")) throw new Error("not a pdf");
    const objs = await objects(s); const out = [];
    const pages = Object.values(objs).filter(o => /\/Type\s*\/Page\b/.test(o.dict));
    for (const pg of pages) {
      let res = ""; const inl = /\/Resources\s*<</.exec(pg.dict); if (inl) { const st = pg.dict.indexOf("<<", inl.index); res = pg.dict.slice(st, dictEnd(pg.dict, st)); } else { const r = ref(pg.dict, "Resources"); if (r && objs[r]) res = objs[r].dict; }
      const fonts = fontsOf(objs, res);
      const cm = /\/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)/.exec(pg.dict); if (!cm) continue;
      const ids = [...cm[1].matchAll(/(\d+)\s+0\s+R/g)].map(x => x[1]);
      runContent(ids.map(id => (objs[id] && objs[id].stream) || "").join("\n"), fonts, out);
    }
    return out.join("\n");
  }
  G.AKPdfText = pdfText;
})(globalThis);
