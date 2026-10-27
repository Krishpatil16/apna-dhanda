// Home-screen app icons, made in the browser (free, no external service): 192, 512, maskable 512, apple-touch 180.
(function(){
  const MAX = 440000;
  function seg(s){ try { return [...new Intl.Segmenter("hi", {granularity:"grapheme"}).segment(s)].map(x => x.segment); } catch { return [...s]; } }
  function initials(name){ const w = String(name || "").trim().split(/\s+/).filter(x => /[\p{L}\p{N}]/u.test(x)); const g = x => seg(x)[0] || ""; return ((w.length > 1 ? g(w[0]) + g(w[1]) : g(w[0] || "?")) || "?").toUpperCase(); }
  function loadImg(file){ return new Promise((res, rej) => { const i = new Image(); const u = URL.createObjectURL(file); i.onload = () => { res(i); setTimeout(() => URL.revokeObjectURL(u), 1000); }; i.onerror = () => rej(new Error("यह फ़ोटो नहीं खुली · Could not read this image")); i.src = u; }); }
  function out(c){ let d = c.toDataURL("image/png"); if (d.length * 0.75 > MAX) d = c.toDataURL("image/jpeg", 0.9); if (d.length * 0.75 > MAX) d = c.toDataURL("image/jpeg", 0.75); return d; }
  // kind: any (cover, full bleed) | mask (logo inside the 80% safe zone on the colour) | apple (opaque, cover)
  function draw(src, size, kind, bg, text){
    const c = document.createElement("canvas"); c.width = c.height = size; const x = c.getContext("2d");
    x.fillStyle = bg || "#1f6b3a"; x.fillRect(0, 0, size, size);
    if (src) {
      const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
      if (kind === "mask") { const box = size * 0.72, s = Math.min(box / iw, box / ih); const w = iw * s, h = ih * s; x.fillStyle = "#fff"; x.beginPath(); x.arc(size/2, size/2, size*0.4, 0, Math.PI*2); x.fill(); x.drawImage(src, (size - w)/2, (size - h)/2, w, h); }
      else { const s = Math.max(size / iw, size / ih); const w = iw * s, h = ih * s; x.drawImage(src, (size - w)/2, (size - h)/2, w, h); }
    } else {
      const t = text || "?"; const n = [...t].length; const fs = size * (kind === "mask" ? 0.3 : 0.4) * (n > 2 ? 0.75 : 1);
      x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `700 ${fs}px system-ui, "Noto Sans Devanagari", sans-serif`; x.fillText(t, size/2, size/2 + fs*0.04);
    }
    return out(c);
  }
  function make(src, bg, text){ return {i192: draw(src, 192, "any", bg, text), i512: draw(src, 512, "any", bg, text), m512: draw(src, 512, "mask", bg, text), a180: draw(src, 180, "apple", bg, text), s256: small(src, bg, text)}; }
  // v10.10.1: a ~5–15 KB WebP of the same logo for the page header and splash (browsers without WebP canvas export give PNG — still 256px)
  function small(src, bg, text){ if (!src) return draw(null, 256, "any", bg, text);
    const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d"); x.fillStyle = bg || "#1f6b3a"; x.fillRect(0, 0, 256, 256);
    const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height, s = Math.max(256 / iw, 256 / ih); x.drawImage(src, (256 - iw*s)/2, (256 - ih*s)/2, iw*s, ih*s);
    const w = c.toDataURL("image/webp", 0.82); return w.startsWith("data:image/webp") ? w : c.toDataURL("image/png"); }
  window.AppIcon = {
    initials, count: s => seg(String(s || "")).length,
    async fromFile(file, bg){ return make(await loadImg(file), bg); },
    fromInitials(name, bg){ return make(null, bg, initials(name)); },
    // upload(dataUrl) → image_id ; returns {i192, i512, m512, a180} ids
    async uploadAll(set, upload){ const ids = {}; for (const k of ["i192","i512","m512","a180","s256"]) if (set[k]) ids[k] = await upload(set[k]); return ids; }
  };
})();
