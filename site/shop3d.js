/* Apna Dhanda v10.2 — decorative 3D shop & grocery scene for "/" and "/admin" login/signup only (never /s/<slug>, never logged-in panels).
   Pure decoration: aria-hidden, pointer-events:none, placed by measuring the page so nothing ever sits on text, buttons or inputs.
   Fewer objects under 600px, paused when the tab is hidden, static with prefers-reduced-motion. No libraries. */
(function(){
  if (/^\/s\//.test(location.pathname) || !document.querySelector) return;
  var W = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"';
  var O = {
    shop:'<path d="M14 44h60v46H14z" fill="#fff4dc"/><path d="M74 44l14-8v46l-14 8z" fill="#e8c98f"/><path d="M10 30h66l12-8H24z" fill="#b8360f"/><path d="M10 30h66v14H10z" fill="#ef4444"/><path d="M20 30h9v14h-9zM38 30h9v14h-9zM56 30h9v14h-9z" fill="#fff"/><path d="M10 44q5 6 11 0 5 6 11 0 5 6 11 0 5 6 11 0 5 6 11 0 5 6 11 0" fill="#ef4444"/><path d="M76 30l12-8v12l-12 10z" fill="#c2410c"/><path d="M22 58h20v32H22z" fill="#7c3aed"/><path d="M48 58h20v18H48z" fill="#bae6fd"/><path d="M48 66h20" stroke="#0369a1" stroke-width="2"/><circle cx="38" cy="75" r="2" fill="#fde047"/><path d="M24 14h40v10H24z" fill="#16a34a"/><text x="44" y="22" font-size="8" font-weight="900" fill="#fff" text-anchor="middle" font-family="sans-serif">KIRANA</text>',
    cart:'<path d="M6 18h14l12 46h46l10-34H26" fill="none" stroke="#1d4ed8" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/><path d="M28 30h58l-9 30H35z" fill="#60a5fa" opacity=".35"/><rect x="34" y="12" width="16" height="22" rx="3" fill="#f97316"/><rect x="52" y="18" width="14" height="16" rx="3" fill="#facc15"/><circle cx="72" cy="24" r="9" fill="#ef4444"/><path d="M32 72h48" stroke="#1e3a8a" stroke-width="5" stroke-linecap="round"/><circle cx="38" cy="84" r="8" fill="#111827"/><circle cx="38" cy="84" r="3" fill="#9ca3af"/><circle cx="74" cy="84" r="8" fill="#111827"/><circle cx="74" cy="84" r="3" fill="#9ca3af"/>',
    bag:'<path d="M36 34V24a14 14 0 0 1 28 0v10" fill="none" stroke="#7c2d12" stroke-width="5"/><path d="M18 34h54l-4 58H14z" fill="#fb923c"/><path d="M72 34l14 8-4 46-14 4z" fill="#c2410c"/><path d="M18 34h54l14 8H32z" fill="#fdba74"/><circle cx="43" cy="62" r="13" fill="#fff"/><text x="43" y="68" font-size="17" font-weight="900" fill="#16a34a" text-anchor="middle" font-family="sans-serif">₹</text>',
    sack:'<path d="M22 30q28-10 56 0l6 52q-34 14-68 0z" fill="#f5deb3"/><path d="M62 28q12 2 16 2l6 52q-10 5-20 6z" fill="#d6b77f"/><path d="M28 20q22 12 44 0l-6 12q-16 6-32 0z" fill="#e7c88f"/><path d="M30 30q20 6 40 0" stroke="#b45309" stroke-width="4" fill="none"/><rect x="30" y="46" width="34" height="24" rx="4" fill="#dc2626"/><text x="47" y="63" font-size="12" font-weight="900" fill="#fff" text-anchor="middle" font-family="sans-serif">आटा</text>',
    milk:'<path d="M30 26h34l6 8v58H24V34z" fill="#fff"/><path d="M64 26l12 6v56l-6 4V34z" fill="#cbd5e1"/><path d="M30 26l6-14h22l6 14z" fill="#e2e8f0"/><path d="M36 12h22l6 14H30z" fill="#2563eb" opacity=".9"/><path d="M24 50h46v26H24z" fill="#3b82f6"/><path d="M24 56q12-8 23 0t23 0" fill="#fff" opacity=".55"/><text x="47" y="72" font-size="11" font-weight="900" fill="#fff" text-anchor="middle" font-family="sans-serif">MILK</text>',
    biscuit:'<path d="M10 34l58-12 22 14-58 14z" fill="#fde047"/><path d="M10 34l22 16v28L10 62z" fill="#ca8a04"/><path d="M32 50l58-14v28L32 78z" fill="#facc15"/><path d="M32 58l58-14v8L32 66z" fill="#dc2626"/><circle cx="52" cy="66" r="7" fill="#b45309"/><circle cx="68" cy="62" r="7" fill="#d97706"/><circle cx="52" cy="66" r="2" fill="#78350f"/><circle cx="68" cy="62" r="2" fill="#92400e"/>',
    soap:'<path d="M14 50l40-16 34 12-40 18z" fill="#f0abfc"/><path d="M14 50l34 14v18L14 68z" fill="#a21caf"/><path d="M48 64l40-18v18L48 82z" fill="#c026d3"/><ellipse cx="52" cy="48" rx="16" ry="5" fill="#fff" opacity=".6"/><circle cx="70" cy="22" r="7" fill="#e0f2fe" stroke="#93c5fd" stroke-width="2"/><circle cx="82" cy="32" r="4" fill="#e0f2fe" stroke="#93c5fd" stroke-width="2"/>',
    chai:'<path d="M30 12q-6 8 0 14t0 12M46 10q-6 8 0 14t0 12" stroke="#94a3b8" stroke-width="3" fill="none" stroke-linecap="round" opacity=".8"/><ellipse cx="44" cy="84" rx="38" ry="9" fill="#f97316"/><path d="M20 44h48l-6 36H26z" fill="#fff"/><path d="M60 44h8l-6 36h-6z" fill="#e2e8f0"/><ellipse cx="44" cy="44" rx="24" ry="6" fill="#92400e"/><path d="M66 52q16 0 12 14t-14 8" fill="none" stroke="#fff" stroke-width="5"/><path d="M26 60h40" stroke="#f97316" stroke-width="4"/>',
    apple:'<path d="M50 30c-10-8-34-6-34 22 0 24 18 40 34 34 16 6 34-10 34-34 0-28-24-30-34-22z" fill="#ef4444"/><path d="M66 36c10 6 14 22 6 40-6 8-14 12-22 10 16-4 24-30 16-50z" fill="#b91c1c"/><ellipse cx="32" cy="46" rx="6" ry="10" fill="#fff" opacity=".45"/><path d="M50 30q-2-12 4-20" stroke="#713f12" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M54 22q16-10 22 2-14 6-22-2z" fill="#22c55e"/>',
    banana:'<path d="M14 30q4 40 40 52 26 6 34-8-34 4-52-22-8-12-10-26z" fill="#facc15"/><path d="M26 34q8 30 40 40 14 2 22 0-4 8-22 8-36-10-40-48z" fill="#eab308"/><path d="M14 30l-4-10 8 2z" fill="#713f12"/><path d="M88 74l6 2-4 4z" fill="#713f12"/><path d="M20 36q8 28 34 38" stroke="#fde68a" stroke-width="3" fill="none" stroke-linecap="round"/>',
    mango:'<path d="M60 18c22 8 30 40 14 60-14 18-48 16-56-6-6-18 6-30 18-40 8-8 12-18 24-14z" fill="#fb923c"/><path d="M60 18c-12-4-16 6-24 14-8 8-14 14-16 22 14-14 30-16 44-30z" fill="#facc15"/><path d="M74 78c-8 10-24 14-38 10 18-4 32-18 38-40 6 10 6 22 0 30z" fill="#ea580c"/><path d="M60 18q4-8 12-10" stroke="#3f6212" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M66 12q16-6 22 6-14 4-22-6z" fill="#16a34a"/>',
    coin:'<ellipse cx="54" cy="52" rx="34" ry="36" fill="#b45309"/><ellipse cx="48" cy="50" rx="34" ry="36" fill="#facc15"/><ellipse cx="48" cy="50" rx="26" ry="28" fill="none" stroke="#eab308" stroke-width="4"/><text x="48" y="64" font-size="38" font-weight="900" fill="#a16207" text-anchor="middle" font-family="sans-serif">₹</text><ellipse cx="36" cy="32" rx="6" ry="10" fill="#fff" opacity=".45"/>',
    scooter:'<rect x="12" y="20" width="32" height="28" rx="3" fill="#f59e0b"/><path d="M44 20l8-6v28l-8 6z" fill="#b45309"/><path d="M12 20l8-6h32l-8 6z" fill="#fcd34d"/><path d="M16 30h24" stroke="#7c2d12" stroke-width="2"/><path d="M14 52h44q10-16 18-22l6 2-8 22 8 16H16q-6-6-2-18z" fill="#16a34a"/><path d="M58 52q12-14 18-22" stroke="#14532d" stroke-width="3" fill="none"/><path d="M72 26l12-4" stroke="#111827" stroke-width="4" stroke-linecap="round"/><circle cx="26" cy="78" r="11" fill="#111827"/><circle cx="26" cy="78" r="4" fill="#d1d5db"/><circle cx="80" cy="78" r="11" fill="#111827"/><circle cx="80" cy="78" r="4" fill="#d1d5db"/><circle cx="88" cy="56" r="4" fill="#fde047"/>'
  };
  var ORDER = ["shop","cart","coin","milk","bag","mango","biscuit","chai","sack","apple","scooter","banana","soap"];
  var mq = function(q){ try { return matchMedia(q).matches; } catch (e) { return false; } };
  var reduce = mq("(prefers-reduced-motion: reduce)");
  var admin = /^\/admin/.test(location.pathname);
  var layer = document.createElement("div"); layer.className = "s3d" + (reduce ? " s3d-still" : ""); layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  var seed = 7; function rnd(){ seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

  function rectsOf(sel, list, pad){ var els = document.querySelectorAll(sel); for (var i = 0; i < els.length; i++) { var r = els[i].getBoundingClientRect(); if (r.width && r.height) list.push([r.left - pad, r.top + scrollY - pad, r.right + pad, r.bottom + scrollY + pad]); } }
  function textRects(root, list, pad){
    if (!root) return; var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, rg = document.createRange();
    while ((n = tw.nextNode())) { if (!/\S/.test(n.nodeValue) || (n.parentNode && n.parentNode.closest && n.parentNode.closest(".s3d,#adSplash,[hidden]"))) continue;
      rg.selectNodeContents(n); var rs = rg.getClientRects(); for (var i = 0; i < rs.length; i++) { var r = rs[i]; if (r.width) list.push([r.left - pad, r.top + scrollY - pad, r.right + pad, r.bottom + scrollY + pad]); } }
  }
  function hit(a, b){ return a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }

  function regions(vw){
    var mob = vw < 600, out = [];
    if (admin) {
      if (!document.body.classList.contains("auth-mode")) return out;
      out.push({y0: 50, y1: Math.max(innerHeight, document.documentElement.scrollHeight) - 10, n: mob ? 5 : 12, s: mob ? [40, 54] : [70, 112]});
      return out;
    }
    var h = document.querySelector(".hero"), w = document.querySelector(".wrap");
    if (h) { var r = h.getBoundingClientRect(); out.push({y0: r.top + scrollY + 52, y1: r.bottom + scrollY - 30, n: mob ? 4 : 9, s: mob ? [42, 56] : [66, 108]}); }
    if (w) { var q = w.getBoundingClientRect(); out.push({y0: q.top + scrollY, y1: q.bottom + scrollY, n: mob ? 3 : 10, s: mob ? [40, 52] : [64, 104]}); }
    return out;
  }

  function layout(){
    // v10.8.1: collapse the layer BEFORE measuring. It used to be sized to the page's scrollHeight, which included the layer itself,
    // so it could only grow: after a tall tab (Settings) every shorter tab kept a huge blank tail. Logged-in admin has no scene → stays 0.
    layer.style.height = "0px"; layer.innerHTML = ""; seed = 7;
    var vw = document.documentElement.clientWidth, dh = document.documentElement.scrollHeight;
    if (!regions(vw).length) return;
    layer.style.height = dh + "px";
    var av = [], pad = vw < 600 ? 4 : 10;
    textRects(document.querySelector(admin ? "#app" : "body"), av, pad);
    if (admin) textRects(document.querySelector(".a-top"), av, pad);
    rectsOf("a,button,input,select,textarea,label,canvas,img,.phone,.qr-chip,.bell-chip,.steps li,.feat>div,.pc,.auth,.ah-logo,.bar,.toast:not(:empty)", av, pad);
    var placed = [], k = 0, regs = regions(vw);
    for (var g = 0; g < regs.length; g++) {
      var R = regs[g], step = vw < 600 ? 14 : 22;
      for (var c = 0; c < R.n; c++) {
        var sz = Math.round(R.s[0] + rnd() * (R.s[1] - R.s[0])), best = null, bd = -1;
        for (var y = R.y0; y + sz <= R.y1; y += step) for (var x = 6; x + sz <= vw - 6; x += step) {
          var b = [x, y, x + sz, y + sz], e = vw < 600 ? Math.round(sz * .12) + 5 : Math.round(sz * .16) + 14, be = [x - e, y - e, x + sz + e, y + sz + e], ok = true, i;
          for (i = 0; i < av.length; i++) if (hit(be, av[i])) { ok = false; break; }
          if (!ok) continue;
          var md = 1e9; for (i = 0; i < placed.length; i++) { var p = placed[i], dx = (p[0] + p[2]) / 2 - (x + sz / 2), dy = (p[1] + p[3]) / 2 - (y + sz / 2), d = Math.sqrt(dx * dx + dy * dy) - (p[2] - p[0]) / 2 - sz / 2; if (d < md) md = d; }
          if (md < (vw < 600 ? 10 : 26)) continue;
          var sc = Math.min(md, 400) + rnd() * 40; if (sc > bd) { bd = sc; best = b; }
        }
        if (!best) break;
        placed.push(best); add(ORDER[k++ % ORDER.length], best, sz);
      }
    }
  }
  function add(name, b, sz){
    var o = document.createElement("div"), d = (0.4 + rnd() * 0.9).toFixed(2), svg = "<svg " + W + ">" + O[name] + "</svg>";
    o.className = "s3d-o"; o.style.cssText = "left:" + b[0] + "px;top:" + b[1] + "px;width:" + sz + "px;height:" + sz + "px;--d:" + d + ";--t:" + (5 + rnd() * 4).toFixed(1) + "s;--dl:-" + (rnd() * 8).toFixed(1) + "s;--ry:" + Math.round(14 + rnd() * 18) + "deg;--rz:" + Math.round(-10 + rnd() * 20) + "deg";
    o.innerHTML = '<i class="s3d-sh"></i><div class="s3d-p"><div class="s3d-b"><span class="s3d-x s3d-x2">' + svg + '</span><span class="s3d-x s3d-x1">' + svg + '</span><span class="s3d-f">' + svg + "</span></div></div>";
    layer.appendChild(o);
  }

  var tm = 0; function soon(ms){ clearTimeout(tm); tm = setTimeout(layout, ms || 120); }
  layout(); setTimeout(layout, 700); setTimeout(layout, 2700);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ soon(50); });
  addEventListener("resize", function(){ soon(160); }, {passive: true});
  addEventListener("load", function(){ soon(50); });
  document.addEventListener("click", function(e){ if (e.target && e.target.closest && e.target.closest("#langBtn,[data-go],button")) soon(80); }, true);
  if (admin && window.MutationObserver) { var app = document.getElementById("app"); var mo = new MutationObserver(function(){ soon(150); }); if (app) mo.observe(app, {childList: true, subtree: true}); mo.observe(document.body, {attributes: true, attributeFilter: ["class"]}); }
  document.addEventListener("visibilitychange", function(){ layer.classList.toggle("s3d-paused", document.hidden); });
  if (reduce) return;
  var raf = 0, mx = 0, my = 0, sy = 0;
  function paint(){ raf = 0; layer.style.setProperty("--mx", mx.toFixed(3)); layer.style.setProperty("--my", my.toFixed(3)); layer.style.setProperty("--sy", sy.toFixed(1)); }
  function req(){ if (!raf) raf = requestAnimationFrame(paint); }
  addEventListener("pointermove", function(e){ if (e.pointerType !== "mouse") return; mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; req(); }, {passive: true});
  addEventListener("scroll", function(){ sy = Math.min(scrollY, 160); req(); }, {passive: true});
})();
