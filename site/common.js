// Shared helpers: language, money, escaping, API calls.
(function(){
  const T = {
    skip:["सामान पर जाएँ","Skip to products"],
    open_now:["अभी खुला है","Open now"], closed_now:["अभी बंद है","Closed now"], closed_today:["आज दुकान बंद है","Closed today"],
    hours:["समय","Hours"],
    hero_title:["आज का सामान, <span>सीधा घर तक।</span>","Today's groceries, <span>straight to your door.</span>"],
    hero_cta:["सामान चुनें ↓","Start shopping ↓"],
    search_label:["सामान खोजें","Search products"], search_ph:["आटा, दूध, दाल खोजें…","Search atta, milk, dal…"],
    sort_default:["क्रम: सामान्य","Sort: default"], sort_low:["सस्ता पहले","Price: low → high"], sort_high:["महँगा पहले","Price: high → low"], sort_pop:["ज़्यादा बिकने वाले","Popular"],
    loading:["दुकान खुल रही है…","Opening the shop…"], all:["सब","All"], featured:["ख़ास सामान","Featured"],
    no_results:["कुछ नहीं मिला। दूसरा नाम लिखकर देखें।","Nothing found. Try another name."],
    add:["जोड़ें","Add"], choose:["साइज़ चुनें","Choose size"], out_of_stock:["अभी ख़त्म","Out of stock"], few_left:["कुछ ही बचे","Few left"],
    sizes:["साइज़","sizes"], save:["बचत","off"],
    how_title:["कैसे ऑर्डर करें","How to order"], how1:["सामान कार्ट में डालें","Add items to the cart"], how2:["नाम, नंबर और पता भरें","Enter name, number and address"], how3:["दुकान वाले ऑर्डर पक्का करेंगे और घर पहुँचाएँगे","The shop confirms and delivers to your home"],
    my_orders:["मेरे ऑर्डर","My orders"], nav_shop:["दुकान","Shop"], nav_cart:["कार्ट","Cart"], offer_tag:["ऑफर","Offer"], offers_title:["आज के ऑफर","Today's offers"],
    st_pending:["मंज़ूरी बाकी","Waiting for shop"], st_accepted:["मंज़ूर","Accepted"], st_preparing:["तैयार हो रहा","Preparing"], st_ready:["तैयार","Ready"], st_out_for_delivery:["रास्ते में","Out for delivery"], st_delivered:["पहुँच गया","Delivered"], st_rejected:["नहीं लिया गया","Rejected"], st_cancelled:["रद्द","Cancelled"],
    notif_cta:["🔔 ऑर्डर अपडेट पाने के लिए नोटिफिकेशन चालू करें","🔔 Turn on notifications for order updates"], info_link:["जानकारी · नीति","About · Policies"],
    view_cart:["कार्ट देखें →","View cart →"], items_n:["{n} सामान","{n} items"], cart:["आपका कार्ट","Your cart"], cart_empty:["कार्ट ख़ाली है","Your cart is empty"],
    subtotal:["सामान का कुल","Items total"], delivery:["डिलीवरी","Delivery"], free:["फ्री","Free"], total:["कुल","Total"],
    free_above:["₹{x} से ऊपर डिलीवरी फ्री","Free delivery above ₹{x}"], min_order:["कम से कम ₹{x} का ऑर्डर","Minimum order ₹{x}"], add_more:["₹{x} का सामान और जोड़ें","Add ₹{x} more"],
    checkout:["आगे बढ़ें","Continue"], details:["डिलीवरी की जानकारी","Delivery details"],
    f_name:["आपका नाम","Your name"], f_phone:["मोबाइल नंबर","Mobile number"], f_address:["घर का पता (मकान नं., गली)","Address (house no., street)"],
    f_locality:["मोहल्ला / इलाका","Locality / area"], f_pincode:["पिन कोड","PIN code"], f_landmark:["पास में कोई निशानी","Nearby landmark"], f_table:["टेबल नंबर","Table no."], f_note:["दुकान के लिए कोई बात","Note for the shop"],
    optional:["(ज़रूरी नहीं)","(optional)"], pay:["भुगतान","Payment"], cod:["कैश ऑन डिलीवरी — सामान मिलने पर पैसे दें","Cash on Delivery — pay when you receive"],
    upi:["डिलीवरी पर UPI से भुगतान","Pay by UPI on delivery"], place:["ऑर्डर भेजें","Send order request"], placing:["भेज रहे हैं…","Sending…"],
    pending_note:["दुकान वाले ऑर्डर देखकर पक्का करेंगे। रेट और स्टॉक दुकान की पुष्टि पर निर्भर हैं।","The shop will review and confirm your order. Prices and stock are confirmed by the shop."],
    sent:["ऑर्डर भेज दिया!","Order sent!"], order_no:["ऑर्डर नंबर","Order number"], track:["ऑर्डर की स्थिति देखें","Track your order"],
    wa_shop:["दुकान को WhatsApp पर भेजें","Send to the shop on WhatsApp"], wa_share:["WhatsApp पर भेजें","Share on WhatsApp"],
    shop_more:["और सामान लें","Continue shopping"], closed_msg:["दुकान अभी बंद है, अभी ऑर्डर नहीं ले सकते।","The shop is closed right now, orders can't be placed."],
    cart_changed:["कुछ सामान बदल गया है, कार्ट देख लें।","Some items changed — please check your cart."],
    price_changed:["रेट बदला: ₹{a} → ₹{b}","Price changed: ₹{a} → ₹{b}"], unavailable:["अब उपलब्ध नहीं","No longer available"], only_left:["सिर्फ़ {n} बचे","Only {n} left"],
    outside_area:["इस इलाके में अभी डिलीवरी नहीं है।","We don't deliver to this area yet."], invalid_phone:["सही 10 अंकों का मोबाइल नंबर डालें","Enter a valid 10-digit mobile number"],
    required:["यह भरना ज़रूरी है","This is required"], net_err:["इंटरनेट की दिक्कत। दोबारा कोशिश करें।","Network problem. Please try again."],
    added:["कार्ट में जोड़ा","Added to cart"], status_pending:["मंज़ूरी बाकी","Pending approval"], status_accepted:["मंज़ूर","Accepted"], status_ready:["तैयार","Ready"], status_preparing:["तैयार हो रहा है","Preparing"],
    status_out_for_delivery:["रास्ते में","Out for delivery"], status_delivered:["पहुँच गया","Delivered"], status_rejected:["अस्वीकार","Rejected"], status_cancelled:["रद्द","Cancelled"],
    deliver_time:["डिलीवरी समय","Delivery time"], call_shop:["दुकान को कॉल करें","Call the shop"]
  };

  // v5 multi-shop: which shop this page belongs to (the server writes it into <meta name="ak-shop">). Shop #1 keeps the
  // original storage keys so existing customers keep their cart and orders; other shops get their own keys on this device.

  // ---- v10.11: shop types. The server writes the type into <meta name="ak-shop" data-type>, so the right words show on first paint.
  // family: kirana (as before) · food (restaurant: "Menu", dishes) · service (salon, clinic, repair, other: "Services").
  const TYPES = {
    kirana:     {icon:"🛒", hi:"किराना / जनरल स्टोर", en:"Grocery / Kirana", d:["राशन और रोज़ का सामान","Groceries & daily needs"], short:["किराना","Grocery"], family:"kirana", mode:"order"},
    restaurant: {icon:"🍽️", hi:"रेस्टोरेंट / होटल (खाना)", en:"Restaurant / Hotel", d:["खाने का मेन्यू और ऑर्डर","Food menu & orders"], short:["होटल","Hotel"], family:"food", mode:"order"},
    salon:      {icon:"💇", hi:"सैलून / पार्लर", en:"Salon / Parlour", d:["बाल और ब्यूटी सेवाएँ","Hair & beauty services"], short:["सैलून","Salon"], family:"service", mode:"booking"},
    clinic:     {icon:"🩺", hi:"क्लिनिक / डॉक्टर", en:"Clinic / Doctor", d:["डॉक्टर और इलाज","Doctor & health care"], short:["क्लिनिक","Clinic"], family:"service", mode:"booking"},
    repair:     {icon:"🔧", hi:"रिपेयर / सर्विस", en:"Repair / Service", d:["मरम्मत और सर्विस काम","Repairs & service work"], short:["रिपेयर","Repair"], family:"service", mode:"booking"},
    other:      {icon:"🏪", hi:"अन्य दुकान", en:"Other", d:["कोई और दुकान","Any other shop"], short:["अन्य","Other"], family:"service", mode:"booking"}
  };
  const typeKey = k => Object.prototype.hasOwnProperty.call(TYPES, k) ? k : "kirana";
  const familyOf = k => TYPES[typeKey(k)].family;
  const TYPE_WORDS = {
    food: {
      skip:["मेन्यू पर जाएँ","Skip to menu"], hero_title:["गरमा-गरम खाना, <span>सीधा आप तक।</span>","Hot food, <span>straight to you.</span>"], hero_cta:["मेन्यू देखें ↓","See the menu ↓"],
      search_label:["मेन्यू में खोजें","Search the menu"], search_ph:["थाली, समोसा, चाय खोजें…","Search thali, samosa, chai…"], featured:["ख़ास डिश","Specials"], choose:["प्लेट चुनें","Choose plate"],
      how1:["डिश कार्ट में डालें","Add dishes to the cart"], how2:["पार्सल, डिलीवरी या टेबल चुनें","Choose parcel, delivery or table"], how3:["होटल वाले ऑर्डर पक्का करके तैयार करेंगे","The hotel confirms and prepares it"],
      items_n:["{n} डिश","{n} dishes"], subtotal:["खाने का कुल","Food total"], add_more:["₹{x} का खाना और जोड़ें","Add ₹{x} more"], details:["ऑर्डर की जानकारी","Order details"],
      shop_more:["और डिश लें","Add more dishes"], cart_changed:["मेन्यू में कुछ बदला है, कार्ट देख लें।","The menu changed — please check your cart."], nav_shop:["मेन्यू","Menu"],
      cod:["कैश — खाना मिलने पर पैसे दें","Cash — pay when you get your food"]
    },
    service: {
      skip:["सेवाओं पर जाएँ","Skip to services"], hero_title:["अच्छी सेवा, <span>आपके पास।</span>","Good service, <span>close to you.</span>"], hero_cta:["सेवाएँ देखें ↓","See services ↓"],
      search_label:["सेवा खोजें","Search services"], search_ph:["सेवा का नाम लिखें…","Type a service…"], featured:["ख़ास सेवाएँ","Popular"], choose:["विकल्प चुनें","Choose option"],
      how1:["सेवा चुनकर जोड़ें","Pick a service"], how2:["नाम और नंबर भरें","Enter your name and number"], how3:["दुकान वाले पक्का करके समय बताएँगे","The shop confirms and tells you the time"],
      items_n:["{n} सेवा","{n} services"], subtotal:["सेवाओं का कुल","Services total"], add_more:["₹{x} की सेवा और जोड़ें","Add ₹{x} more"], details:["आपकी जानकारी","Your details"],
      shop_more:["और सेवा जोड़ें","Add more services"], cart_changed:["कुछ सेवा बदली है, कार्ट देख लें।","Some services changed — please check your cart."], nav_shop:["सेवाएँ","Services"], my_orders:["मेरी बुकिंग","My bookings"],
      cod:["कैश — सेवा के बाद पैसे दें","Cash — pay after the service"], pending_note:["दुकान पर QR स्कैन करके बुक करें तो नंबर तुरंत मिलेगा; घर से बुकिंग पर सैलून के स्वीकार करते ही नंबर मिलेगा।","Booked by scanning the QR at the shop: you get your number at once. Booked from home: you get it when the salon accepts."], place:["📅 बुक करें","📅 Book"], placing:["बुक हो रहा है…","Booking…"], sent:["बुक हो गया!","Booked!"], out_of_stock:["अभी उपलब्ध नहीं","Not available now"], few_left:["कुछ ही स्लॉट","Few left"]
    }
  };
  let shopType = "kirana";
  function useShopType(k){ shopType = typeKey(k); const tw = TYPE_WORDS[familyOf(shopType)]; if (tw) Object.assign(T, tw);
    if (document.documentElement) { document.documentElement.dataset.shopType = shopType; document.documentElement.dataset.shopFamily = familyOf(shopType); }
    if (window.AKIcons && AKIcons.setGrocery) AKIcons.setGrocery(shopType === "kirana"); }
  const SHOP = (() => { const m = document.querySelector('meta[name="ak-shop"]'); return {slug: (m && m.content) || "", id: Number(m && m.dataset.id) || 1, name: (m && m.dataset.name) || "", type: typeKey(m && m.dataset.type)}; })();
  if (SHOP.slug) useShopType(SHOP.type);
  // v10.5: every customer key is namespaced "cust.<slug>.<key>" so the customer app can never read or clash with the Dukaan
  // (shopkeeper, "admin.*") or Dev ("dev.*") keys on the same phone. Only the language choice (ak_lang) is shared on purpose.
  const OLD_SK = k => (k === "ak_lang" || SHOP.id === 1 || !SHOP.slug) ? k : k + "@" + SHOP.slug;
  const SK = k => k === "ak_lang" ? k : "cust." + (SHOP.slug || "_") + "." + k;
  // One-time copy of the pre-v10.5 keys (cart, saved orders, addresses, …) so nobody loses their cart or "My orders".
  (() => { try {
    if (!SHOP.slug || localStorage.getItem(SK("migrated"))) return;
    for (const k of ["ak_cart", "ak_favs", "ak_addrs", "ak_orders", "ak_order_status", "ak_customer", "ak_area"]) { const v = localStorage.getItem(OLD_SK(k)); if (v != null && localStorage.getItem(SK(k)) == null) localStorage.setItem(SK(k), v); }
    const op = OLD_SK("ak_push_"); for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key && key.startsWith(op) && /^AK-[A-Z0-9]{6}$/.test(key.slice(op.length)) && localStorage.getItem(SK("ak_push_") + key.slice(op.length)) == null) localStorage.setItem(SK("ak_push_") + key.slice(op.length), localStorage.getItem(key)); }
    localStorage.setItem(SK("migrated"), "10.5");
  } catch {} })();
  const HOME = SHOP.slug ? "/s/" + SHOP.slug : "/";
  const mapHref = h => { if (!SHOP.slug || !h) return h; if (h === "/") return HOME; if (h.startsWith("/#")) return HOME + h.slice(1);
    if (h === "/track" || h.startsWith("/track#")) return "/track?s=" + SHOP.slug + h.slice(6); if (h === "/info") return HOME + "/info"; return h; };
  const fixLinks = (root=document) => root.querySelectorAll && root.querySelectorAll("a[href]").forEach(a => { const h = a.getAttribute("href"), n = mapHref(h); if (n !== h) a.setAttribute("href", n); });
  document.addEventListener("click", e => { const a = e.target.closest && e.target.closest("a[href]"); if (a) { const h = a.getAttribute("href"), n = mapHref(h); if (n !== h) a.setAttribute("href", n); } }, true);
  if (document.readyState !== "loading") fixLinks(); else document.addEventListener("DOMContentLoaded", () => fixLinks());
  let lang = localStorage.getItem("ak_lang") || "en"; // v10.11: English is the main language; हिंदी is the switch
  const t = (k, vars) => { let s = (T[k] || [k,k])[lang==="en"?1:0]; if (vars) for (const [a,b] of Object.entries(vars)) s = s.replaceAll("{"+a+"}", b); return s; };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const rupees = p => (p/100).toLocaleString("en-IN", {minimumFractionDigits: p%100 ? 2 : 0, maximumFractionDigits: 2});
  const money = p => "₹" + rupees(p);
  function takePre(path){ const P = window.__adPre; if (P === undefined && path.startsWith("/api/admin/")) { window.__adPre = {}; return null; } if (!P) return null;
    const take = () => { const p = P[path]; if (!p) return null; delete P[path]; return Date.now() - (window.__adPreT || 0) < 20000 ? p : null; };
    if (P[path]) return take();
    return P.__dec && P.__paths && P.__paths.includes(path) ? P.__dec.then(take) : null; } // admin-boot.js has not decided yet: wait for it, never ask twice
  async function api(path, opts={}){
    const o = {method: opts.method || "GET", headers: {...(opts.headers||{})}, credentials: "same-origin"};
    if (opts.body !== undefined) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(opts.body); }
    if (o.method !== "GET") o.headers["x-requested-with"] = "kirana";
    // v10.16.1: the shop's data is read as /api/store?shop=<slug> (no extra header), the exact request the page preloads, so it is already on its way
    if (path === "/api/store" && o.method === "GET" && SHOP.slug && !opts.headers) path = "/api/store?shop=" + encodeURIComponent(SHOP.slug);
    else if (SHOP.slug && !path.startsWith("/api/admin/")) o.headers["x-shop"] = SHOP.slug;
    // v10.16.2: the shop panel's first screen — admin-boot.js may already have this exact GET on its way (used once, within 20 s)
    const pre = o.method === "GET" && !opts.headers && takePre(path);
    let r; try { r = await (pre ? pre.then(x => x || fetch(path, o)) : fetch(path, o)); } catch { const e = new Error(t("net_err")); e.code = "network"; throw e; }
    const ct = r.headers.get("content-type") || ""; const data = ct.includes("json") ? await r.json() : await r.text();
    if (!r.ok) { const e = new Error(pickMsg((data && data.error) || ("HTTP " + r.status))); e.status = r.status; e.data = data; e.code = data && data.code; throw e; }
    return data;
  }
  // v10.12: server messages come as "हिंदी · English" — show only the part for the chosen language (English by default)
  function pickMsg(m, want){ m = String(m == null ? "" : m); const DV = /[\u0900-\u097F]/; if (!DV.test(m) || m.indexOf(" · ") < 0) return m;
    const parts = m.split(" · "); let k = 0; while (k < parts.length && DV.test(parts[k])) k++;
    if (k === 0 || k === parts.length || parts.slice(k).some(x => DV.test(x))) return m;
    return (want || lang) === "en" ? parts.slice(k).join(" · ") : parts.slice(0, k).join(" · "); }
  function applyT(root=document){
    root.querySelectorAll("[data-t]").forEach(el => el.innerHTML = t(el.dataset.t));
    root.querySelectorAll("[data-tp]").forEach(el => el.placeholder = t(el.dataset.tp));
    document.documentElement.lang = lang === "en" ? "en" : "hi";
    paintLang();
  }
  // v10.11: one "EN | हिंदी" switch at the top of every page; the active language is highlighted
  function paintLang(el){ el = el || document.getElementById("langBtn"); if (!el) return;
    el.classList.add("lang-sw"); el.innerHTML = `<span class="${lang === "en" ? "on" : ""}">EN</span><i aria-hidden="true">|</i><span class="${lang === "en" ? "" : "on"}" lang="hi">हिंदी</span>`;
    el.setAttribute("aria-label", lang === "en" ? "Language: English. Switch to Hindi" : "भाषा: हिंदी। English में बदलें"); }
  function toast(msg){ const el = document.getElementById("toast"); if (!el) return; el.textContent = msg; el.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(()=>el.classList.remove("show"), 2400); }
  const nm = (o, hiKey="name_hi", enKey="name_en") => (lang==="en" && o[enKey]) ? o[enKey] : (o[hiKey] || o[enKey] || "");
  const alt = () => ""; // v10.11: one name per language (English by default, Hindi when switched) — no second-language line
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  // ----- this browser's own orders (code + private token, saved at checkout) -----
  const ACTIVE = ["pending","accepted","preparing","ready","out_for_delivery"];
  const ST_ICON = {pending:"⏳", accepted:"✅", preparing:"🧺", ready:"✅", out_for_delivery:"🛵", delivered:"🏠", rejected:"❌", cancelled:"⚠️"};
  function myOrders(){ try { return (JSON.parse(localStorage.getItem(SK("ak_orders"))) || []).filter(o => o && /^AK-[A-Z0-9]{6}$/.test(o.code) && /^[a-f0-9]{48}$/.test(o.token)); } catch { return []; } }
  async function fetchMine(){
    const list = myOrders(); if (!list.length) return [];
    const r = await api("/api/orders/mine", {method:"POST", body:{orders: list.map(o => ({code:o.code, token:o.token}))}});
    const byCode = Object.fromEntries(list.map(o => [o.code, o]));
    const out = r.orders.filter(o => !o.missing).map(o => ({...o, token: byCode[o.code]?.token}));
    try { localStorage.setItem(SK("ak_order_status"), JSON.stringify(Object.fromEntries(out.map(o => [o.code, o.status])))); } catch {}
    return out;
  }
  function cachedActiveCount(){ try { const m = JSON.parse(localStorage.getItem(SK("ak_order_status"))) || {}; return Object.values(m).filter(s => ACTIVE.includes(s)).length; } catch { return 0; } }
  function setBadge(id, n){ document.querySelectorAll(`[data-badge="${id}"]`).forEach(b => { b.hidden = !n; b.textContent = n > 9 ? "9+" : String(n); }); }

  // ----- Web Push helpers (Android Chrome / desktop; iPhone only when added to Home Screen, iOS 16.4+) -----
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  function pushState(){
    if (!pushSupported()) return isIOS() && !standalone() ? "ios_needs_homescreen" : "unsupported";
    if (Notification.permission === "denied") return "denied";
    return Notification.permission === "granted" ? "granted" : "ask";
  }
  const b64uToBytes = s => { s = s.replace(/-/g,"+").replace(/_/g,"/"); s += "=".repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  let swReg = null;
  // v10.5: each app registers its OWN narrow-scope worker through pwa.js (/admin, /dev, /s/<slug>); never one at "/".
  async function registerSW(){ if (!("serviceWorker" in navigator) || !window.AKPWA) return null; if (swReg) return swReg; try { swReg = await window.AKPWA.register(); return swReg; } catch { return null; } }
  // Asks permission (must be called from a tap), returns a PushSubscription JSON or throws with .code
  async function getPushSubscription(){
    if (!pushSupported()) { const e = new Error("unsupported"); e.code = pushState(); throw e; }
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") { const e = new Error("denied"); e.code = perm === "denied" ? "denied" : "dismissed"; throw e; }
    const reg = await registerSW(); if (!reg) { const e = new Error("sw"); e.code = "unsupported"; throw e; }
    let sub = await reg.pushManager.getSubscription();
    const {public_key} = await api("/api/push/key");
    if (sub) { const cur = sub.options && sub.options.applicationServerKey; const same = cur && btoa(String.fromCharCode(...new Uint8Array(cur))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"") === public_key; if (!same) { await sub.unsubscribe(); sub = null; } }
    if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64uToBytes(public_key)});
    return sub.toJSON();
  }
  async function currentEndpoint(){ try { const reg = await registerSW(); const s = reg && await reg.pushManager.getSubscription(); return s ? s.endpoint : null; } catch { return null; } }
  // v10.5: alerts a customer turned on under the old site-wide worker move to this shop's own worker by themselves.
  async function moveOrderAlerts(){ try {
    if (!SHOP.slug || !pushSupported() || Notification.permission !== "granted") return; const reg = await registerSW(); if (!reg) return;
    const cur = await reg.pushManager.getSubscription(); const mine = myOrders().filter(o => { const v = localStorage.getItem(SK("ak_push_") + o.code); return v && (!cur || v !== cur.endpoint); }).slice(0, 5);
    for (const o of mine) { try { await subscribeOrder(o); } catch {} }
  } catch {} }
  if ("serviceWorker" in navigator) addEventListener("load", () => { setTimeout(moveOrderAlerts, 1500); });
  async function subscribeOrder(o){
    const sub = await getPushSubscription();
    await api("/api/push/order", {method:"POST", body:{code:o.code, token:o.token, subscription:sub}});
    localStorage.setItem(SK("ak_push_") + o.code, sub.endpoint); return sub;
  }
  // The "turn on order updates" box shown after checkout and on an order's page. Honest about where it works.
  async function notifyBox(el, o, opts={}){
    if (!el) return;
    const L = (hi, en) => lang === "en" ? en : hi;
    const where = L("Android (Chrome) और कंप्यूटर पर चलता है। iPhone पर सिर्फ़ तब, जब साइट Home Screen पर जोड़ी हो (iOS 16.4+)।","Works on Android (Chrome) and computers. On iPhone only when the site is added to the Home Screen (iOS 16.4+).");
    const fallback = opts.token ? L("यह पेज खुला रखें (खुद अपडेट होता है), या अलर्ट के लिए Home Screen पर जोड़ें।","Keep this page open, or add to home screen for alerts.")
      : L("तब तक “मेरे ऑर्डर” पेज खुद अपडेट होता है, और आप दुकान को WhatsApp कर सकते हैं।","Meanwhile the “My orders” page updates by itself, and you can WhatsApp the shop.");
    const st = pushState();
    if (st === "granted") {
      const ep = await currentEndpoint();
      if (ep && localStorage.getItem(SK("ak_push_") + o.code) === ep) {
        if (opts.token) { el.innerHTML = `<div class="nbox on" role="status"><b>🔔 ${L("अलर्ट चालू है","Alerts are on")}</b><p>${L("जब आपसे आगे 2 लोग बचेंगे और जब आपका नंबर अगला होगा, इस फ़ोन पर नोटिफिकेशन आएगा।","You'll get a notification on this phone when 2 people are ahead of you and when you're next.")}</p></div>`; return; }
        el.innerHTML = `<div class="nbox on" role="status"><b>🔔 ${L("अपडेट चालू हैं","Updates are on")}</b><p>${L("मंज़ूर, तैयार, रास्ते में, पहुँच गया — हर बदलाव पर इस फ़ोन पर नोटिफिकेशन भेजा जाएगा (फ़ोन ऑनलाइन हो तो)।","Accepted, preparing, on the way, delivered — a notification is sent to this phone at every change (when it is online).")}</p></div>`; return;
      }
      if (opts.auto !== false) { try { await subscribeOrder(o); return notifyBox(el, o, {...opts, auto:false}); } catch {} }
    }
    if (st === "ios_needs_homescreen" && opts.token) { el.innerHTML = `<div class="nbox"><b>🔔 ${L("iPhone पर अलर्ट","Alerts on iPhone")}</b><p class="nsmall">${fallback}</p><p class="nsmall">${L("Safari में Share ⬆️ → “Add to Home Screen”, फिर वहीं से बुक करें (iOS 16.4+)।","In Safari: Share ⬆️ → “Add to Home Screen”, then book from that icon (iOS 16.4+).")}</p></div>`; return; }
    if (st === "ios_needs_homescreen") { el.innerHTML = `<div class="nbox"><b>🔔 ${L("iPhone पर अपडेट","Updates on iPhone")}</b><p>${L("Safari में नीचे Share ⬆️ दबाएँ → “Add to Home Screen”। फिर Home Screen वाले आइकन से दुकान खोलें और वहीं से ऑर्डर करें — तब नोटिफिकेशन चालू कर पाएँगे (iOS 16.4+)।","In Safari tap Share ⬆️ → “Add to Home Screen”. Then open the shop from that icon and order from there — you can turn on notifications there (iOS 16.4+).")}</p><p class="nsmall">${fallback}</p></div>`; return; }
    if (st === "unsupported") { el.innerHTML = `<div class="nbox"><b>🔕 ${L("इस ब्राउज़र में नोटिफिकेशन नहीं चलते","This browser can't show notifications")}</b><p class="nsmall">${fallback}</p></div>`; return; }
    if (st === "denied") { el.innerHTML = `<div class="nbox"><b>🔕 ${L("नोटिफिकेशन ब्लॉक हैं","Notifications are blocked")}</b><p>${L("ब्राउज़र में इस साइट की सेटिंग खोलें → Notifications → Allow, फिर यह पेज दोबारा खोलें।","Open this site's settings in your browser → Notifications → Allow, then reopen this page.")}</p><p class="nsmall">${fallback}</p></div>`; return; }
    el.innerHTML = `<div class="nbox ask"><button class="btn btn-notif btn-block" type="button">${opts.token ? esc(L("🔔 नंबर पास आने पर मुझे बताएँ","🔔 Notify me when my turn is near")) : esc(t("notif_cta"))}</button><p class="nsmall">${opts.token ? fallback : where}</p></div>`;
    el.querySelector("button").onclick = async ev => {
      ev.target.disabled = true; ev.target.textContent = "…";
      try { await subscribeOrder(o); toast(opts.token ? L("✅ अलर्ट चालू","✅ Alerts on") : L("✅ अपडेट चालू","✅ Updates on")); }
      catch (e) { if (e.code === "dismissed") toast(L("ठीक है, बाद में चालू कर सकते हैं","OK — you can turn it on later")); else if (e.code !== "denied") toast(e.message === "unsupported" ? L("यहाँ नहीं चलेगा","Not supported here") : e.message); }
      notifyBox(el, o, {...opts, auto:false});
    };
  }

  window.AK = { pickMsg, paintLang, TYPES, typeKey, familyOf, useShopType, get shopType(){ return shopType; }, SHOP, SK, HOME, mapHref, fixLinks, T, t, esc, money, rupees, api, applyT, toast, nm, alt, reduced,
    ACTIVE, ST_ICON, myOrders, fetchMine, cachedActiveCount, setBadge, isIOS, standalone, pushSupported, pushState, getPushSubscription, currentEndpoint, registerSW, subscribeOrder, notifyBox,
    get lang(){ return lang; }, setLang(l){ lang = l; localStorage.setItem("ak_lang", l); } };
})();
