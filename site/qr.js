// Tiny QR encoder (byte mode, error-correction level M, versions 1–10) + A4 poster drawn on a canvas.
// Everything happens in the browser — no external service. Loaded only when the shopkeeper taps "QR पोस्टर डाउनलोड".
(function(){
  const ECC = [-1,10,16,26,18,24,16,18,22,22,26], BLOCKS = [-1,1,1,1,2,2,4,4,4,5,5];
  const rawModules = v => { let r = (16*v + 128)*v + 64; if (v >= 2) { const n = Math.floor(v/7) + 2; r -= (25*n - 10)*n - 55; if (v >= 7) r -= 36; } return r; };
  const dataCodewords = v => Math.floor(rawModules(v)/8) - ECC[v]*BLOCKS[v];
  const gmul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; };
  function rsDivisor(deg){ const r = new Array(deg).fill(0); r[deg-1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) { for (let j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j+1]; } root = gmul(root, 2); } return r; }
  function rsRemainder(data, div){ const r = div.map(() => 0); for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => r[i] ^= gmul(c, f)); } return r; }
  function encode(text){
    const bytes = [...new TextEncoder().encode(text)]; let ver = 0;
    for (let v = 1; v <= 10; v++) if (4 + (v < 10 ? 8 : 16) + bytes.length*8 <= dataCodewords(v)*8) { ver = v; break; }
    if (!ver) throw new Error("Link too long for the QR");
    const bits = []; const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach(b => put(b, 8));
    const cap = dataCodewords(ver)*8; put(0, Math.min(4, cap - bits.length)); put(0, (8 - bits.length % 8) % 8);
    for (let p = 0xEC; bits.length < cap; p ^= 0xEC ^ 0x11) put(p, 8);
    const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i+8).join(""), 2));
    // error correction + interleave
    const nb = BLOCKS[ver], el = ECC[ver], raw = Math.floor(rawModules(ver)/8), nShort = nb - raw % nb, shortLen = Math.floor(raw/nb);
    const div = rsDivisor(el), blocks = [];
    for (let i = 0, k = 0; i < nb; i++) { const d = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1)); k += d.length; const e = rsRemainder(d, div); if (i < nShort) d.push(0); blocks.push(d.concat(e)); }
    const cw = []; for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) cw.push(b[i]); });
    // modules
    const size = ver*4 + 17, M = [...Array(size)].map(() => Array(size).fill(false)), F = [...Array(size)].map(() => Array(size).fill(false));
    const set = (x, y, d) => { M[y][x] = d; F[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (ver > 1) { const n = Math.floor(ver/7) + 2, step = Math.ceil((ver*4 + 4)/(n*2 - 2))*2, pos = [6]; for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
      pos.forEach((a, i) => pos.forEach((b, j) => { if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); })); }
    const format = mask => { const d = (0 << 3) | mask; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537); const b = ((d << 10) | r) ^ 0x5412, g = i => ((b >>> i) & 1) === 1;
      for (let i = 0; i <= 5; i++) set(8, i, g(i)); set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8)); for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i)); for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i)); set(8, size - 8, true); };
    format(0);
    if (ver >= 7) { let r = ver; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25); const b = (ver << 12) | r;
      for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) === 1, a = size - 11 + i % 3, c = Math.floor(i/3); set(a, c, bit); set(c, a, bit); } }
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) { const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!F[y][x] && i < cw.length*8) { M[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; } } }
    const maskFn = [(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,(x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
    const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!F[y][x] && maskFn[m](x, y)) M[y][x] = !M[y][x]; };
    const penalty = () => { let p = 0, dark = 0;
      for (let a = 0; a < size; a++) for (const row of [true, false]) { let run = 1; for (let b = 1; b <= size; b++) { const cur = b < size ? (row ? M[a][b] : M[b][a]) : null, prev = row ? M[a][b-1] : M[b-1][a]; if (cur === prev) run++; else { if (run >= 5) p += run - 2; run = 1; } } }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = M[y][x]; if (c === M[y][x+1] && c === M[y+1][x] && c === M[y+1][x+1]) p += 3; }
      for (const r of M) for (const c of r) if (c) dark++; return p + Math.floor(Math.abs(dark*20 - size*size*10) / (size*size)) * 10; };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { applyMask(m); format(m); const p = penalty(); if (p < bestP) { bestP = p; best = m; } applyMask(m); }
    applyMask(best); format(best);
    return {size, modules: M, version: ver};
  }
  function wrap(ctx, text, maxW){ const words = String(text).split(/\s+/); const lines = []; let cur = "";
    for (const w of words) { const t = cur ? cur + " " + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); return lines; }
  async function poster({url, name, nameEn, phone, lang}){ const EN = lang !== "hi";
    const W = 2480, H = 3508, c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
    const FONT = '"Noto Sans Devanagari","Nirmala UI","Mangal",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
    x.fillStyle = "#fbf7ee"; x.fillRect(0, 0, W, H);
    x.fillStyle = "#1f6b3a"; x.fillRect(0, 0, W, 760);
    x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
    let fs = 150; x.font = `800 ${fs}px ${FONT}`; let lines = wrap(x, name || (EN ? "My shop" : "मेरी दुकान"), W - 240);
    while (lines.length > 2 && fs > 90) { fs -= 10; x.font = `800 ${fs}px ${FONT}`; lines = wrap(x, name, W - 240); }
    lines.slice(0, 2).forEach((l, i, a) => x.fillText(l, W/2, 330 - (a.length - 1)*fs*0.6 + i*fs*1.2));
    if (nameEn && nameEn !== name) { x.font = `500 80px ${FONT}`; x.fillStyle = "#d9f2e1"; x.fillText(nameEn, W/2, 640); }
    // v10.12: English first ("Scan to order"), Hindi on the second line; Hindi first when the panel is in हिंदी
    x.fillStyle = "#1d2b22"; x.font = `800 150px ${FONT}`; x.fillText(EN ? "Scan to order" : "स्कैन करें, ऑर्डर करें", W/2, 990);
    x.font = `500 80px ${FONT}`; x.fillStyle = "#55635a"; x.fillText(EN ? "स्कैन करें · घर बैठे ऑर्डर करें" : "Scan to order · order from home", W/2, 1130);
    const q = encode(url), quiet = 4, box = 1500, mod = Math.floor(box / (q.size + quiet*2)), qs = mod*(q.size + quiet*2), ox = Math.round((W - qs)/2), oy = 1260;
    x.fillStyle = "#fff"; x.strokeStyle = "#1f6b3a"; x.lineWidth = 16; x.beginPath(); x.roundRect ? x.roundRect(ox - 40, oy - 40, qs + 80, qs + 80, 60) : x.rect(ox - 40, oy - 40, qs + 80, qs + 80); x.fill(); x.stroke();
    x.fillStyle = "#000"; for (let r = 0; r < q.size; r++) for (let k = 0; k < q.size; k++) if (q.modules[r][k]) x.fillRect(ox + (k + quiet)*mod, oy + (r + quiet)*mod, mod, mod);
    let y = oy + qs + 160; x.fillStyle = "#1d2b22"; x.font = `700 70px ${FONT}`;
    // v10.12.3: a link has no spaces, so shrink it until it fits the page (it used to run off both edges)
    { const u = url.replace(/^https?:\/\//, ""); let us = 70; x.font = `700 ${us}px ${FONT}`; while (x.measureText(u).width > W - 200 && us > 36) { us -= 2; x.font = `700 ${us}px ${FONT}`; } x.fillText(u, W/2, y); y += Math.max(90, us + 20); }
    y += 60; x.font = `600 76px ${FONT}`; x.fillStyle = "#1f6b3a";
    x.fillText(EN ? "📱 Open camera → Scan QR → Order" : "📱 कैमरा खोलें → QR स्कैन करें → ऑर्डर करें", W/2, y); y += 120;
    x.font = `500 66px ${FONT}`; x.fillStyle = "#55635a"; x.fillText(EN ? "Just your name and number · no app needed" : "बस नाम और नंबर · कोई ऐप नहीं", W/2, y); y += 110;
    if (phone) { x.font = `700 84px ${FONT}`; x.fillStyle = "#1d2b22"; x.fillText("📞 " + String(phone).replace(/(\d{5})(\d{5})/, "$1 $2"), W/2, y); }
    x.fillStyle = "#1f6b3a"; x.fillRect(0, H - 120, W, 120);
    return new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error("Could not make the poster")), "image/png"));
  }
  window.AKQR = {encode, poster};
})();
