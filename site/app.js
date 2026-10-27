// Customer storefront
(function(){
  const {t, esc, money, rupees, api, applyT, toast, nm, alt, reduced} = AK;
  const $ = s => document.querySelector(s);
  let S = null;              // store payload
  let byVariant = new Map(); // variant id -> {p, v}
  let cat = "all", q = "";
  let cart = load("ak_cart", {});  // { [variantId]: {qty, price} }
  let notices = {};          // variantId -> message after server revalidation
  function load(k, d){ try { return JSON.parse(localStorage.getItem(AK.SK(k))) ?? d; } catch { return d; } }
  const saveCart = () => localStorage.setItem(AK.SK("ak_cart"), JSON.stringify(cart));
  // v4: on-device only (no account/OTP): favourites, saved addresses, delivery area, sort
  const L = (hi, en) => AK.lang === "en" ? en : hi;
  let favs = new Set(load("ak_favs", [])); const saveFavs = () => localStorage.setItem(AK.SK("ak_favs"), JSON.stringify([...favs]));
  let addrs = load("ak_addrs", []); const saveAddrs = () => localStorage.setItem(AK.SK("ak_addrs"), JSON.stringify(addrs.slice(0, 5)));
  let area = load("ak_area", null);
  let sortBy = "", lastMine = [];

  // v10.11: the hero crate shows this shop type's own emoji (grocery pictures stay on kirana shops only)
  const CRATE = {restaurant: ["🍛","🥟","🍲","🥤","🍮","☕","🫓","🍜","🥗","🍢","🍨","🧆","🍽️","🥘","🍩"], salon: ["💇","✂️","💅","💄","🪮","🧴","💆","🪞","✨","💇‍♂️","🧖","💈","💇","✂️","💅"],
    clinic: ["🩺","💊","🌡️","🩹","💉","🧪","❤️","🦷","👨‍⚕️","🏥","🩻","🫀","🩺","💊","🩹"], repair: ["🔧","🔩","🛠️","📱","💡","🔌","🧰","⚙️","🪛","🔋","🖥️","🚲","🔧","🔩","🛠️"],
    other: ["🏪","🛍️","⭐","🎁","📦","🏷️","🧾","💐","📚","👕","🎈","🪔","🏪","🛍️","⭐"]};
  // v10.11: the shop's own name from the page meta right away (the HTML placeholder never shows)
  (function nameFirst(){ const n = AK.SHOP && AK.SHOP.name; if (!n) return; const h = document.getElementById("storeName"), sb = document.getElementById("storeSub"); if (h) h.textContent = n; if (sb) sb.textContent = ""; })();
  (function crateForType(){ const set = CRATE[AK.shopType]; if (!set) { const tk = document.querySelector(".crate .f-top b"); if (tk && AK.lang === "en") tk.textContent = "Kirana"; return; } let n = 0;
    document.querySelectorAll(".crate .face span, .hero-stage .floaty").forEach(e => { e.textContent = set[n++ % set.length]; });
    const top = document.querySelector(".crate .f-top b"); if (top) top.textContent = AK.TYPES[AK.shopType].short[AK.lang === "en" ? 1 : 0]; })();
  async function boot(){
    applyT();
    try { S = await api("/api/store"); if (S.service_paused && !sessionStorage.getItem("ak_paused_reload")) { sessionStorage.setItem("ak_paused_reload", "1"); location.reload(); return; } sessionStorage.removeItem("ak_paused_reload"); }
    catch (e) { $("#sections").innerHTML = `<p class="empty">${esc(e.message)}</p><p class="empty"><button class="btn btn-ghost" id="retry">↻</button></p>`; $("#retry").onclick = boot; return; }
    byVariant = new Map(); for (const p of S.products) for (const v of p.variants) byVariant.set(v.id, {p, v});
    if (S.shop && S.shop.type && S.shop.type !== AK.shopType) { AK.useShopType(S.shop.type); applyT(); } // v10.11 (the page meta normally has it already)
    reconcile(); renderShell(); renderDelivery(); renderOffers(); renderChips(); renderProducts(); renderCartBar(); renderRecent(); renderReviews();
    setTimeout(visitBeacon, 0);
    if (location.pathname === "/" && S.shop && S.shop.slug && AK.SHOP.slug === S.shop.slug) history.replaceState(null, "", AK.HOME + location.hash); // old QR / root link → this shop's own address
    if (location.hash === "#cart") { history.replaceState(null, "", AK.HOME); openSheet("cart"); renderCart(); }
  }
  // ----- v10.9 📊: "shop opened" beacon for the developer's Dukaan wise report. Fire-and-forget, never blocks the page.
  // Anonymous random device id (this phone only) + the name the customer already typed at checkout, if any. At most once per 30 min per shop.
  function visitBeacon(){
    try {
      if (!S || !S.shop || !S.shop.slug) return;
      const vk = AK.SK("ak_visit_at"), t = Date.now(); if (t - Number(localStorage.getItem(vk) || 0) < 30*60000) return;
      let did = localStorage.getItem("ak_did");
      if (!/^[a-z0-9]{16,40}$/.test(did || "")) { const a = new Uint8Array(12); crypto.getRandomValues(a); did = [...a].map(x => x.toString(16).padStart(2, "0")).join(""); localStorage.setItem("ak_did", did); }
      const name = String((load("ak_customer", {}) || {}).name || (addrs[0] && addrs[0].name) || "").trim().slice(0, 40);
      localStorage.setItem(vk, String(t));
      fetch("/api/visit", {method: "POST", keepalive: true, credentials: "omit", headers: {"content-type": "application/json", "x-shop": S.shop.slug}, body: JSON.stringify({did, name})}).catch(() => {});
    } catch {}
  }
  // ----- offers strip (only offers the shop switched on and that are within their dates) -----
  let offerF = null;
  const offerById = id => (S.offers || []).find(o => o.id === id);
  const fmtDay = ms => new Date(ms).toLocaleDateString(AK.lang==="en"?"en-IN":"hi-IN", {day:"numeric", month:"short", timeZone:"Asia/Kolkata"});
  function renderOffers(){
    const list = S.offers || []; $("#offers").hidden = !list.length; if (!list.length) return;
    $("#offerStrip").innerHTML = list.map(o => {
      const title = nm(o, "title_hi", "title_en"), desc = nm(o, "desc_hi", "desc_en");
      const big = o.rule === "cart_flat" ? `₹${rupees(o.amount_off_paise)}<small>${AK.lang==="en"?"OFF":"छूट"}</small>` : o.rule === "cart_percent" ? `${o.percent_off}%<small>${esc(t("save"))}</small>` : o.rule === "free_delivery" ? `🛵<small>${AK.lang==="en"?"FREE":"फ्री"}</small>` : o.kind === "percent" ? `${o.percent_off}%<small>${esc(t("save"))}</small>` : o.kind === "price" ? `<small>${AK.lang==="en"?"Special":"ख़ास"}</small>${AK.lang==="en"?"price":"दाम"}` : "🏷️";
      const n = o.product_ids.length + (o.category_id ? 1 : 0);
      return `<button type="button" class="offer-card" data-offer="${o.id}" style="--oc:${esc(o.color || "#c2410c")}">
        ${o.image ? `<img src="${esc(o.image)}" alt="" loading="lazy" decoding="async">` : ""}
        <span class="oc-big" aria-hidden="true">${big}</span>
        <span class="oc-txt"><b>${esc(title)}</b>${desc ? `<small>${esc(desc)}</small>` : ""}${o.rule && o.min_cart_paise ? `<small>${AK.lang==="en" ? `On orders of ₹${rupees(o.min_cart_paise)}+` : `₹${rupees(o.min_cart_paise)} या ज़्यादा के ऑर्डर पर`}${o.rule === "cart_percent" && o.amount_off_paise ? (AK.lang==="en" ? ` · up to ₹${rupees(o.amount_off_paise)}` : ` · ₹${rupees(o.amount_off_paise)} तक`) : ""}</small>` : ""}
        <em>${o.ends_at ? esc((AK.lang==="en"?"Till ":"") + fmtDay(o.ends_at) + (AK.lang==="en"?"":" तक")) : ""}${n ? ` · ${AK.lang==="en"?"See items →":"सामान देखें →"}` : ""}</em></span>
        </button>`; }).join("");
  }
  function offerProducts(o){ return S.products.filter(p => o.product_ids.includes(p.id) || (o.category_id && p.category_id === o.category_id)); }
  // ----- My Orders badge + live order strip -----
  async function refreshMine(){
    AK.setBadge("orders", AK.cachedActiveCount());
    let mine; try { mine = await AK.fetchMine(); } catch { return; }
    lastMine = mine; renderRecent();
    const act = mine.filter(o => AK.ACTIVE.includes(o.status)); AK.setBadge("orders", act.length);
    const lo = $("#liveOrder"); const o = act[0];
    lo.hidden = !o; if (!o) return;
    lo.href = `/track#${o.code}.${o.token}`;
    lo.innerHTML = `<span class="lo-i" aria-hidden="true">${AK.ST_ICON[o.status]}</span><span><b>${esc(t("st_" + o.status))}</b><small>${esc(t("order_no"))} ${esc(o.code)} · ${money(o.total_paise)}${act.length > 1 ? ` · +${act.length-1}` : ""}</small></span><span class="lo-go">${AK.lang==="en"?"Track →":"देखें →"}</span>`;
    clearTimeout(refreshMine._t); refreshMine._t = setTimeout(refreshMine, 30000);
  }
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.type === "ak-push") refreshMine(); });
  function reconcile(){
    for (const id of Object.keys(cart)) {
      const x = byVariant.get(Number(id));
      if (!x || !x.v.in_stock) { notices[id] = t("unavailable"); delete cart[id]; continue; }
      if (cart[id].price !== x.v.price_paise) { notices[id] = t("price_changed", {a: rupees(cart[id].price), b: rupees(x.v.price_paise)}); cart[id].price = x.v.price_paise; }
      if (cart[id].qty > x.v.max_qty) { cart[id].qty = x.v.max_qty; notices[id] = t("only_left", {n: x.v.max_qty}); }
    }
    saveCart();
  }
  function renderShell(){
    const s = S.settings;
    const name = AK.lang==="en" ? (s.store_name_en || s.store_name_hi) : s.store_name_hi;
    const other = AK.lang==="en" ? s.store_name_hi : s.store_name_en;
    $("#storeName").textContent = name; $("#storeSub").textContent = other && other !== name ? other : "";
    const lg = $("#storeLogo"); if (lg) { lg.hidden = !s.logo; if (s.logo) lg.src = s.logo; }
    const fam = AK.familyOf(AK.shopType), ti = AK.TYPES[AK.shopType] || AK.TYPES.kirana;
    document.title = `${name} · ${fam === "kirana" ? (AK.lang==="en" ? "Groceries at home" : "घर बैठे किराना") : (AK.lang==="en" ? ti.short[1] : ti.short[0])}`;
    const tb = $("#typeBadge"); if (tb) { tb.hidden = false; tb.textContent = `${ti.icon} ${AK.lang==="en" ? ti.short[1] : ti.short[0]}`; } // v10.11: small type badge
    $("#footName").textContent = name; $("#footAddr").textContent = s.address || "";
    $("#tagline").textContent = AK.lang==="en" ? s.tagline_en : s.tagline_hi;
    
    const ann = AK.lang==="en" ? (s.announcement_en || s.announcement_hi) : (s.announcement_hi || s.announcement_en);
    $("#announce").hidden = !ann; $("#announce").textContent = ann || "";
    const st = s.status; const pill = $("#openPill");
    pill.className = "open-pill " + (st.open ? "is-open" : "is-closed");
    pill.textContent = st.open ? t("open_now") : (st.reason === "closed_today" ? t("closed_today") : t("closed_now"));
    AK.paintLang();
    const facts = [];
    if (s.open_time !== s.close_time) facts.push(`🕗 ${t("hours")}: ${esc(s.open_time)}–${esc(s.close_time)}`);
    const dt = AK.lang==="en" ? (s.delivery_time_en || s.delivery_time_hi) : (s.delivery_time_hi || s.delivery_time_en);
    if (dt) facts.push(`🛵 ${esc(dt)}`);
    if (fam === "service") facts.push(`💵 ${s.pay_upi_on_delivery ? L("कैश / UPI दुकान पर","Cash / UPI at the shop") : L("कैश दुकान पर","Pay cash at the shop")}`);
    else facts.push(`💵 ${s.pay_upi_on_delivery ? (AK.lang==="en"?"Cash / UPI on delivery":"कैश / UPI डिलीवरी पर") : (AK.lang==="en"?"Cash on delivery":"कैश ऑन डिलीवरी")}`);
    if (s.free_delivery_above_paise > 0) facts.push(`🎁 ${esc(t("free_above", {x: rupees(s.free_delivery_above_paise)}))}`);
    if (s.min_order_paise > 0) facts.push(`🧾 ${esc(t("min_order", {x: rupees(s.min_order_paise)}))}`);
    $("#facts").innerHTML = facts.map(f => `<li>${f}</li>`).join("");
    renderShopInfo();
  }
  // v10.8.1: 🏪 Dukaan ki jaankari — owner photo, name, call / WhatsApp, address + map (only what the shop filled in)
  function shopInfoHTML(){
    const o = (S.shop && S.shop.owner) || {}; if (!o.owner_name && !o.mobile) return "";
    const mob = String(o.mobile || "").replace(/\D/g, "").slice(-10), shopName = (S.shop && S.shop.name) || "";
    const map = o.address ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(o.address + " " + shopName) : "";
    return `<div class="si-head"><span class="si-av">${o.photo ? `<img src="${esc(o.photo)}" alt="" width="44" height="44" loading="lazy">` : "👤"}</span>
      <span class="si-who"><small>🏪 ${L("दुकान की जानकारी","Shop details")}</small><b>${esc(o.owner_name || "")}</b></span>
      ${mob ? `<span class="si-btns"><a class="si-btn" href="tel:+91${mob}" aria-label="${L("कॉल करें","Call")}">📞 ${L("कॉल","Call")}</a><a class="si-btn si-wa" href="https://wa.me/91${mob}" target="_blank" rel="noopener" aria-label="WhatsApp">💬 WhatsApp</a></span>` : ""}</div>
      ${o.address ? `<p class="si-addr">📍 ${esc(o.address)} <a href="${esc(map)}" target="_blank" rel="noopener">${L("मैप पे देखो","See on map")} ↗</a></p>` : ""}`;
  }
  function renderShopInfo(){ const el = $("#shopInfo"); if (!el) return; const h = shopInfoHTML(); el.hidden = !h; el.innerHTML = h; }
  function renderChips(){
    const used = new Set(S.products.map(p => p.category_id));
    const cats = S.categories.filter(c => used.has(c.id));
    $("#chips").innerHTML = `<button class="chip" type="button" data-cat="all" aria-pressed="${cat==="all"}">${esc(t("all"))}</button>` +
      (favs.size ? `<button class="chip chip-fav" type="button" data-cat="fav" aria-pressed="${cat==="fav"}">❤️ ${L("पसंदीदा","Favourites")} (${S.products.filter(p => favs.has(p.id)).length})</button>` : "") +
      cats.map(c => `<button class="chip" type="button" data-cat="${c.id}" aria-pressed="${String(cat)===String(c.id)}">${esc(c.icon)} ${esc(nm(c))}</button>`).join("");
  }
  const tints = ["#fdeeb5","#e3f2e1","#fde3cf","#e6effa","#f6e2ee","#eef3d6","#fbe7c6","#e0f1ee"];
  // v10.10: uploaded photo → AI product icon (icons.js, matched by name) → category icon → emoji
  const catOf = p => S.categories.find(c => c.id === p.category_id) || null;
  function tile(p){
    if (p.image) return `<img src="${esc(p.image)}" alt="" loading="lazy" decoding="async" width="300" height="246">`;
    if (window.AKIcons) return AKIcons.picHtml(p, catOf(p));
    return `<span class="emo" aria-hidden="true">${esc(p.icon || "🛍️")}</span>`;
  }
  function card(p){
    const vs = p.variants; const v0 = vs.find(v=>v.in_stock) || vs[0];
    const anyStock = vs.some(v=>v.in_stock); const multi = vs.length > 1;
    const inCart = !multi && cart[v0.id] ? cart[v0.id].qty : 0;
    const showMrp = v0.mrp_paise && v0.mrp_paise > v0.price_paise && !v0.base_price_paise;
    const pct = showMrp ? Math.round((1 - v0.price_paise / v0.mrp_paise) * 100) : 0;
    const was = !multi && v0.base_price_paise ? v0.base_price_paise : 0;
    const tint = tints[(p.category_id || p.id) % tints.length];
    let action;
    if (!anyStock) action = `<div class="off-tag">${esc(t("out_of_stock"))}</div>`;
    else if (multi) action = `<button class="add" type="button" data-open="${p.id}">${esc(t("choose"))} ▾</button>`;
    else if (inCart) action = stepper(v0.id, inCart);
    else action = `<button class="add" type="button" data-add="${v0.id}">+ ${esc(t("add"))}</button>`;
    return `<article class="card${anyStock?"":" off"}" data-pid="${p.id}">
      <div class="card-in">
        <button class="tile" type="button" data-open="${p.id}" style="--tint:${tint}" aria-label="${esc(nm(p))}">${tile(p)}
          ${pct>0 ? `<span class="save-pill">${pct}% ${esc(t("save"))}</span>` : ""}
          
          ${p.offer_id ? `<span class="offer-tag">🏷️ ${esc(t("offer_tag"))}</span>` : ""}</button>
        ${heart(p.id)}
        <h3>${esc(nm(p))}</h3>
        ${alt(p) ? `<p class="alt">${esc(alt(p))}</p>` : ""}
        <p class="unit">${multi ? `${vs.length} ${esc(t("sizes"))} · ${esc(vs.map(v=>v.label).join(", "))}` : esc(v0.label)}${v0.few_left && anyStock ? ` · <span class="few">${esc(t("few_left"))}</span>` : ""}</p>
        <div class="price-row"><span class="price">${multi ? (AK.lang==="en"?"from ":"") : ""}${money(Math.min(...vs.map(v=>v.price_paise)))}${multi && AK.lang!=="en" ? " से" : ""}</span>${was ? `<s class="was">${money(was)}</s>` : ""}${showMrp && !multi ? `<span class="mrp">MRP ${money(v0.mrp_paise)}</span>` : ""}</div>
        ${action}
      </div></article>`;
  }
  const heart = (pid, big) => `<button class="fav${big ? " big" : ""}" type="button" data-fav="${pid}" aria-pressed="${favs.has(pid)}" aria-label="${L("पसंदीदा","Favourite")}">${favs.has(pid) ? "❤️" : "🤍"}</button>`;
  const minPrice = p => Math.min(...p.variants.filter(v => v.in_stock).map(v => v.price_paise).concat(p.variants.some(v => v.in_stock) ? [] : p.variants.map(v => v.price_paise)));
  function sorted(list){
    if (!sortBy) return list; const inS = p => p.variants.some(v => v.in_stock) ? 0 : 1;
    const c = [...list];
    if (sortBy === "price_asc") c.sort((a,b) => inS(a)-inS(b) || minPrice(a)-minPrice(b));
    else if (sortBy === "price_desc") c.sort((a,b) => inS(a)-inS(b) || minPrice(b)-minPrice(a));
    else if (sortBy === "popular") c.sort((a,b) => inS(a)-inS(b) || (b.pop||0)-(a.pop||0) || (b.featured-a.featured));
    return c;
  }
  const stepper = (vid, qty) => `<div class="stepper" role="group" aria-label="Quantity"><button type="button" data-dec="${vid}" aria-label="−">−</button><b aria-live="polite">${qty}</b><button type="button" data-inc="${vid}" aria-label="+">+</button></div>`;
  function filtered(){
    if (offerF) { const o = offerById(offerF); if (o) return offerProducts(o); }
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return S.products.filter(p => (cat==="all" || (cat==="fav" ? favs.has(p.id) : String(p.category_id)===String(cat))) &&
      (!words.length || words.every(w => [p.name_hi,p.name_en,p.brand,p.description].join(" ").toLowerCase().includes(w))));
  }
  function renderProducts(){
    const list = sorted(filtered()); const box = $("#sections");
    if (!S.products.length) { box.innerHTML = `<p class="empty">${({food: L("होटल ने अभी मेन्यू नहीं डाला है।","The menu isn't added yet."), service: L("दुकान ने अभी सेवाएँ नहीं डाली हैं।","No services added yet.")})[AK.familyOf(AK.shopType)] || (AK.lang==="en"?"The shop hasn't added items yet.":"दुकान ने अभी सामान नहीं डाला है।")}</p>`; return; }
    if (!list.length && cat === "fav") { box.innerHTML = `<div class="empty-box"><span aria-hidden="true">🤍</span><p>${L("अभी कोई पसंदीदा नहीं। सामान पर 🤍 दबाएँ।","No favourites yet. Tap 🤍 on any item.")}</p></div>`; return; }
    if (!list.length && !offerF) { box.innerHTML = `<div class="empty-box"><span aria-hidden="true">🔍</span><p>${esc(t("no_results"))}</p>${q ? `<button class="btn btn-ghost" type="button" data-clear-q>${L("खोज हटाएँ","Clear search")}</button>` : ""}</div>`; return; }
    let html = "";
    const of = offerF && offerById(offerF);
    if (of) html = `<div class="offer-filter" style="--oc:${esc(of.color)}"><b>🏷️ ${esc(nm(of,"title_hi","title_en"))}</b><button type="button" class="chip" data-offer-clear>✕ ${AK.lang==="en"?"All items":"सारा सामान"}</button></div><div class="grid">${list.map(card).join("")}</div>`;
    else if (cat === "all" && !q && !sortBy) {
      const feat = list.filter(p => p.featured);
      if (feat.length) html += `<h2 class="cat-title">⭐ ${esc(t("featured"))}</h2><div class="grid">${feat.map(card).join("")}</div>`;
      for (const c of S.categories) { const ps = list.filter(p => p.category_id === c.id && !p.featured); if (ps.length) html += `<h2 class="cat-title">${esc(c.icon)} ${esc(nm(c))}${alt(c)?` <small>${esc(alt(c))}</small>`:""}</h2><div class="grid">${ps.map(card).join("")}</div>`; }
      const orphan = list.filter(p => !p.featured && !S.categories.some(c => c.id === p.category_id));
      if (orphan.length) html += `<h2 class="cat-title">${AK.shopType === "kirana" ? "🛍️" : AK.TYPES[AK.shopType].icon} ${AK.lang==="en"?"More":(({food:"और डिश", service:"और सेवाएँ"})[AK.familyOf(AK.shopType)] || "और सामान")}</h2><div class="grid">${orphan.map(card).join("")}</div>`;
    } else html = `<div class="grid">${list.map(card).join("")}</div>`;
    box.innerHTML = html;
    setupTilt();
  }
  function refreshCard(pid){ const el = document.querySelector(`.card[data-pid="${pid}"]`); const p = S.products.find(x=>x.id===pid); if (el && p) { el.outerHTML = card(p); setupTilt(); } }

  // ----- cart -----
  function setQty(vid, qty, fromEl){
    const x = byVariant.get(vid); if (!x) return;
    const prev = cart[vid]?.qty || 0;
    if (qty > x.v.max_qty) { toast(t("only_left", {n: x.v.max_qty})); qty = x.v.max_qty; }
    qty = Math.max(0, qty);
    if (qty) cart[vid] = {qty, price: x.v.price_paise}; else delete cart[vid];
    delete notices[vid]; saveCart();
    if (qty > prev && fromEl) fly(fromEl, x.p);
    refreshCard(x.p.id); renderCartBar(); if (!$("#sheet").hidden && sheetMode === "cart") renderCart();
    if (!$("#sheet").hidden && sheetMode === "product") renderProduct(x.p.id);
  }
  function totals(){
    let n = 0, sub = 0;
    for (const [id, c] of Object.entries(cart)) { const x = byVariant.get(Number(id)); if (!x) continue; n += c.qty; sub += x.v.price_paise * c.qty; }
    const s = S.settings; const normalFee = (s.free_delivery_above_paise > 0 && sub >= s.free_delivery_above_paise) ? 0 : (s.delivery_charge_paise || 0);
    // mirror of the server's cart offers (the server recomputes and decides at checkout)
    let disc = 0, dOffer = null, freeO = null, next = null;
    for (const o of (S.offers || [])) { if (!o.rule) continue;
      if (sub < (o.min_cart_paise || 0)) { if (o.rule !== "free_delivery" || normalFee) { const gap = o.min_cart_paise - sub; if (!next || gap < next.gap) next = {gap, o}; } continue; }
      let d = 0; if (o.rule === "cart_flat") d = Math.min(o.amount_off_paise, sub); else if (o.rule === "cart_percent") { d = Math.round(sub * o.percent_off / 100); if (o.amount_off_paise > 0) d = Math.min(d, o.amount_off_paise); }
      else if (o.rule === "free_delivery") { freeO = freeO || o; continue; }
      if (d > disc) { disc = d; dOffer = o; } }
    const fee = freeO || !deliverOrder() ? 0 : normalFee; // v10.11: restaurant parcel / table → no delivery fee (server does the same)
    return {n, sub, fee, disc, dOffer, freeO: freeO && normalFee ? freeO : null, next, total: sub - disc + fee};
  }
  const offerHint = nx => !nx ? "" : nx.o.rule === "free_delivery" ? L(`₹${rupees(nx.gap)} का और सामान लें — फ्री डिलीवरी`, `Add ₹${rupees(nx.gap)} more for free delivery`) : L(`₹${rupees(nx.gap)} का और सामान लें — ${nm(nx.o,"title_hi","title_en")}`, `Add ₹${rupees(nx.gap)} more — ${nm(nx.o,"title_hi","title_en")}`);
  function renderCartBar(){
    const {n, sub, next} = totals(); const bar = $("#cartbar");
    bar.hidden = n === 0; document.body.classList.toggle("has-cart", n > 0); AK.setBadge("cart", n);
    $("#cbCount").textContent = t("items_n", {n}); $("#cbTotal").textContent = money(sub);
    const s = S.settings; let hint = "";
    if (s.min_order_paise > sub) hint = t("add_more", {x: rupees(s.min_order_paise - sub)});
    else if (next) hint = offerHint(next);
    else if (s.free_delivery_above_paise > sub && s.delivery_charge_paise > 0) hint = t("free_above", {x: rupees(s.free_delivery_above_paise)});
    $("#cbHint").textContent = hint;
  }
  function fly(fromEl, p){
    const icon = $("#cbIcon"); if (!icon) return;
    const bump = () => { icon.classList.remove("bump"); void icon.offsetWidth; icon.classList.add("bump"); };
    const cardEl = fromEl.closest(".card"); if (cardEl && !reduced()) { cardEl.classList.remove("spin"); void cardEl.offsetWidth; cardEl.classList.add("spin"); }
    if (reduced() || $("#cartbar").hidden) { bump(); return; }
    const a = fromEl.getBoundingClientRect(), b = icon.getBoundingClientRect();
    const f = document.createElement("div"); f.className = "flyer"; const fi = !p.image && window.AKIcons && AKIcons.iconFor(p, catOf(p)); if (fi) { const im = new Image(); im.src = fi.src; im.alt = ""; im.className = "aki-fly"; f.appendChild(im); } else f.textContent = p.icon || "🛍️";
    f.style.left = (a.left + a.width/2 - 20) + "px"; f.style.top = (a.top + a.height/2 - 20) + "px"; document.body.appendChild(f);
    const dx = b.left - a.left - a.width/2 + 10, dy = b.top - a.top - a.height/2 + 10;
    const anim = f.animate([{transform:"translate(0,0) scale(1) rotate(0)"},{transform:`translate(${dx*0.45}px,${dy*0.15 - 90}px) scale(1.15) rotate(-20deg)`, offset:.45},{transform:`translate(${dx}px,${dy}px) scale(.35) rotate(20deg)`, opacity:.6}], {duration:650, easing:"cubic-bezier(.4,.1,.6,1)"});
    anim.onfinish = () => { f.remove(); bump(); };
  }

  // ----- sheet (product / cart / checkout / done) -----
  let sheetMode = null, lastFocus = null;
  function openSheet(mode){
    sheetMode = mode; if ($("#sheet").hidden) lastFocus = document.activeElement;
    $("#sheet").hidden = false; $("#sheetBack").hidden = false; document.body.classList.add("noscroll");
    $("#sheetBackBtn").hidden = mode !== "checkout";
    setTimeout(()=>$("#sheetClose").focus(), 50);
  }
  function closeSheet(){ $("#sheet").hidden = true; $("#sheetBack").hidden = true; document.body.classList.remove("noscroll"); sheetMode = null; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function renderProduct(pid){
    const p = S.products.find(x=>x.id===pid); if (!p) return;
    $("#sheetTitle").textContent = nm(p);
    $("#sheetBody").innerHTML = `<div class="pd">
      <div class="pd-tile" style="--tint:${tints[(p.category_id||p.id)%tints.length]}">${tile(p)}${heart(p.id, true)}</div>
      ${alt(p) ? `<p class="alt">${esc(alt(p))}</p>` : ""}${p.brand ? `<p class="brand">${esc(p.brand)}</p>` : ""}
      ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ""}
      <ul class="variants">${p.variants.map(v => { const c = cart[v.id]?.qty || 0; const mrp = v.mrp_paise && v.mrp_paise > v.price_paise;
        return `<li><div><b>${esc(v.label)}</b><span class="price">${money(v.price_paise)}</span>${v.base_price_paise?`<s class="was">${money(v.base_price_paise)}</s> <span class="offer-tag inline">🏷️ ${esc(t("offer_tag"))}</span>`:mrp?`<span class="mrp">MRP ${money(v.mrp_paise)}</span>`:""}${v.few_left?` <span class="few">${esc(t("few_left"))}</span>`:""}</div>
        ${!v.in_stock ? `<span class="off-tag sm">${esc(t("out_of_stock"))}</span>` : c ? stepper(v.id, c) : `<button class="add sm" type="button" data-add="${v.id}">+ ${esc(t("add"))}</button>`}</li>`; }).join("")}</ul>
      <button class="btn btn-primary btn-block" type="button" data-go="cart">${esc(t("view_cart"))}</button>
      ${similarHtml(p)}</div>`;
  }
  function similarHtml(p){
    const words = new Set([p.name_en, p.brand].join(" ").toLowerCase().split(/\W+/).filter(w => w.length > 2));
    const score = x => (x.category_id === p.category_id ? 2 : 0) + [x.name_en, x.brand].join(" ").toLowerCase().split(/\W+/).filter(w => words.has(w)).length + (x.variants.some(v => v.in_stock) ? 1 : -3);
    const list = S.products.filter(x => x.id !== p.id).map(x => [score(x), x]).filter(([s]) => s >= 2).sort((a,b) => b[0]-a[0] || (b[1].pop||0)-(a[1].pop||0)).slice(0, 8).map(x => x[1]);
    if (!list.length) return "";
    return `<h3 class="sim-h">${L("मिलते-जुलते सामान","Similar items")}</h3><div class="hscroll">${list.map(miniCard).join("")}</div>`;
  }
  function miniCard(p){
    const v = p.variants.find(v => v.in_stock) || p.variants[0]; const multi = p.variants.length > 1; const c = cart[v.id]?.qty || 0;
    return `<div class="mini-card"><button type="button" class="mc-tile" data-open="${p.id}" style="--tint:${tints[(p.category_id||p.id)%tints.length]}" aria-label="${esc(nm(p))}">${tile(p)}</button>
      <b>${esc(nm(p))}</b><small>${esc(v.label)} · ${money(v.price_paise)}</small>
      ${!v.in_stock ? `<span class="off-tag sm">${esc(t("out_of_stock"))}</span>` : multi ? `<button class="add sm" type="button" data-open="${p.id}">${esc(t("choose"))}</button>` : c ? stepper(v.id, c) : `<button class="add sm" type="button" data-add="${v.id}">+ ${esc(t("add"))}</button>`}</div>`;
  }
  function renderCart(){
    $("#sheetTitle").textContent = t("cart");
    const ids = Object.keys(cart);
    const nb = Object.entries(notices).filter(([id]) => !cart[id]).map(([,m]) => `<p class="notice">⚠️ ${esc(m)}</p>`).join("");
    if (!ids.length) { $("#sheetBody").innerHTML = nb + `<div class="empty-cart"><span>🧺</span><p>${esc(t("cart_empty"))}</p><button class="btn btn-primary" type="button" data-close>${esc(t("shop_more"))}</button></div>`; return; }
    const {sub, fee, total, disc, dOffer, freeO, next} = totals(); const s = S.settings;
    const lines = ids.map(id => { const x = byVariant.get(Number(id)); const c = cart[id]; return `<div class="line">
      <span class="le">${x.p.image ? `<img src="${esc(x.p.image)}" alt="">` : window.AKIcons ? AKIcons.picHtml(x.p, catOf(x.p), {emoji: e => esc(e)}) : esc(x.p.icon)}</span>
      <span class="ln"><b>${esc(nm(x.p))}</b><small>${esc(x.v.label)} · ${money(x.v.price_paise)}</small>${notices[id]?`<small class="warn">⚠️ ${esc(notices[id])}</small>`:""}</span>
      ${stepper(Number(id), c.qty)}<span class="lt">${money(x.v.price_paise*c.qty)}</span></div>`; }).join("");
    const below = s.min_order_paise > sub;
    const closed = !s.status.open;
    $("#sheetBody").innerHTML = nb + lines + `<div class="bill">
      <div><span>${esc(t("subtotal"))}</span><span>${money(sub)}</span></div>
      ${disc ? `<div class="disc"><span>🏷️ ${esc(nm(dOffer,"title_hi","title_en"))}</span><span>− ${money(disc)}</span></div>` : ""}
      <div><span>${esc(t("delivery"))}${freeO ? ` <small class="ok">🏷️ ${esc(nm(freeO,"title_hi","title_en"))}</small>` : ""}</span><span>${fee ? money(fee) : esc(t("free"))}</span></div>
      <div class="tot"><span>${esc(t("total"))}</span><span>${money(total)}</span></div></div>
      ${next && !below ? `<p class="hint offer-nudge">🎁 ${esc(offerHint(next))}</p>` : ""}
      <p class="hint">${L("आख़िरी रक़म दुकान का सर्वर ऑर्डर भेजते समय पक्की करता है।","The final amount is confirmed by the shop's server when you place the order.")}</p>
      ${below ? `<p class="notice">${esc(t("min_order",{x:rupees(s.min_order_paise)}))} · ${esc(t("add_more",{x:rupees(s.min_order_paise-sub)}))}</p>` : ""}
      ${closed ? `<p class="notice">🔒 ${esc(t("closed_msg"))}</p>` : ""}
      <button class="btn btn-primary btn-block" type="button" data-go="checkout" ${below||closed?"disabled":""}>${esc(t("checkout"))} →</button>`;
  }
  const draft = load("ak_customer", {});
  // v10.11: restaurant orders — 🥡 parcel / 🛵 delivery / 🍽️ table. Every other shop type is delivery, exactly as before.
  const isFood = () => !!(S && S.shop && S.shop.type === "restaurant");
  const OTYPES = [["parcel","🥡","पार्सल","Parcel"],["delivery","🛵","डिलीवरी","Delivery"],["table","🍽️","टेबल पर","Table"]];
  const orderType = () => isFood() ? (OTYPES.some(o => o[0] === draft.otype) ? draft.otype : "parcel") : "delivery";
  const isSvcShop = () => AK.familyOf(AK.shopType) === "service"; // v10.13: salon / service = walk-in booking, no address
  // v10.13: the shop's QR poster opens /s/<slug>?src=qr → a walk-in (straight into the queue). The /s/ link from home = online request.
  try { if (new URLSearchParams(location.search).get("src") === "qr") sessionStorage.setItem(AK.SK("ak_src"), "walkin"); } catch {}
  const bookSource = () => { try { return sessionStorage.getItem(AK.SK("ak_src")) === "walkin" ? "walkin" : "online"; } catch { return "online"; } };
  const deliverOrder = () => !isSvcShop() && orderType() === "delivery";
  function field(id, key, type="text", opt=false, extra=""){ return `<label for="${id}">${esc(t(key))} ${opt?`<small>${esc(t("optional"))}</small>`:""}</label>${type==="textarea" ? `<textarea id="${id}" name="${id}" ${extra}>${esc(draft[id]||"")}</textarea>` : `<input id="${id}" name="${id}" type="${type}" value="${esc(draft[id]||"")}" ${extra}>`}<p class="ferr" id="e_${id}"></p>`; }
  // v10.12: remember the customer (name + phone) on this phone for every shop — prefilled at checkout, with "Not you? Change"
  const ME_KEY = "cust._me";
  const loadMe = () => { try { const m = JSON.parse(localStorage.getItem(ME_KEY) || "null"); return m && m.name ? m : null; } catch { return null; } };
  function renderCheckout(){
    $("#sheetTitle").textContent = t("details");
    const meSaved = loadMe(); if (meSaved && !draft.name && !draft.phone && !draft._notme) { draft.name = meSaved.name; draft.phone = meSaved.phone || ""; }
    const showMe = meSaved && draft.name && draft.name === meSaved.name;
    const s = S.settings; const {total} = totals();
    if (!sessionStorage.getItem("ak_idem")) sessionStorage.setItem("ak_idem", [...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,"0")).join(""));
    const locs = s.delivery_localities || [], pins = s.delivery_pincodes || [];
    if (area) { if (area.pin && !draft.pincode) draft.pincode = area.pin; if (area.loc && !draft.locality) draft.locality = area.loc; }
    const pays = []; if (s.pay_cod) pays.push(["cod", t("cod"), "💵"]); if (s.pay_upi_on_delivery) pays.push(["upi_on_delivery", t("upi") + (s.upi_id?` (${s.upi_id})`:""), "📲"]);
    $("#sheetBody").innerHTML = `<form class="form" id="coForm" novalidate>
      ${isFood() ? `<fieldset class="otype"><legend>${L("ऑर्डर कैसे चाहिए?","How do you want it?")}</legend><div class="otype-row">${OTYPES.map(o => `<label class="otype-opt"><input type="radio" name="otype" value="${o[0]}" ${orderType() === o[0] ? "checked" : ""}><i class="ring" aria-hidden="true"></i><span aria-hidden="true">${o[1]}</span><b>${L(o[2], o[3])}</b></label>`).join("")}</div></fieldset>` : ""}
      ${orderType() === "table" ? field("table_no","f_table","text",false,`required maxlength="8" autocomplete="off" placeholder="${L("जैसे 4","e.g. 4")}"`) : ""}
      ${addrs.length ? `<label for="savedAddr">${L("सेव किया पता","Saved address")}</label><select id="savedAddr"><option value="">${L("— नया पता लिखें —","— type a new address —")}</option>${addrs.map((a,i) => `<option value="${i}" ${draft.address === a.address && draft.name === a.name ? "selected" : ""}>${esc(a.name)} · ${esc(a.address.slice(0,40))}${a.pincode ? " · " + esc(a.pincode) : ""}</option>`).join("")}</select>` : ""}
      ${showMe ? `<p class="me-row"><span aria-hidden="true">👋</span> ${L("नमस्ते","Hi")} <b>${esc(meSaved.name)}</b> <button type="button" class="linkbtn" id="notMe">${L("आप नहीं? बदलें","Not you? Change")}</button></p>` : ""}
      ${field("name","f_name","text",false,'autocomplete="name" required maxlength="60"')}
      ${field("phone","f_phone","tel",false,'autocomplete="tel" inputmode="numeric" required maxlength="14" placeholder="98XXXXXXXX"')}
      ${deliverOrder() ? `${field("address","f_address","textarea",false,'required maxlength="300" autocomplete="street-address"')}
      ${locs.length && !pins.length ? `<label for="locality">${esc(t("f_locality"))}</label><select id="locality" name="locality" required><option value="">—</option>${locs.map(l=>`<option ${draft.locality===l?"selected":""}>${esc(l)}</option>`).join("")}</select><p class="ferr" id="e_locality"></p>` : field("locality","f_locality","text",true,'maxlength="80"')}
      ${field("pincode","f_pincode","text",!pins.length,`inputmode="numeric" maxlength="6" ${pins.length?"required":""}`)}
      ${pins.length ? `<p class="hint">${AK.lang==="en"?"We deliver to":"डिलीवरी इन पिन कोड पर"}: ${esc(pins.join(", "))}</p>` : ""}
      ${field("landmark","f_landmark","text",true,'maxlength="120"')}` : ""}
      ${field("instructions","f_note","textarea",true,'maxlength="300"')}
      <fieldset class="pay"><legend>${esc(t("pay"))}</legend>${pays.map((p,i)=>`<label class="payopt"><input type="radio" name="pm" value="${p[0]}" ${i===0?"checked":""}><span>${p[2]}</span> ${esc(p[1])}</label>`).join("")}</fieldset>
      <p class="hint">${esc(t("pending_note"))}</p>
      <p class="err" id="coErr" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit" id="placeBtn">${esc(t("place"))} · ${money(total)}</button></form>`;
    $("#coForm").addEventListener("change", e => { if (e.target.name === "otype") { draft.otype = e.target.value; localStorage.setItem(AK.SK("ak_customer"), JSON.stringify(draft)); renderCheckout(); const r = document.querySelector(`#coForm input[name="otype"][value="${draft.otype}"]`); if (r) r.focus(); } });
    $("#coForm").addEventListener("input", e => { if (e.target.name && e.target.name !== "pm" && e.target.name !== "otype") { draft[e.target.name] = e.target.value; localStorage.setItem(AK.SK("ak_customer"), JSON.stringify(draft)); } });
    $("#coForm").addEventListener("submit", submitOrder);
    const nm = $("#notMe"); if (nm) nm.onclick = () => { try { localStorage.removeItem(ME_KEY); } catch {} draft.name = ""; draft.phone = ""; draft._notme = 1; localStorage.setItem(AK.SK("ak_customer"), JSON.stringify(draft)); renderCheckout(); const n = $("#name"); if (n) n.focus(); };
    const sa = $("#savedAddr"); if (sa) sa.onchange = () => { const a = addrs[Number(sa.value)]; if (!a) return; Object.assign(draft, a); localStorage.setItem(AK.SK("ak_customer"), JSON.stringify(draft)); renderCheckout(); };
  }
  async function submitOrder(e){
    e.preventDefault(); const f = e.target; const btn = $("#placeBtn"); $("#coErr").textContent = "";
    f.querySelectorAll(".ferr").forEach(x => x.textContent = "");
    const val = n => (f.elements[n]?.value || "").trim();
    let bad = false; const need = (n, msg) => { if (!val(n)) { $("#e_"+n).textContent = msg || t("required"); bad = true; } };
    need("name"); if (deliverOrder()) need("address");
    if (orderType() === "table") { need("table_no"); if (val("table_no") && !/^[A-Za-z0-9][A-Za-z0-9 -]{0,7}$/.test(val("table_no"))) { $("#e_table_no").textContent = L("सिर्फ़ नंबर/अक्षर","Numbers or letters only"); bad = true; } }
    const ph = val("phone").replace(/\D/g,"").replace(/^(91|0)(?=\d{10}$)/,""); if (!/^[6-9]\d{9}$/.test(ph)) { $("#e_phone").textContent = t("invalid_phone"); bad = true; }
    if (f.elements.pincode?.required) need("pincode"); if (val("pincode") && !/^\d{6}$/.test(val("pincode"))) { $("#e_pincode").textContent = "6 digits"; bad = true; }
    if (f.elements.locality?.required) need("locality");
    if (bad) { f.querySelector(".ferr:not(:empty)")?.previousElementSibling?.focus?.(); return; }
    btn.disabled = true; btn.textContent = t("placing");
    const items = Object.entries(cart).map(([id, c]) => ({variant_id: Number(id), qty: c.qty, price_paise: c.price}));
    try {
      const r = await api("/api/orders", {method:"POST", body:{ idempotency_key: sessionStorage.getItem("ak_idem"), name: val("name"), phone: val("phone"), address: val("address"), locality: val("locality"), pincode: val("pincode"), landmark: val("landmark"), instructions: val("instructions"), payment_method: f.elements.pm?.value || "cod", items, ...(isFood() ? {order_type: orderType(), table_no: orderType() === "table" ? val("table_no") : ""} : {}), ...(isSvcShop() ? {source: bookSource()} : {}) }});
      sessionStorage.removeItem("ak_idem");
      try { localStorage.setItem(ME_KEY, JSON.stringify({name: val("name"), phone: ph})); delete draft._notme; } catch {}
      const mine = load("ak_orders", []); if (r.token) { mine.unshift({code: r.order.code, token: r.token, at: r.order.created_at, total: r.order.total_paise}); localStorage.setItem(AK.SK("ak_orders"), JSON.stringify(mine.slice(0,20))); }
      const tok = r.token || (mine.find(o=>o.code===r.order.code)||{}).token;
      if (deliverOrder()) rememberAddr({name: val("name"), phone: val("phone"), address: val("address"), locality: val("locality"), pincode: val("pincode"), landmark: val("landmark")});
      // v10.13: salon / service booking → straight to the live token screen (the same private track link, reopenable from "My bookings")
      if (isSvcShop() && r.order.source && tok) { cart = {}; saveCart(); renderCartBar(); location.href = `/track?s=${encodeURIComponent(AK.SHOP.slug || "")}#${r.order.code}.${tok}`; return; }
      cart = {}; saveCart(); renderCartBar(); renderDone(r.order, tok, {otype: isFood() ? orderType() : "", table_no: val("table_no"), address: val("address"), landmark: val("landmark"), instructions: val("instructions"), phone: ph});
      if (S) { S = await api("/api/store").catch(()=>S); byVariant = new Map(); for (const p of S.products) for (const v of p.variants) byVariant.set(v.id, {p, v}); renderProducts(); }
    } catch (err) {
      btn.disabled = false; btn.textContent = `${t("place")} · ${money(totals().total)}`;
      if (err.code === "cart_changed" || err.code === "store_closed" || err.code === "below_minimum") {
        try { S = await api("/api/store"); byVariant = new Map(); for (const p of S.products) for (const v of p.variants) byVariant.set(v.id, {p, v}); } catch {}
        for (const pr of (err.data.problems || [])) { const id = pr.variant_id; if (!id) continue;
          if (pr.problem === "price_changed") notices[id] = t("price_changed", {a: rupees(pr.was_paise), b: rupees(pr.price_paise)});
          else if (pr.problem === "stock") notices[id] = pr.available ? t("only_left", {n: pr.available}) : t("out_of_stock");
          else notices[id] = t("unavailable"); }
        reconcile(); renderShell(); renderProducts(); renderCartBar(); toast(err.code === "store_closed" ? t("closed_msg") : t("cart_changed")); openSheet("cart"); renderCart(); return;
      }
      if (err.code === "service_paused") { location.reload(); return; }
      if (err.code === "outside_area") { $("#coErr").textContent = t("outside_area") + (err.data.pincodes ? " (" + err.data.pincodes.join(", ") + ")" : ""); return; }
      if (err.code === "invalid_phone") { $("#e_phone").textContent = t("invalid_phone"); return; }
      $("#coErr").textContent = err.message;
    }
  }
  function rememberAddr(a){
    addrs = addrs.filter(x => !(x.address === a.address && x.pincode === a.pincode && x.name === a.name)); addrs.unshift(a); saveAddrs();
  }
  function waText(o, extra){
    const s = S.settings; const L = [];
    L.push(`🛒 *${AK.lang==="en"?"New order":"नया ऑर्डर"} ${o.code}*`); L.push(s.store_name_hi + (s.store_name_en ? ` (${s.store_name_en})` : "")); L.push("");
    o.items.forEach((i,n) => L.push(`${n+1}. ${i.product_name}${i.product_name_en?` / ${i.product_name_en}`:""} (${i.variant_label}) × ${i.qty} = ₹${rupees(i.line_total_paise)}`));
    L.push(""); L.push(`${t("subtotal")}: ₹${rupees(o.subtotal_paise)}`); if (o.discount_paise) L.push(`${o.discount_title || (AK.lang==="en"?"Discount":"छूट")}: −₹${rupees(o.discount_paise)}`); L.push(`${t("delivery")}: ${o.delivery_paise ? "₹"+rupees(o.delivery_paise) : t("free")}`); L.push(`*${t("total")}: ₹${rupees(o.total_paise)}*`);
    L.push(`${t("pay")}: ${o.payment_method === "cod" ? "Cash on Delivery" : "UPI on delivery"}`); L.push("");
    L.push(`${AK.lang==="en"?"Name":"नाम"}: ${o.customer_name}`); L.push(`${AK.lang==="en"?"Mobile":"मोबाइल"}: ${extra.phone}`);
    if (o.order_type === "table") L.push(`🍽️ ${AK.lang==="en"?"Table":"टेबल"}: ${o.table_no}`); else if (o.order_type === "parcel") L.push(`🥡 ${AK.lang==="en"?"Parcel (pick up)":"पार्सल (ले जाएँगे)"}`);
    else L.push(`${AK.lang==="en"?"Address":"पता"}: ${[extra.address, o.locality, o.pincode].filter(Boolean).join(", ")}`);
    if (extra.landmark) L.push(`${AK.lang==="en"?"Landmark":"निशानी"}: ${extra.landmark}`); if (extra.instructions) L.push(`${AK.lang==="en"?"Note":"नोट"}: ${extra.instructions}`);
    return L.join("\n");
  }
  function renderDone(o, token, extra){
    openSheet("done"); $("#sheetTitle").textContent = t("sent"); $("#sheetBackBtn").hidden = true;
    const s = S.settings; const text = encodeURIComponent(waText(o, extra));
    const wa = s.whatsapp ? `https://wa.me/91${s.whatsapp}?text=${text}` : `https://wa.me/?text=${text}`;
    $("#sheetBody").innerHTML = `<div class="done"><span class="big" aria-hidden="true">✅</span>
      <h3>${esc(t("sent"))}</h3><p>${esc(t("order_no"))}: <b class="code">${esc(o.code)}</b> · ${money(o.total_paise)}</p>${o.discount_paise ? `<p class="ok">🏷️ ${esc(o.discount_title)}: − ${money(o.discount_paise)}</p>` : ""}
      <p class="status-chip st-pending">⏳ ${esc(t("status_pending"))}</p><p class="hint">${esc(t("pending_note"))}</p>
      ${token ? `<div id="notifBox"></div>` : ""}
      <a class="btn btn-wa btn-block" id="waBtn" href="${esc(wa)}" target="_blank" rel="noopener">💬 ${esc(s.whatsapp ? t("wa_shop") : t("wa_share"))}</a>
      ${token ? `<a class="btn btn-primary btn-block" href="/track">📦 ${esc(t("my_orders"))} — ${esc(t("track"))}</a>` : ""}
      ${s.phone ? `<a class="btn btn-ghost btn-block" href="tel:+91${esc(s.phone)}">📞 ${esc(t("call_shop"))}</a>` : ""}
      <button class="btn btn-ghost btn-block" type="button" data-close>${esc(t("shop_more"))}</button></div>`;
    if (token) AK.notifyBox($("#notifBox"), {code: o.code, token});
    refreshMine();
  }

  // ----- v4: delivery check (PIN / locality, saved on this phone) + delivery facts on home -----
  function areaResult(pin, loc){
    const s = S.settings, pins = s.delivery_pincodes || [], locs = s.delivery_localities || [];
    if (pins.length) return /^\d{6}$/.test(pin || "") ? (pins.includes(pin) ? "yes" : "no") : "invalid";
    if (locs.length) return loc ? (locs.some(l => l.toLowerCase() === String(loc).toLowerCase()) ? "yes" : "no") : "invalid";
    return "yes";
  }
  function renderDelivery(edit){
    const box = $("#delivery"); if (!box) return;
    if (AK.familyOf(AK.shopType) === "service") { box.hidden = true; return; } // v10.11: no "home delivery" card on salon / clinic / repair / other pages
    const s = S.settings, pins = s.delivery_pincodes || [], locs = s.delivery_localities || [];
    const dt = AK.lang==="en" ? (s.delivery_time_en || s.delivery_time_hi) : (s.delivery_time_hi || s.delivery_time_en);
    const chips = [];
    chips.push(`🛵 ${dt ? esc(dt) : L("डिलीवरी दुकान से","Delivered by the shop")}`);
    chips.push(`💰 ${s.delivery_charge_paise ? L(`डिलीवरी ₹${rupees(s.delivery_charge_paise)}`, `Delivery ₹${rupees(s.delivery_charge_paise)}`) : L("डिलीवरी फ्री","Free delivery")}${s.delivery_charge_paise && s.free_delivery_above_paise ? L(` · ₹${rupees(s.free_delivery_above_paise)}+ पर फ्री`, ` · free above ₹${rupees(s.free_delivery_above_paise)}`) : ""}`);
    chips.push(`🧾 ${s.min_order_paise ? L(`कम से कम ऑर्डर ₹${rupees(s.min_order_paise)}`, `Min order ₹${rupees(s.min_order_paise)}`) : L("कोई न्यूनतम ऑर्डर नहीं","No minimum order")}`);
    const fd = (S.offers || []).find(o => o.rule === "free_delivery"); if (fd) chips.push(`🎁 ${esc(nm(fd,"title_hi","title_en"))}`);
    const res = area ? areaResult(area.pin, area.loc) : null;
    let top;
    if (area && !edit && res !== "invalid") {
      const where = esc(area.pin || area.loc);
      top = res === "yes" ? `<p class="dl-res ok">✅ <b>${L("डिलीवरी उपलब्ध","Delivery available")}</b> · ${where} <button type="button" class="linkish" data-area-edit>${L("बदलें","Change")}</button></p>`
        : `<p class="dl-res no">❌ <b>${L("यहाँ डिलीवरी नहीं","Not available here")}</b> · ${where} <button type="button" class="linkish" data-area-edit>${L("बदलें","Change")}</button></p><p class="hint">${pins.length ? L("डिलीवरी इन पिन कोड पर: ","We deliver to: ") + esc(pins.join(", ")) : L("डिलीवरी इन इलाकों में: ","We deliver to: ") + esc(locs.join(", "))}${s.phone ? ` · <a href="tel:+91${esc(s.phone)}">📞 ${L("दुकान से पूछें","Ask the shop")}</a>` : ""}</p>`;
    } else if (!pins.length && !locs.length) {
      top = `<p class="dl-res ok">✅ <b>${L("आस-पास होम डिलीवरी","Home delivery nearby")}</b></p>`;
    } else {
      top = `<form class="dl-form" id="dlForm"><label for="dlIn">📍 ${L("आपके यहाँ डिलीवरी होगी?","Do we deliver to you?")}</label><div class="dl-row">
        ${pins.length ? `<input id="dlIn" inputmode="numeric" maxlength="6" placeholder="${L("अपना पिन कोड","Your PIN code")}" value="${esc(area?.pin || "")}" autocomplete="postal-code">`
          : `<select id="dlIn"><option value="">${L("अपना इलाका चुनें","Choose your area")}</option>${locs.map(l => `<option ${area?.loc === l ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`}
        <button class="btn btn-primary" type="submit">${L("जाँचें","Check")}</button></div><p class="ferr" id="dlErr"></p></form>`;
    }
    box.innerHTML = top + `<ul class="dl-chips">${chips.map(c => `<li>${c}</li>`).join("")}</ul>`;
    const f = $("#dlForm"); if (f) f.onsubmit = e => { e.preventDefault(); const v = $("#dlIn").value.trim();
      const a = pins.length ? {pin: v} : {loc: v}; const r = areaResult(a.pin, a.loc);
      if (r === "invalid") { $("#dlErr").textContent = pins.length ? L("6 अंकों का पिन कोड लिखें","Enter a 6-digit PIN code") : L("इलाका चुनें","Choose your area"); return; }
      area = {...a, ok: r === "yes", at: Date.now()}; localStorage.setItem(AK.SK("ak_area"), JSON.stringify(area)); renderDelivery(); };
  }
  // ----- v4: "पिछली बार का सामान" — products from this phone's own past orders -----
  function renderRecent(){
    const box = $("#recent"); if (!box || !S) return;
    const seen = new Set(); const list = [];
    for (const o of lastMine) for (const vid of (o.vids || [])) { const x = byVariant.get(vid); if (x && !seen.has(x.p.id)) { seen.add(x.p.id); list.push(x.p); } }
    box.hidden = !list.length; if (!list.length) return;
    box.innerHTML = `<h2 class="cat-title">🛍️ ${L("पिछली बार का सामान","Bought before")}</h2><div class="hscroll">${list.slice(0, 12).map(miniCard).join("")}</div>`;
  }
  function renderReviews(){
    const box = $("#reviews"); if (!box) return; const r = S.reviews;
    box.hidden = !(r && r.count); if (box.hidden) return;
    const st = n => "★".repeat(n) + "☆".repeat(5-n);
    box.innerHTML = `<h2 class="cat-title">⭐ ${L("ग्राहकों की राय","What customers say")} <small>${r.avg}/5 · ${r.count} ${L("रेटिंग","ratings")}</small></h2>
      ${r.recent.length ? `<div class="hscroll">${r.recent.map(x => `<figure class="rv-card"><span class="stars" aria-label="${x.stars}/5">${st(x.stars)}</span><blockquote>${esc(x.comment)}</blockquote><figcaption>— ${esc(x.name)}</figcaption></figure>`).join("")}</div>` : ""}`;
  }
  // ----- v4: profile sheet (this phone only) -----
  function renderProfile(){
    openSheet("profile"); $("#sheetTitle").textContent = L("मेरी जानकारी (इस फ़ोन पर)","My details (this phone)");
    const favList = S.products.filter(p => favs.has(p.id));
    const si = shopInfoHTML();
    $("#sheetBody").innerHTML = `<div class="prof">${si ? `<div class="shop-info in-sheet">${si}</div>` : ""}
      <p class="hint">${L("कोई अकाउंट या OTP नहीं। आपका पता, पसंदीदा सामान और ऑर्डर की लिस्ट सिर्फ़ इसी फ़ोन में रहते हैं।","No account or OTP. Your addresses, favourites and order list stay on this phone only.")}</p>
      <h3>📍 ${L("सेव किए पते","Saved addresses")}</h3>
      ${addrs.length ? addrs.map((a,i) => `<div class="addr"><span><b>${esc(a.name)}</b> · ${esc(a.phone)}<br><small>${esc([a.address, a.landmark, a.locality, a.pincode].filter(Boolean).join(", "))}</small></span><button type="button" class="mini" data-addr-del="${i}" aria-label="${L("हटाएँ","Delete")}">🗑</button></div>`).join("") : `<p class="hint">${L("ऑर्डर करते ही पता यहाँ सेव हो जाएगा।","Your address is saved here when you order.")}</p>`}
      <h3>❤️ ${L("पसंदीदा","Favourites")} (${favList.length})</h3>
      ${favList.length ? `<div class="hscroll">${favList.map(miniCard).join("")}</div>` : `<p class="hint">${L("सामान पर 🤍 दबाएँ।","Tap 🤍 on any item.")}</p>`}
      <h3>📦 ${L("ऑर्डर","Orders")}</h3><a class="btn btn-ghost btn-block" href="/track">${esc(t("my_orders"))} →</a>
      ${area ? `<h3>🛵 ${L("डिलीवरी इलाका","Delivery area")}</h3><p>${esc(area.pin || area.loc)} <button type="button" class="linkish" data-area-edit>${L("बदलें","Change")}</button></p>` : ""}
      <h3>🔐 ${L("निजता","Privacy")}</h3>
      <button type="button" class="btn btn-danger btn-block" id="wipe">🗑 ${L("मेरा डेटा हटाएं (इस फ़ोन से)","Clear my data (this phone)")}</button>
      <p class="hint">${L("इससे इस फ़ोन से पते, पसंदीदा, कार्ट और ऑर्डर की लिस्ट हट जाएगी। दुकान के पास भेजे गए ऑर्डर का रिकॉर्ड रहता है — उसे हटवाने के लिए दुकान से बात करें।","This removes addresses, favourites, cart and the order list from this phone. Orders already sent stay in the shop's records — ask the shop to delete them.")}</p>
      <p><a href="/info">${esc(t("info_link"))}</a></p></div>`;
    $("#wipe").onclick = () => {
      if (!confirm(L("इस फ़ोन से सारी जानकारी हटाएँ? ऑर्डर ट्रैक करने के लिंक भी हट जाएँगे।","Clear everything from this phone? Order tracking links will be removed too."))) return;
      ["ak_cart","ak_orders","ak_order_status","ak_customer","ak_addrs","ak_favs","ak_area"].forEach(k => localStorage.removeItem(AK.SK(k))); localStorage.removeItem("cust._me");
      cart = {}; favs = new Set(); addrs = []; area = null; lastMine = []; for (const k of Object.keys(draft)) delete draft[k];
      closeSheet(); renderDelivery(); renderChips(); renderProducts(); renderCartBar(); renderRecent(); AK.setBadge("orders", 0); $("#liveOrder").hidden = true;
      toast(L("इस फ़ोन से आपका डेटा हट गया ✅","Your data was cleared from this phone ✅"));
    };
  }

  // ----- 3D tilt (pointer devices) + hero pause -----
  function setupTilt(){
    if (reduced() || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    document.querySelectorAll(".card:not([data-tilt])").forEach(c => { c.dataset.tilt = 1; const inner = c.firstElementChild;
      c.addEventListener("pointermove", e => { const r = c.getBoundingClientRect(); const x = (e.clientX - r.left)/r.width - .5, y = (e.clientY - r.top)/r.height - .5; inner.style.transform = `rotateY(${x*14}deg) rotateX(${-y*14}deg) translateZ(4px)`; });
      c.addEventListener("pointerleave", () => inner.style.transform = ""); });
  }
  if ("IntersectionObserver" in window) new IntersectionObserver(es => es.forEach(e => document.body.classList.toggle("paused", !e.isIntersecting))).observe($("#heroStage"));
  document.addEventListener("visibilitychange", () => document.body.classList.toggle("paused", document.hidden));

  // ----- events -----
  document.addEventListener("click", e => {
    const el = e.target.closest("[data-add],[data-inc],[data-dec],[data-open],[data-go],[data-close],[data-cat]"); if (!el) return;
    if (el.dataset.add) setQty(Number(el.dataset.add), (cart[el.dataset.add]?.qty||0) + 1, el);
    else if (el.dataset.inc) setQty(Number(el.dataset.inc), (cart[el.dataset.inc]?.qty||0) + 1, el);
    else if (el.dataset.dec) setQty(Number(el.dataset.dec), (cart[el.dataset.dec]?.qty||0) - 1);
    else if (el.dataset.open) { openSheet("product"); renderProduct(Number(el.dataset.open)); }
    else if (el.dataset.go === "cart") { openSheet("cart"); renderCart(); }
    else if (el.dataset.go === "checkout") { openSheet("checkout"); renderCheckout(); }
    else if (el.hasAttribute("data-close")) closeSheet();
    else if (el.dataset.cat) { offerF = null; cat = el.dataset.cat; renderChips(); renderProducts(); $("#shop").scrollIntoView({behavior: reduced()?"auto":"smooth"}); }
  });
  document.addEventListener("click", e => {
    const fv = e.target.closest("[data-fav]");
    if (fv) { e.stopPropagation(); const id = Number(fv.dataset.fav); favs.has(id) ? favs.delete(id) : favs.add(id); saveFavs();
      toast(favs.has(id) ? L("पसंदीदा में जोड़ा ❤️","Added to favourites ❤️") : L("पसंदीदा से हटाया","Removed from favourites"));
      document.querySelectorAll(`[data-fav="${id}"]`).forEach(b => { b.setAttribute("aria-pressed", favs.has(id)); b.textContent = favs.has(id) ? "❤️" : "🤍"; });
      renderChips(); if (cat === "fav") renderProducts(); if (sheetMode === "profile") renderProfile(); return; }
    const ad = e.target.closest("[data-addr-del]"); if (ad) { addrs.splice(Number(ad.dataset.addrDel), 1); saveAddrs(); renderProfile(); return; }
    if (e.target.closest("[data-area-edit]")) { if (sheetMode === "profile") closeSheet(); renderDelivery(true); $("#delivery").scrollIntoView({block:"center"}); setTimeout(() => $("#dlIn")?.focus(), 50); return; }
    if (e.target.closest("[data-clear-q]")) { q = ""; $("#q").value = ""; renderProducts(); return; }
    if (e.target.closest("#profBtn")) renderProfile();
  }, true);
  $("#sort").onchange = e => { sortBy = e.target.value; offerF = null; renderProducts(); };
  $("#cartbar").onclick = () => { openSheet("cart"); renderCart(); };
  $("#bnCart").onclick = () => { openSheet("cart"); renderCart(); };
  document.addEventListener("click", e => {
    const oc = e.target.closest("[data-offer]"); const cl = e.target.closest("[data-offer-clear]");
    if (oc) { const o = offerById(Number(oc.dataset.offer)); if (!o || !offerProducts(o).length) return; offerF = o.id; cat = "all"; q = ""; $("#q").value = ""; renderChips(); renderProducts(); $("#shop").scrollIntoView({behavior: reduced()?"auto":"smooth"}); }
    if (cl) { offerF = null; renderProducts(); }
  });
  $("#sheetClose").onclick = closeSheet; $("#sheetBack").onclick = closeSheet;
  $("#sheetBackBtn").onclick = () => { openSheet("cart"); renderCart(); };
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
  let qt; $("#q").addEventListener("input", e => { clearTimeout(qt); qt = setTimeout(() => { q = e.target.value.trim(); renderProducts(); }, 120); });
  $("#langBtn").onclick = () => { AK.setLang(AK.lang === "en" ? "hi" : "en"); applyT(); renderShell(); renderDelivery(); renderOffers(); renderChips(); renderProducts(); renderCartBar(); renderReviews(); refreshMine(); if (sheetMode === "cart") renderCart(); if (sheetMode === "checkout") renderCheckout(); };
  boot(); refreshMine();
})();
