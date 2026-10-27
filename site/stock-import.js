// Apna Dhanda v10.7 — list import parser (runs in the browser; no library, no CDN). Turns pasted text, CSV, Excel (.xlsx) and
// text-PDF rows into preview rows {name, name_hi, name_en, size, price, mrp, stock, cat, ok, why}. Nothing is saved here — the
// shopkeeper edits/unticks the preview and confirms; only then does /admin send the rows to the server.
(function(G){
  const DEVA = "०१२३४५६७८९";
  const deva = s => String(s == null ? "" : s).replace(/[०-९]/g, d => DEVA.indexOf(d));
  const NUM = "(\\d+(?:[.,]\\d{1,2})?)";
  const UNIT = "(kgs?|kilo(?:gram)?s?|grams?|gms?|gm|gr|g|ltrs?|litres?|liters?|l|mls?|ml|pcs?|pieces?|nos|pkts?|packets?|packs?|dozen|dz|sachet|किलो|ग्राम|लीटर|ली|मिली|पैकेट|पैक|पीस|नग|दर्जन)";
  const COUNT_U = /^(pcs?|pieces?|nos|पीस|नग)$/i;
  const TOK = new RegExp([
    `(?<mrp>\\bmrp\\s*[:=\\-]?\\s*(?:₹|rs\\.?)?\\s*${NUM})`,
    `(?<stk>(?:\\bstock\\b|\\bqty\\b|\\bquantity\\b|स्टॉक|मात्रा)\\s*[:=\\-]?\\s*(\\d+))`,
    `(?<x>(?<![\\p{L}\\d])[x×]\\s?(\\d+)(?![\\p{L}\\d]))`,
    `(?<pr>(?:₹|\\brs\\.?|\\binr\\b|@|\\bprice\\b|\\brate\\b|दाम|रेट|कीमत)\\s*[:=\\-]?\\s*(?:₹|rs\\.?)?\\s*${NUM})`,
    `(?<sz>${NUM}\\s*${UNIT}(?![\\p{L}]))`,
    `(?<n>(?<![\\p{L}\\d.])${NUM}(?![\\d]))`
  ].join("|"), "giu");
  const num = s => Number(String(s).replace(",", "."));
  function parseLine(raw){
    let s = deva(raw).normalize("NFC").replace(/\t/g, "  ").replace(/\s+/g, " ").trim();
    s = s.replace(/^(?:[-•*·▪►]+\s*|\d{1,3}[.)]\s+)/, "").trim();
    if (!s || !/[\p{L}]/u.test(s)) return null;
    if (!/\d/.test(s) && /^(name|item|items|product|सामान|नाम)\b/i.test(s)) return null; // a header line
    const r = {raw: String(raw).trim(), name: "", size: "", price: null, mrp: null, stock: null};
    let first = -1, m; TOK.lastIndex = 0; const toks = [];
    while ((m = TOK.exec(s))) toks.push({g: m.groups, i: m.index, t: m[0]});
    // a leading number that is part of the name ("5 Star ₹10", "7up 2 L 90")
    if (toks.length && toks[0].i === 0 && toks[0].g.n != null && /^\d+\s*[\p{L}]/u.test(s) && !(toks[1] && toks[1].i <= toks[0].t.length + 1 && toks[1].g.n != null)) toks.shift();
    let sawPrice = false;
    for (const k of toks) {
      const g = k.g; if (first < 0) first = k.i;
      if (g.mrp != null) { r.mrp = num(k.t.match(/\d+(?:[.,]\d{1,2})?/)[0]); continue; }
      if (g.stk != null) { r.stock = Number(k.t.match(/\d+/)[0]); continue; }
      if (g.x != null) { r.stock = Number(k.t.match(/\d+/)[0]); continue; }
      if (g.pr != null) { if (r.price == null) { r.price = num(k.t.match(/\d+(?:[.,]\d{1,2})?/)[0]); sawPrice = true; } continue; }
      if (g.sz != null) { const mm = /(\d+(?:[.,]\d{1,2})?)\s*(.+)$/u.exec(k.t); const u = mm[2];
        if (COUNT_U.test(u) && (r.size || sawPrice || r.price != null)) { if (r.stock == null) r.stock = Number(mm[1]); continue; }
        if (!r.size) { r.size = k.t.replace(/\s+/g, " ").trim(); continue; }
        if (r.stock == null && COUNT_U.test(u)) r.stock = Number(mm[1]); continue; }
      if (g.n != null) { const v = num(k.t); if (r.price == null) { r.price = v; sawPrice = true; } else if (r.stock == null && Number.isInteger(v)) r.stock = v; }
    }
    r.name = (first < 0 ? s : s.slice(0, first)).replace(/[\s,;:|\-–—=/]+$/u, "").replace(/^[\s,;:|\-–—]+/u, "").trim();
    if (!r.name && first > 0) r.name = s.slice(0, first).trim();
    return finish(r);
  }
  function finish(r){
    r.name = String(r.name || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const hasDeva = /[\u0900-\u097F]/.test(r.name);
    if (!r.size) { const mm = new RegExp(`${NUM}\\s*${UNIT}(?![\\p{L}])`, "iu").exec(deva(r.name)); if (mm && mm.index > 0) { r.size = mm[0]; r.name = deva(r.name).slice(0, mm.index).replace(/[\s,\-–]+$/, "").trim(); } }
    r.size = String(r.size || "").trim().slice(0, 40);
    if (r.price != null && !(r.price > 0)) r.price = null;
    if (r.price != null && r.price > 1000000) r.price = null;
    if (r.stock != null && !(Number.isInteger(r.stock) && r.stock >= 0 && r.stock <= 100000)) r.stock = null;
    const cat = guess(r.name);
    r.cat = cat.cat; r.name_hi = hasDeva ? r.name : (cat.hi || r.name); r.name_en = hasDeva ? (cat.en || "") : r.name;
    if (cat.icon) r.icon = cat.icon;
    r.ok = !!r.name && r.price != null;
    r.why = !r.name ? "name" : r.price == null ? "price" : "";
    return r;
  }
  // ---------- category guess (ready list + keywords) ----------
  const KW = [["atta", /\b(atta|aata|maida|sooji|suji|rava|besan|rice|chawal|chaawal|basmati|dal|daal|chana|rajma|moong|urad|masoor|toor|arhar|poha|dalia|sabudana)\b|आटा|मैदा|सूजी|बेसन|चावल|दाल|चना|राजमा|मूंग|उड़द|पोहा/i],
    ["oil", /\b(oil|tel|ghee|ghi|vanaspati|dalda)\b|तेल|घी/i], ["masale", /\b(masala|haldi|mirch|mirchi|jeera|dhaniya|hing|elaichi|laung|ajwain|rai|methi|saunf|spice)\b|मसाला|हल्दी|मिर्च|जीरा|धनिया/i],
    ["salt", /\b(salt|namak|sugar|cheeni|chini|gud|jaggery|shakkar|honey)\b|नमक|चीनी|गुड़|शहद/i], ["snacks", /\b(biscuit|biskut|cookies?|chips|namkeen|bhujia|kurkure|lays|chocolate|toffee|candy|rusk)\b|बिस्कुट|नमकीन|भुजिया|चिप्स/i],
    ["bev", /\b(tea|chai|coffee|cold ?drink|juice|water|cola|pepsi|sprite|bournvita|horlicks)\b|चाय|कॉफ़ी|पानी|जूस/i], ["dairy", /\b(milk|doodh|dudh|butter|paneer|curd|dahi|cheese|cream|egg|eggs|anda|ande|bread|pav)\b|दूध|दही|पनीर|मक्खन|अंडे|ब्रेड/i],
    ["breakfast", /\b(maggi|noodles?|oats|flakes|pasta|macaroni|sevai|vermicelli|papad|soup)\b|मैगी|नूडल्स|सेवई|पापड़/i], ["sauce", /\b(ketchup|sauce|jam|pickle|achar|vinegar)\b|अचार|सॉस/i],
    ["dry", /\b(kaju|badam|kishmish|akhrot|pista|khajur|makhana|cashew|almond|raisin|dates)\b|काजू|बादाम|किशमिश/i],
    ["personal", /\b(soap|sabun|shampoo|toothpaste|paste|brush|cream|powder|razor|pads?|hair ?oil|lotion|face ?wash|diaper)\b|साबुन|शैम्पू|पेस्ट|क्रीम/i],
    ["cleaning", /\b(surf|detergent|washing|vim|harpic|phenyl|lizol|broom|jhadu|scrub|cleaner|bar|tide|ariel|rin|nirma|wheel|coil|refill|matchbox|machis)\b|सर्फ|झाड़ू|फिनाइल|माचिस/i],
    ["pooja", /\b(agarbatti|dhoop|kapur|camphor|diya|pooja|puja)\b|अगरबत्ती|कपूर|पूजा/i]];
  let IDX = null;
  const nn = s => String(s || "").toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();
  function index(){ if (IDX) return IDX; IDX = []; const C = G.AKCatalog; if (!C) return IDX;
    const icon = Object.fromEntries(C.cats.map(c => [c.k, c.i]));
    const seen = new Set(); for (const [k, en, hi] of C.items) { if (seen.has(en)) continue; seen.add(en); IDX.push({k, en, hi, ne: nn(en), nh: nn(hi), ne2: nn(en.replace(/\(.*?\)/g, "")), icon: icon[k]}); }
    return IDX; }
  function guess(name){
    const n = nn(name); if (!n) return {cat: "other"};
    const C = G.AKCatalog, idx = index();
    let best = null; for (const it of idx) { if (n === it.ne || n === it.nh || n === it.ne2) { best = it; break; } }
    if (!best) for (const it of idx) { if (it.ne2.length > 3 && (n.includes(it.ne2) || it.ne2.includes(n)) && n.length > 3) { best = it; break; } }
    if (best) return {cat: best.k, hi: best.hi, en: best.en.replace(/\s*\(.*?\)\s*/g, " ").trim() === nn(name) ? best.en : (best.en), icon: best.icon, exact: n === best.ne || n === best.nh};
    for (const [k, re] of KW) if (re.test(name)) return {cat: k, icon: C && (C.cats.find(c => c.k === k) || {}).i};
    return {cat: "other"};
  }
  // ---------- tables (CSV / Excel) ----------
  const H = {name: /^(name|item|item ?name|product|product ?name|description|particulars?|सामान|नाम|आइटम|name_en|english)$/i, name_hi: /^(name_hi|hindi|hindi ?name|हिंदी|हिंदी नाम)$/i,
    size: /^(size|pack|pack ?size|pack_size|unit|weight|qty ?\/ ?unit|वजन|साइज़|पैक)$/i, price: /^(price|rate|selling ?price|sp|sale ?price|दाम|रेट|कीमत|बिक्री ?मूल्य)$/i, mrp: /^(mrp|m\.r\.p\.?)$/i,
    stock: /^(stock|qty|quantity|stock ?qty|opening ?stock|स्टॉक|मात्रा)$/i, cat: /^(category|category_hi|category_en|group|कैटेगरी|श्रेणी)$/i};
  function fromTable(rows){
    rows = rows.map(r => r.map(c => deva(c == null ? "" : String(c)).trim())).filter(r => r.some(c => c !== ""));
    if (!rows.length) return [];
    const head = rows[0].map(h => h.toLowerCase().replace(/[*:]/g, "").trim()); const col = {};
    head.forEach((h, i) => { for (const [k, re] of Object.entries(H)) if (col[k] == null && re.test(h)) col[k] = i; });
    if (col.name == null && col.name_hi != null) { col.name = col.name_hi; }
    if (col.name == null || (col.price == null && col.size == null)) return rows.map(r => parseLine(r.filter(Boolean).join("  "))).filter(Boolean); // no header → read each row as a line
    const out = [];
    for (const r of rows.slice(1)) {
      const g = k => col[k] == null ? "" : (r[col[k]] || "");
      const name = g("name") || g("name_hi"); if (!name) continue;
      const pn = s => { const v = String(s).replace(/[₹,\s]|rs\.?/gi, ""); return v === "" ? null : Number(v); };
      const x = {raw: r.join(", "), name, size: g("size"), price: pn(g("price")), mrp: pn(g("mrp")), stock: g("stock") === "" ? null : Number(String(g("stock")).replace(/[^\d.]/g, ""))};
      if (x.price != null && !Number.isFinite(x.price)) x.price = null; if (x.mrp != null && !Number.isFinite(x.mrp)) x.mrp = null;
      const f = finish(x);
      if (col.name_hi != null && g("name_hi") && col.name !== col.name_hi) { f.name_hi = g("name_hi"); if (!/[\u0900-\u097F]/.test(name)) f.name_en = name; }
      if (g("cat")) f.cat_name = g("cat");
      out.push(f);
    }
    return out;
  }
  function parseCSV(text){
    text = String(text || "").replace(/^\ufeff/, ""); const rows = []; let row = [], f = "", q = false;
    const sep = (text.split("\n")[0].match(/;/g) || []).length > (text.split("\n")[0].match(/,/g) || []).length ? ";" : (text.split("\n")[0].includes("\t") ? "\t" : ",");
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true; else if (c === sep) { row.push(f); f = ""; } else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; } else f += c; }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  // ---------- .xlsx (a zip of XML files) ----------
  async function inflate(u8, fmt){ const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream(fmt)); return new Uint8Array(await new Response(s).arrayBuffer()); }
  async function unzip(buf, want){
    const dv = new DataView(buf); let e = buf.byteLength - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("not a zip");
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {}; const td = new TextDecoder();
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lho = dv.getUint32(p + 42, true);
      const name = td.decode(new Uint8Array(buf, p + 46, nl)); p += 46 + nl + xl + cl;
      if (!want(name)) continue;
      const data = new Uint8Array(buf, lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true), csize);
      out[name] = td.decode(method === 0 ? data : await inflate(data, "deflate-raw"));
    }
    return out;
  }
  const xmlText = s => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([\da-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&");
  async function parseXLSX(buf){
    const f = await unzip(buf, n => n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n) || n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels");
    const ss = []; if (f["xl/sharedStrings.xml"]) for (const m of f["xl/sharedStrings.xml"].matchAll(/<si>([\s\S]*?)<\/si>/g)) ss.push(xmlText((m[1].match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).join("")));
    let sheet = null;
    try { const rid = /<sheet [^>]*r:id="([^"]+)"/.exec(f["xl/workbook.xml"])[1]; const tgt = new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${rid}"`).exec(f["xl/_rels/workbook.xml.rels"]); const t = (tgt[1] || tgt[2]).replace(/^\/?(xl\/)?/, "xl/"); sheet = f[t]; } catch {}
    if (!sheet) sheet = f[Object.keys(f).filter(k => /worksheets/.test(k)).sort()[0]];
    if (!sheet) throw new Error("no sheet");
    const rows = [];
    for (const rm of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cm of rm[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const at = cm[1], inner = cm[2] || ""; const ref = /r="([A-Z]+)\d+"/.exec(at); const t = (/t="(\w+)"/.exec(at) || [])[1];
        let ci = row.length; if (ref) { ci = 0; for (const ch of ref[1]) ci = ci * 26 + ch.charCodeAt(0) - 64; ci--; }
        const v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
        let val = t === "s" ? ss[Number(v)] : t === "inlineStr" ? xmlText((inner.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).join("")) : v != null ? xmlText(v) : "";
        if (t !== "s" && t !== "inlineStr" && t !== "str" && val !== "" && /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(val)) val = String(Math.round(Number(val) * 100) / 100);
        while (row.length < ci) row.push(""); row[ci] = val ?? "";
      }
      rows.push(row);
    }
    return rows;
  }
  function parseText(text){ return String(text || "").split(/\r?\n/).map(parseLine).filter(Boolean); }
  async function parseFile(name, buf){
    const ext = (String(name).toLowerCase().match(/\.(\w+)$/) || [])[1];
    if (ext === "csv" || ext === "txt" || ext === "tsv") { const t = new TextDecoder().decode(buf); return ext === "txt" ? {rows: parseText(t)} : {rows: fromTable(parseCSV(t))}; }
    if (ext === "xlsx") return {rows: fromTable(await parseXLSX(buf))};
    if (ext === "xls") return {error: "old_xls"};
    if (ext === "pdf") { if (!G.AKPdfText) return {error: "pdf_lib"}; const text = await G.AKPdfText(buf); if (text.replace(/\s/g, "").length < 8) return {error: "scanned"}; return {rows: parseText(text), text}; }
    return {error: "type"};
  }
  G.AKImport = {parseLine, parseText, parseCSV, fromTable, parseXLSX, parseFile, guess, unzip, inflate, nn};
})(globalThis);
