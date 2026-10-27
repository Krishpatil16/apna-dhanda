// Shopkeeper admin panel
(function(){
  const {esc, money, rupees, api, applyT, toast} = AK;
  Object.assign(AK.T, {
    a_today:["आज","Today"], a_orders:["ऑर्डर","Orders"], a_stock:["स्टॉक","Stock"], a_products:["सामान","Items"], a_categories:["कैटेगरी","Categories"], a_tab_cat:["कैटेगरी","Category"], a_settings:["सेटिंग","Settings"], a_offers:["ऑफर","Offers"], a_reports:["रिपोर्ट","Reports"]
  });
  const L = (hi, en) => AK.lang === "en" ? en : hi;
  const $ = s => document.querySelector(s);
  // ---- v10.11: shop type. kirana keeps everything as before; food = restaurant ("Menu", dishes, plates); service = salon/clinic/repair/other
  const shopType = () => AK.typeKey(me && me.shop && me.shop.type);
  const shopFam = () => AK.familyOf(shopType());
  const isKirana = () => shopType() === "kirana";
  const W = (k) => ({ // words that change with the shop type: [hi, en]
    item:     {kirana: ["सामान","Item"], food: ["डिश","Dish"], service: ["सेवा","Service"]},
    items:    {kirana: ["सामान","Items"], food: ["मेन्यू","Menu"], service: ["सेवाएँ","Services"]},
    add:      {kirana: ["सामान जोड़ो","Add items"], food: ["डिश जोड़ो","Add dish"], service: ["सेवा जोड़ो","Add service"]},
    size:     {kirana: ["साइज़ / पैक","Size / pack"], food: ["प्लेट / साइज़","Plate / size"], service: ["प्रकार / समय","Type / duration"]},
    size_ph:  {kirana: ["1 किलो","1 kg"], food: ["फुल प्लेट","Full plate"], service: ["30 मिनट","30 min"]},
    name_ph:  {kirana: ["गेहूं आटा","Wheat Atta"], food: ["वेज थाली","Veg Thali"], service: ["हेयर कट","Haircut"]},
    new_item: {kirana: ["नया सामान","New item"], food: ["नई डिश","New dish"], service: ["नई सेवा","New service"]},
    edit_item:{kirana: ["सामान बदलें","Edit item"], food: ["डिश बदलें","Edit dish"], service: ["सेवा बदलें","Edit service"]},
    per:      {kirana: ["रेट और स्टॉक (हर पैक साइज़ के लिए)","Price & stock (per pack size)"], food: ["रेट (हर प्लेट / साइज़ के लिए)","Price (per plate / size)"], service: ["रेट (हर प्रकार के लिए)","Price (per type)"]},
    another:  {kirana: ["एक और साइज़","Another size"], food: ["एक और प्लेट (हाफ़ / फुल)","Another plate (half / full)"], service: ["एक और प्रकार","Another type"]},
    stock:    {kirana: ["स्टॉक","Stock"], food: ["कितनी प्लेट","Plates left"], service: ["कितनी बार","Available"]}
  })[k][shopFam()] || ["",""];
  const WL = k => L(...W(k));
  // ---- v10.13: one profile per shop type (site/type-profile.js): words, statuses and navigation. kirana = the old panel, unchanged.
  const PROF = () => (window.AK_PROFILE ? AK_PROFILE.profileFor(shopType()) : {nav: "tabs", words: {}, status: {}});
  const PW = (k, fb) => { const w = PROF().words[k]; return w ? L(...w) : fb; };
  const isSvc = () => PROF().nav === "pills";
  function applyShopType(){ const f = shopFam(); AK.useShopType(shopType());
    AK.T.a_products = W("items"); if (window.AKIcons && AKIcons.setGrocery) AKIcons.setGrocery(isKirana());
    document.body.dataset.shopFamily = f; document.body.classList.toggle("nav-pills", isSvc()); AK.T.a_orders = PROF().words.orders_tab || AK.T.a_orders; applyT(); }
  // ready-made quick-add stickers per type: kirana = the grocery stickers (stickers.js); food = dishes below; service = none (own list)
  const FOOD_STICKERS = [
    {g:"थाली", en:"Thali", kw:["थाली","thali"], items:[["🍛","वेज थाली","Veg Thali"],["🍱","स्पेशल थाली","Special Thali"],["🍛","दाल-चावल","Dal Rice"],["🫓","रोटी-सब्ज़ी","Roti Sabzi"]]},
    {g:"नाश्ता", en:"Snacks", kw:["नाश्ता","snack"], items:[["🥟","समोसा","Samosa"],["🧆","कचौरी","Kachori"],["🍘","पोहा","Poha"],["🥪","सैंडविच","Sandwich"],["🍟","फ्रेंच फ्राइज़","French Fries"],["🥞","डोसा","Dosa"],["🍙","इडली","Idli"]]},
    {g:"खाना", en:"Main course", kw:["खाना","main"], items:[["🍲","पनीर सब्ज़ी","Paneer Sabzi"],["🍛","दाल फ्राई","Dal Fry"],["🍚","जीरा राइस","Jeera Rice"],["🫓","तंदूरी रोटी","Tandoori Roti"],["🍜","चाउमीन","Chowmein"],["🍕","पिज़्ज़ा","Pizza"],["🍔","बर्गर","Burger"]]},
    {g:"पेय", en:"Drinks", kw:["पेय","drink"], items:[["☕","चाय","Chai"],["☕","कॉफ़ी","Coffee"],["🥛","लस्सी","Lassi"],["🧃","जूस","Juice"],["🥤","कोल्ड ड्रिंक","Cold Drink"],["💧","पानी की बोतल","Water Bottle"]]},
    {g:"मिठाई", en:"Sweets", kw:["मिठाई","sweet"], items:[["🍮","गुलाब जामुन","Gulab Jamun"],["🍩","जलेबी","Jalebi"],["🍨","आइसक्रीम","Ice Cream"],["🍬","रसगुल्ला","Rasgulla"]]}
  ];
  const stickersFor = () => isKirana() ? (window.AK_STICKERS || []) : shopFam() === "food" ? FOOD_STICKERS : [];
  const FOOD_ICONS = ["🍽️","🍛","🍱","🫓","🥟","🧆","🍲","🍚","🍜","🍝","🍕","🍔","🌯","🥪","🍟","🥞","🥗","🍢","🍳","☕","🥛","🧃","🥤","💧","🍮","🍩","🍨","🍬","🍰","🎂"];
  const SERVICE_ICONS = ["⭐","💇","💇‍♂️","✂️","💈","💅","💄","💆","🧖","🪮","🩺","💊","💉","🦷","🩹","🧪","🔧","🔩","🛠️","🪛","🔌","💡","📱","💻","🔋","🚲","🛵","🚗","🧹","📦"];
  const iconsFor = () => isKirana() ? ICONS : shopFam() === "food" ? FOOD_ICONS : SERVICE_ICONS;
  // v10.10: AI product icons (icons.js) in place of the emoji, everywhere a product shows; the emoji stays if an icon can't load
  const icI = (p, c) => window.AKIcons ? AKIcons.inlineHtml(p, c) : esc((p && p.icon) || "");
  const icBox = p => window.AKIcons ? AKIcons.picHtml(p, catalog && catalog.categories ? catalog.categories.find(c => c.id === p.category_id) : null, {emoji: e => esc(e)}) : (p.image ? `<img src="${esc(p.image)}" alt="">` : esc(p.icon));
  const app = $("#app");
  const ST = {pending:["मंज़ूरी बाकी","Pending approval"], accepted:["मंज़ूर","Accepted"], preparing:["तैयार हो रहा","Preparing"], ready:["तैयार","Ready"], out_for_delivery:["रास्ते में","Out for delivery"], delivered:["पहुँच गया","Delivered"], rejected:["अस्वीकार","Rejected"], cancelled:["रद्द","Cancelled"]};
  const stName = s => L(...((PROF().status || {})[s] || ST[s]));
  const NEXT = {pending:[["accepted","✅","btn-primary","accept"]], accepted:[["preparing","🧺","btn-blue","prep"],["out_for_delivery","🛵","btn-blue","send"]], preparing:[["ready","📦","btn-primary","ready"],["out_for_delivery","🛵","btn-blue","send"]], ready:[["out_for_delivery","🛵","btn-blue","send"],["delivered","🏠","btn-primary","deliver"]], out_for_delivery:[["delivered","🏠","btn-primary","deliver"]]};
  // v10.15.3: an order button names the ACTION ("Accept"), not the state it leads to ("Accepted"); the badge and the toast after the tap still show the state. A profile's own actions (salon, food) override these.
  const ACT = {accept:["स्वीकार करें","Accept"], prep:["पैकिंग शुरू करें","Start packing"], ready:["तैयार मार्क करें","Mark ready"], send:["डिलीवरी पर भेजें","Send for delivery"], deliver:["डिलीवरी पूरी करें","Mark delivered"]};
  const ICONS = ["🛍️","🌾","🍚","🫘","🫛","🥣","🫗","🧈","🌶️","🧂","🍬","🍵","☕","🍪","🥨","🍜","🥔","🥤","🧃","💧","🥛","🍶","🧀","🥚","🍞","🧅","🧄","🍅","🥕","🥬","🍌","🍎","🧼","🧽","🧺","🪥","🧻","🕯️","🫙","🍫"];
  let tab = "today", D = null, catalog = null, orderFilter = "active", lastMaxId = 0, pollT = null, me = null;

  // ---------- auth screens ----------
  async function start(){
    applyT(); AK.paintLang();
    let s; try { s = await api("/api/admin/state"); } catch (e) { app.innerHTML = `<div class="a-card auth"><p class="err">${esc(e.message)}</p></div>`; return; }
    if (s.needs_setup) return setupView();
    if (!s.admin) return location.hash === "#signup" ? signupView() : loginView();
    document.body.classList.remove("auth-mode"); me = s.admin; applyShopType(); setTimeout(moveAlerts, 1500); renderSvc(s.service); if (!svcT) svcT = setInterval(async () => { try { const x = await api("/api/admin/state"); if (x.admin) renderSvc(x.service); } catch {} }, 60000);
    if (me.must_change) return passwordView(true);
    greet(); notifInit();
    if (isExpired(s.service) || location.hash === "#recharge") return rechargeView();
    $("#tabs").hidden = isSvc(); renderShopBar(); autoIcons(); readHash(); if (!stockHash()) go(tab); openPendingBill();
  }
  function greet(){
    $("#aUser").textContent = L("नमस्ते, ","Hello, ") + (me.owner_name || L("दुकानदार","Shopkeeper"));
    const br = document.querySelector(".a-brand"); if (br && me.shop) { br.setAttribute("href", me.shop.customer_url || (location.origin + me.shop.link)); br.setAttribute("target", "_blank"); br.setAttribute("rel", "noopener"); } // v10.5: full URL, opens the customer view in the browser, never inside the Dukaan app
    if (me.shop) $("#aStore").textContent = me.shop.name;
    salonHead();
  }
  // v10.14 (Krish 11:34 PM "thoda interesting banao"): salon header = gradient + soft shine, "✂️ Salon" badge, a greeting line, glass pills
  function salonHead(waiting, requests){
    const on = shopType() === "salon"; document.body.classList.toggle("salon-admin", on); if (!on) return;
    const rp = document.querySelector(".a-top .role-pill"); if (rp) { rp.textContent = "✂️ " + L("सैलून","Salon"); rp.title = "Salon"; }
    const st = $("#aStore"); if (!st) return;
    if (!$("#aGreet")) { const w = document.createElement("span"); w.className = "a-ttl"; st.replaceWith(w); w.append(st); const g = document.createElement("small"); g.id = "aGreet"; g.className = "a-greet"; w.append(g); }
    const h = Number(new Date().toLocaleString("en-US", {hour: "numeric", hour12: false, timeZone: "Asia/Kolkata"})) % 24;
    const hi = h < 12 ? L("सुप्रभात","Good morning") : h < 17 ? L("नमस्ते","Good afternoon") : L("शुभ संध्या","Good evening");
    if (waiting != null) { salonHead.n = waiting; salonHead.r = requests || 0; }
    // v10.15.3: "N waiting" = the same number as the ⏳ Waiting tile (in the queue, not started). Online requests still waiting for ✅ Accept are not "waiting":
    // while there are any, the header names them instead ("2 requests", like the 🏠 Online requests list — the line only has room for one short count on a 360px phone; the tile shows the queue right below)
    const rq = salonHead.r || 0, cnt = rq ? L(`${rq} नई रिक्वेस्ट`, `${rq} request${rq === 1 ? "" : "s"}`) : salonHead.n != null ? L(`${salonHead.n} इंतज़ार में`, `${salonHead.n} waiting`) : "";
    $("#aGreet").innerHTML = `<b class="a-gtype">✂️ ${esc(L("सैलून","Salon"))}</b>${cnt ? esc(cnt) + " · " : ""}${esc(hi)} 👋`;
  }
  // A tap on a "new order" notification opens /admin#order=ID
  let focusOrder = null;
  // v10.9: a tap on the "new order" push opens /admin#bill=ID → Orders tab with that order + its 🧾 bill on top
  let billOnOpen = null;
  function readHash(){ const m = /^#(order|bill)=(\d+)$/.exec(location.hash); if (m) { focusOrder = Number(m[2]); if (m[1] === "bill") billOnOpen = focusOrder; tab = "orders"; orderFilter = "all"; history.replaceState(null, "", "/admin"); } }
  function openPendingBill(){ if (billOnOpen == null) return; const id = billOnOpen; billOnOpen = null; billView(id); }
  window.addEventListener("hashchange", () => { if (me && /^#(order|bill)=/.test(location.hash)) { readHash(); go("orders"); openPendingBill(); } });
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.type === "ak-push" && me) { if ((tab === "orders" || tab === "today") && !inRecharge) loadOrders(); loadNoti(); } });
  // v10: branded shell for the logged-out screens (login / sign-up / recovery / setup)
  // v10.10.1: the decorative 3D layer (shop3d.js/.css, login & sign-up screens only) loads after the form is on screen, never on the logged-in panel
  let s3dAsked = false;
  function load3d(){ if (s3dAsked) return; s3dAsked = true; setTimeout(() => { if (!document.body.classList.contains("auth-mode")) { s3dAsked = false; return; } const v = (document.querySelector('meta[name="ak-ver"]') || {}).content || "1";
      const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/shop3d.css?v=" + v; document.head.appendChild(l); const s = document.createElement("script"); s.src = "/shop3d.js?v=" + v; document.body.appendChild(s); }, 1200); }
  function authHero(){
    document.body.classList.add("auth-mode"); load3d(); if ($("#shopBar")) $("#shopBar").hidden = true;
    const bm = document.querySelector(".a-brand .bm"); const brand = (document.querySelector('meta[name="ad-brand"]') || {}).content || "Apna Dhanda";
    return `<div class="auth-hero"><div class="ah-logo">${bm ? bm.outerHTML : ""}</div><b>${esc(brand)}</b><small>${L("अपना धंधा · अपनी दुकान ऑनलाइन","Your shop, online")}</small></div>`;
  }
  function authTabs(on){
    return `<div class="auth-seg" role="tablist"><button type="button" role="tab" data-go="login" aria-selected="${on === "login"}">🔑 ${L("लॉगिन","Log in")}</button><button type="button" role="tab" data-go="signup" aria-selected="${on === "signup"}">🏪 ${L("नई दुकान","New shop")}</button></div>`;
  }
  function bindTabs(){ document.querySelectorAll(".auth-seg [data-go]").forEach(b => b.onclick = () => { if (b.getAttribute("aria-selected") === "true") return; b.dataset.go === "signup" ? signupView() : loginView(); }); }
  function setupView(){
    app.innerHTML = authHero() + `<form class="a-card auth form" id="f"><h1>${L("पहली बार सेटअप","First-time setup")}</h1>
      <p class="hint">${L("दुकान का एडमिन अकाउंट बनाइए। इसके लिए सेटअप की (key) चाहिए जो वेबसाइट बनाने वाले ने दी है।","Create the shop's admin account. You need the setup key from whoever set up this website.")}</p>
      <label for="k">${L("सेटअप की","Setup key")}</label><input id="k" name="k" autocomplete="off" required>
      <label for="u">${L("यूज़रनेम","Username")}</label><input id="u" name="u" autocomplete="username" required minlength="3" maxlength="40" autocapitalize="none">
      <label for="p">${L("पासवर्ड (कम से कम 8 अक्षर)","Password (min 8 characters)")}</label><input id="p" name="p" type="password" autocomplete="new-password" required minlength="8">
      <p class="err" id="err" role="alert"></p><button class="btn btn-primary btn-block">${L("अकाउंट बनाएँ","Create account")}</button></form>`;
    $("#f").onsubmit = async e => { e.preventDefault(); const f = e.target;
      try { await api("/api/admin/setup", {method:"POST", body:{setup_key:f.k.value.trim(), username:f.u.value.trim(), password:f.p.value}}); start(); } catch (x) { $("#err").textContent = x.message; } };
  }
  function loginView(){
    if ($("#shopBar")) $("#shopBar").hidden = true;
    app.innerHTML = authHero() + `<form class="a-card auth form" id="f">${authTabs("login")}<h1>${L("दुकानदार लॉगिन","Shopkeeper login")}</h1>
      <p class="hint">${L("ऑर्डर देखने और सामान बदलने के लिए लॉगिन करें।","Log in to see orders and manage items.")}</p>
      <label for="u">${L("मोबाइल नंबर / यूज़रनेम","Mobile number / username")}</label><input id="u" name="u" autocomplete="username" required autocapitalize="none">
      <label for="p">${L("पासवर्ड","Password")}</label><input id="p" name="p" type="password" autocomplete="current-password" required>
      <p class="err" id="err" role="alert"></p><button class="btn btn-primary btn-block">${L("लॉगिन","Log in")}</button>
      <p class="hint"><a href="#" id="forgot">${L("पासवर्ड भूल गए?","Forgot password?")}</a></p>
      <div class="signup-cta"><p class="hint">${L("अपनी दुकान ऑनलाइन लाना चाहते हैं?","Want to bring your shop online?")}</p><button class="btn btn-ghost btn-block" type="button" id="signup">🏪 ${L("नया दुकान अकाउंट बनाएं","Create a new shop account")}</button></div></form>`;
    $("#f").onsubmit = async e => { e.preventDefault(); const f = e.target;
      try { await api("/api/admin/login", {method:"POST", body:{username:f.u.value.trim(), password:f.p.value}}); start(); } catch (x) { $("#err").textContent = x.message; } };
    $("#forgot").onclick = e => { e.preventDefault(); recoverView(); };
    $("#signup").onclick = () => signupView(); bindTabs();
  }
  // v5: a new shopkeeper creates their own shop account (it starts "pending" until the developer approves it).
  // v10.11: big tap cards for the shop type (sign-up and Settings). Radios inside labels: one tap, keyboard and screen-reader friendly.
  const TYPE_ORDER = ["kirana","restaurant","salon","clinic","repair","other"];
  function typeCardsHtml(sel, name = "stype"){
    return `<div class="type-grid" role="radiogroup">${TYPE_ORDER.map(k => { const t = AK.TYPES[k];
      return `<label class="type-opt"><input type="radio" name="${name}" value="${k}" ${sel === k ? "checked" : ""} required><i class="ring" aria-hidden="true"></i><span class="to-ic" aria-hidden="true">${t.icon}</span><b>${esc(L(t.hi, t.en))}</b><small>${esc(L(t.d[0], t.d[1]))}</small></label>`; }).join("")}</div>`;
  }
  function typeChangeView(){
    const o = overlay(L("दुकान का प्रकार बदलें","Change shop type")); const cur = shopType();
    const pick = () => { o.body.innerHTML = `<p class="hint">${L("नया प्रकार चुनें। आपका सामान, ऑर्डर और सेटिंग वैसे ही रहेंगे — सिर्फ़ शब्द और आइकन बदलेंगे।","Choose the new type. Your items, orders and settings stay as they are — only words and icons change.")}</p>${typeCardsHtml(cur, "ctype")}<p class="err" id="tcErr" role="alert"></p>`;
      o.foot.innerHTML = `<button type="button" class="btn btn-primary btn-block" id="tcNext">${L("आगे","Next")} →</button>`;
      $("#tcNext").onclick = () => { const v = (o.body.querySelector('input[name="ctype"]:checked') || {}).value; if (!v || v === cur) { $("#tcErr").textContent = v === cur ? L("यही प्रकार अभी चल रहा है।","This is already your type.") : L("एक प्रकार चुनें","Choose a type"); return; } sure(v); }; };
    const sure = v => { const a = AK.TYPES[cur], b = AK.TYPES[v];
      o.body.innerHTML = `<div class="tc-sure"><p class="tc-swap"><span>${a.icon}</span> → <span>${b.icon}</span></p><p><b>${esc(L(a.hi, a.en))}</b> → <b>${esc(L(b.hi, b.en))}</b></p><p class="hint">${L("पक्का बदलना है? ग्राहकों को आपकी दुकान का पेज नए प्रकार में दिखेगा।","Sure? Customers will see your shop page as the new type.")}</p><p class="err" id="tcErr" role="alert"></p></div>`;
      o.foot.innerHTML = `<button type="button" class="btn btn-ghost" id="tcBack">← ${L("वापस","Back")}</button><button type="button" class="btn btn-primary" id="tcYes">✅ ${L("हाँ, बदलें","Yes, change")}</button>`;
      $("#tcBack").onclick = pick;
      $("#tcYes").onclick = async () => { const btn = $("#tcYes"); btn.disabled = true;
        try { const r = await api("/api/admin/shop-type", {method: "POST", body: {shop_type: v, confirm: true}}); me.shop.type = r.type; me.shop.type_info = r.type_info; applyShopType(); o.close(); toast(L("दुकान का प्रकार बदल गया ✅","Shop type changed ✅")); go("settings"); }
        catch (x) { $("#tcErr").textContent = x.message; btn.disabled = false; } }; };
    pick();
  }
  app.addEventListener("click", e => { if (e.target.closest("#typeChange")) typeChangeView(); });
  function signupView(){
    app.innerHTML = authHero() + `<form class="a-card auth form" id="f">${authTabs("signup")}<h1>🏪 ${L("नया दुकान अकाउंट बनाएं","Create a new shop account")}</h1>
      <p class="hint">${L("अपनी दुकान के लिए अलग अकाउंट। आपको सिर्फ़ अपनी दुकान के ऑर्डर और सामान दिखेंगे।","Your own account for your shop. You will see only your shop's orders and items.")}</p>
      <fieldset class="type-pick"><legend><span class="step-n">1</span> ${L("आपकी दुकान किस तरह की है?","What kind of shop is it?")}</legend>${typeCardsHtml("", "stype")}<p class="ferr" id="typeErr" role="alert"></p></fieldset>
      <p class="step-h"><span class="step-n">2</span> ${L("आपकी जानकारी","Your details")}</p>
      <label for="on">${L("आपका नाम","Your name")}</label><input id="on" name="on" required maxlength="60" autocomplete="name">
      <label for="sn">${L("दुकान का नाम","Shop name")}</label><input id="sn" name="sn" required maxlength="80">
      <label for="sl">${L("दुकान का लिंक (अंग्रेज़ी में)","Shop link (English letters)")}</label><div class="slug-row"><span>/s/</span><input id="sl" name="sl" maxlength="32" pattern="[a-z0-9\\-]{3,32}" placeholder="sharma-kirana" autocapitalize="none"></div>
      <label for="mo">${L("मोबाइल नंबर (इसी से लॉगिन होगा)","Mobile number (you log in with this)")}</label><input id="mo" name="mo" required inputmode="tel" maxlength="14" autocomplete="tel">
      <label for="p">${L("पासवर्ड (कम से कम 8 अक्षर)","Password (min 8 characters)")}</label><input id="p" name="p" type="password" autocomplete="new-password" required minlength="8">
      <p class="err" id="err" role="alert"></p><button class="btn btn-primary btn-block" id="suBtn">${L("अकाउंट बनाएं","Create account")}</button>
      <p class="hint"><a href="#" id="back">← ${L("पहले से अकाउंट है? लॉगिन करें","Already have an account? Log in")}</a></p></form>`;
    const slugOf = v => v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
    let touched = false; $("#sl").oninput = () => { touched = true; };
    $("#sn").oninput = e => { if (!touched) $("#sl").value = slugOf(e.target.value); };
    const ph = {kirana: "sharma-kirana", restaurant: "sharma-bhojnalaya", salon: "style-salon", clinic: "sharma-clinic", repair: "raju-repair", other: "meri-dukaan"};
    $("#f").addEventListener("change", e => { if (e.target.name === "stype") { $("#typeErr").textContent = ""; $("#sl").placeholder = ph[e.target.value] || "meri-dukaan"; } });
    $("#f").onsubmit = async e => { e.preventDefault(); const f = e.target; const btn = $("#suBtn");
      const st = (f.querySelector('input[name="stype"]:checked') || {}).value;
      if (!st) { $("#typeErr").textContent = L("ऊपर से अपनी दुकान का प्रकार चुनें","Choose your shop type above"); f.querySelector('input[name="stype"]').focus(); return; }
      btn.disabled = true;
      try { const r = await api("/api/admin/signup", {method:"POST", body:{owner_name:f.on.value.trim(), shop_name:f.sn.value.trim(), slug:f.sl.value.trim(), mobile:f.mo.value.trim(), password:f.p.value, shop_type: st}}); recoveryShown(r); }
      catch (x) { $("#err").textContent = x.message; btn.disabled = false; } };
    $("#back").onclick = e => { e.preventDefault(); loginView(); }; bindTabs();
  }
  function recoveryShown(r){
    const link = r.customer_url || (location.origin + r.link), short = link.replace(/^https?:\/\//, ""), pending = r.shop.status === "pending";
    const wa = `${r.shop.name} — ${L("घर बैठे सामान मँगाएँ 🛒","order from home 🛒")}\n${link}`;
    authHero();
    app.innerHTML = `<div class="a-card auth form ok-card">
      <div class="ok-head"><div class="ok-tick" aria-hidden="true">✓</div><h1>${L("बधाई हो! दुकान बन गई 🎉","Congrats! Your shop is created 🎉")}</h1><p class="hint">${r.shop.type && AK.TYPES[r.shop.type] ? AK.TYPES[r.shop.type].icon + " " : ""}${esc(r.shop.name)}</p></div>
      ${pending ? `<div class="ok-state pend"><b>⏳ ${L("मंज़ूरी बाकी","Waiting for approval")}</b><span>${L("आपकी दुकान मंज़ूरी के इंतज़ार में है। मंज़ूरी के बाद ग्राहक इस लिंक से ऑर्डर कर पाएँगे — तब तक अपना सामान जोड़ लें।","Your shop is waiting for approval. Customers can order from this link once it is approved — add your items meanwhile.")}</span></div>`
        : `<div class="ok-state live"><b>✅ ${L("दुकान चालू है","Your shop is approved")}</b><span>${L("सामान जोड़ें और ऊपर के स्विच से दुकान “ऑनलाइन” करें।","Add items and switch the shop ONLINE from the top bar.")}${r.trial_days ? " " + L(`${r.trial_days} दिन फ्री ट्रायल शुरू।`, `${r.trial_days}-day free trial started.`) : ""}</span></div>`}
      <div class="ok-id"><small>${L("आपकी दुकान की ID","Your shop ID")}</small><b id="okSlug">${esc(r.shop.slug)}</b>
        <small>${L("ग्राहकों के लिए आपकी लिंक","Your customer link")}</small><a href="${esc(link)}" target="_blank" rel="noopener" id="okLink">${esc(short)}</a>
        <div class="ok-btns"><button class="btn btn-ghost" type="button" id="okCopy">📋 ${L("कॉपी","Copy")}</button><button class="btn btn-ghost" type="button" id="okShare">📤 ${L("शेयर","Share")}</button><a class="btn sb-wa" href="https://wa.me/?text=${encodeURIComponent(wa)}" target="_blank" rel="noopener">💬 WhatsApp</a></div></div>
      <div class="ok-qr"><canvas id="okQr" width="220" height="220" aria-label="QR"></canvas><p class="hint">${L("ग्राहक यह QR स्कैन करके सीधे आपकी दुकान खोलेंगे","Customers scan this QR to open your shop")}</p>
        <div class="ok-btns two"><button class="btn btn-ghost" type="button" id="okQrDl">⬇️ ${L("QR डाउनलोड","Download QR")}</button><button class="btn btn-primary" type="button" id="okPoster">🖨️ ${L("QR पोस्टर (A4)","QR poster (A4)")}</button></div></div>
      <div class="ok-key"><p><b>🔑 ${L("रिकवरी की — इसे लिखकर रखें!","Recovery key — write it down!")}</b></p>
      <p class="rec-key" id="rk">${esc(r.recovery_key)}</p>
      <p class="hint">${L("पासवर्ड भूलने पर इसी से नया पासवर्ड बनेगा। यह दोबारा नहीं दिखेगी।","You need this to reset a forgotten password. It will not be shown again.")}</p>
      <button class="btn btn-ghost btn-block" type="button" id="cp">📋 ${L("रिकवरी की कॉपी करें","Copy recovery key")}</button></div>
      <button class="btn btn-primary btn-block ok-go" type="button" id="go">${L("मैंने लिख लिया — आगे बढ़ें","I have saved it — continue")} →</button></div>`;
    $("#cp").onclick = () => navigator.clipboard?.writeText(r.recovery_key).then(() => toast(L("कॉपी हो गया","Copied")), () => {});
    $("#go").onclick = () => start();
    $("#okCopy").onclick = () => copyText(link);
    $("#okShare").onclick = async () => { if (navigator.share) { try { await navigator.share({title: r.shop.name, text: wa, url: link}); } catch {} } else copyText(link); };
    loadScript("/qr.js?v=10.13.1").then(() => { drawQR($("#okQr"), qrUrl(link)); }).catch(() => { const c = $("#okQr"); if (c) c.hidden = true; });
    $("#okQrDl").onclick = async () => { try { await loadScript("/qr.js?v=10.13.1"); const c = document.createElement("canvas"); drawQR(c, qrUrl(link));
      const W = c.width + 40, out = document.createElement("canvas"); out.width = W; out.height = c.height + 90; const x = out.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0, 0, out.width, out.height); x.drawImage(c, 20, 20); x.fillStyle = "#111"; x.textAlign = "center";
      x.font = "bold 20px system-ui, sans-serif"; x.fillText(r.shop.name.slice(0, 28), W/2, c.height + 48); x.font = "14px system-ui, sans-serif"; x.fillText(short.slice(0, 44), W/2, c.height + 72);
      out.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `QR-${r.shop.slug}.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); toast(L("QR डाउनलोड हो गया","QR downloaded")); }, "image/png"); }
      catch (x) { toast(x.message); } };
    $("#okPoster").onclick = async ev => { const b = ev.currentTarget; b.disabled = true;
      try { await loadScript("/qr.js?v=10.13.1"); const blob = await AKQR.poster({url: qrUrl(link), name: r.shop.name, nameEn: /^[\x20-\x7e]+$/.test(r.shop.name) ? r.shop.name : "", phone: ""});
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `QR-poster-${r.shop.slug}.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); toast(L("पोस्टर डाउनलोड हो गया","Poster downloaded")); }
      catch (x) { toast(x.message); } b.disabled = false; };
  }

  function recoverView(){
    app.innerHTML = authHero() + `<form class="a-card auth form" id="f"><h1>${L("नया पासवर्ड","Reset password")}</h1>
      <p class="hint">${L("अकाउंट बनाते समय मिली रिकवरी की डालें।","Enter the recovery key you got when the account was created.")}</p>
      <label for="k">${L("सेटअप / रिकवरी की","Setup / recovery key")}</label><input id="k" name="k" autocomplete="off" required>
      <label for="u">${L("मोबाइल नंबर / यूज़रनेम","Mobile number / username")}</label><input id="u" name="u" required autocapitalize="none">
      <label for="p">${L("नया पासवर्ड","New password")}</label><input id="p" name="p" type="password" autocomplete="new-password" minlength="8" required>
      <p class="err" id="err" role="alert"></p><button class="btn btn-primary btn-block">${L("पासवर्ड बदलें","Reset password")}</button>
      <p class="hint"><a href="#" id="back">← ${L("लॉगिन","Login")}</a></p></form>`;
    $("#f").onsubmit = async e => { e.preventDefault(); const f = e.target;
      try { await api("/api/admin/recover", {method:"POST", body:{setup_key:f.k.value.trim(), username:f.u.value.trim(), password:f.p.value}}); toast(L("पासवर्ड बदल गया, अब लॉगिन करें","Password reset — log in now")); loginView(); } catch (x) { $("#err").textContent = x.message; } };
    $("#back").onclick = e => { e.preventDefault(); loginView(); };
  }
  function passwordView(forced){
    const html = `<form class="a-card form ${forced?"auth":""}" id="pf"><h2>${L("पासवर्ड बदलें","Change password")}</h2>
      ${forced?`<p class="hint">${L("सुरक्षा के लिए पहले अपना पासवर्ड बदलें।","For safety, set your own password first.")}</p>`:""}
      <label for="cur">${L("अभी का पासवर्ड","Current password")}</label><input id="cur" name="cur" type="password" autocomplete="current-password" required>
      <label for="np">${L("नया पासवर्ड (8+ अक्षर)","New password (8+ chars)")}</label><input id="np" name="np" type="password" autocomplete="new-password" minlength="8" required>
      <p class="err" id="perr" role="alert"></p><button class="btn btn-primary btn-block">${L("बदलें","Change")}</button></form>`;
    if (forced) app.innerHTML = html; else return html;
    bindPw();
  }
  function bindPw(){ const f = $("#pf"); if (!f) return; f.onsubmit = async e => { e.preventDefault();
    try { await api("/api/admin/password", {method:"POST", body:{current:f.cur.value, password:f.np.value}}); toast(L("पासवर्ड बदल गया","Password changed")); f.reset(); if (me?.must_change) { me.must_change = false; start(); } } catch (x) { $("#perr").textContent = x.message; } }; }
  function authFail(e){ if (e.status === 401) { clearInterval(pollT); $("#tabs").hidden = true; loginView(); return true; } return false; }

  // ---------- navigation ----------
  // v10.13: salon/service shops have no bottom bar — 3 small centred pills (Appointments · Services · Reports) on Today,
  // the same pills + "‹ Today" on top of the other pages, and a small ⚙ in the header for Settings (Offers etc. live in Settings).
  const pillLabel = k => k === "orders" ? PW("orders_tab", "Orders") : k === "products" ? PW("services", WL("items")) : k === "reports" ? PW("reports", L("रिपोर्ट","Reports")) : k === "settings" ? PW("settings", L("सेटिंग","Settings")) : PW("back_today", L("आज","Today"));
  const PILL_IC = {today: "‹", orders: "📅", products: "✂️", reports: "📊", settings: "⚙️"};
  // on Today: the 3 pills; on a pill page: "‹ Today" + the other 2; on Settings / Offers / Categories: just "‹ Today" (fits 360px, no scrolling)
  const pillsHtml = (cur, withBack) => `<nav class="svc-pills" aria-label="${esc(PW("more_tools", "Menu"))}">${(withBack ? ["today"].concat((PROF().pills || []).includes(cur) ? PROF().pills.filter(k => k !== cur) : []) : PROF().pills || []).map(k => `<button type="button" class="svc-pill${k === "today" ? " sp-back" : ""}" data-go="${k}" aria-current="${k === cur ? "page" : "false"}"><span aria-hidden="true">${PILL_IC[k]}</span> ${esc(pillLabel(k))}</button>`).join("")}</nav>`;
  // v10.13.0 (Krish 10:07 PM "Ye jaisa hai vaisa"): Today shows a 2×2 grid of compact tiles — 📅 Appointments, ✂️ Services, 📊 Reports, ⚙️ Settings
  const gridHtml = () => `<nav class="svc-grid" aria-label="${esc(PW("more_tools", "Menu"))}">${(PROF().grid || PROF().pills || []).map(k => `<button type="button" class="svc-tile" data-go="${k}"><span class="st-ic" aria-hidden="true">${PILL_IC[k]}</span><span class="st-lb">${esc(pillLabel(k))}</span></button>`).join("")}</nav>`;
  function svcChrome(t){
    const og = $("#gearBtn"); if (og) og.remove(); // v10.13.0 (grid): Settings is a tile on Today now, so no ⚙ in the header
    let bar = $("#svcNav");
    if (!isSvc() || t === "today") { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement("div"); bar.id = "svcNav"; bar.className = "svc-nav"; ($("#shopBar") || app).before(bar); }
    bar.innerHTML = pillsHtml(t, true);
  }
  document.addEventListener("click", e => { const b = e.target.closest(".svc-pill[data-go], .svc-tile[data-go], .td-nudge[data-go]"); if (b) go(b.dataset.go); });
  function go(t){ tab = t; document.body.classList.toggle("tab-today", t === "today");
    { const sb = $("#shopBar"); if (sb) sb.classList.toggle("sb-away", t !== "today"); } // v10.14 (Krish 11:39 PM): Open/Close + link + Copy/WhatsApp/QR/App only on the home tab $("#tabs").hidden = isSvc(); svcChrome(t); document.querySelectorAll(".a-tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === t ? "page" : "false")); window.scrollTo(0,0);
    ({today:todayView, orders:ordersView, stock:stockView, products:productsView, categories:categoriesView, offers:offersView, reports:reportsView, settings:settingsView, history:() => historyView(null)})[t](); }
  $("#tabs").onclick = e => { const b = e.target.closest("[data-tab]"); if (b) go(b.dataset.tab); };


  // ---------- v6: shop ONLINE/OFFLINE switch + fixed customer link (copy / WhatsApp / QR) + home-screen app ----------
  function renderShopBar(){
    const el = $("#shopBar"); if (!el || !me || !me.shop) return; const sh = me.shop;
    const st = (svcNow && svcNow.status) || sh.status; const can = st === "active" || st === "grace"; const on = can && !!sh.online;
    const sub = st === "pending" ? L("⏳ मंज़ूरी बाकी — मंज़ूरी के बाद ऑनलाइन कर पाएँगे","⏳ Waiting for approval — you can go online after approval")
      : st === "paused" ? L("⛔ सेवा रुकी हुई है — डेवलपर से संपर्क करें","⛔ Service paused — contact the developer")
      : on ? L("ग्राहक ऑर्डर कर सकते हैं","Customers can order now") : L("ग्राहकों को “अभी बंद है” दिखेगा","Customers see “closed right now”");
    const url = sh.customer_url || (location.origin + sh.link);
    const wa = `${sh.name} — ${L("घर बैठे सामान मँगाएँ 🛒","order from home 🛒")}\n${url}`;
    el.hidden = false;
    el.innerHTML = `<button type="button" class="sb-toggle ${on ? "on" : "off"}" id="onSw" role="switch" aria-checked="${on}" ${can ? "" : "disabled"}><span class="sbt-dot" aria-hidden="true"></span><span class="sbt-tx"><b>${on ? L("दुकान खुली है","Shop Open") : L("दुकान बंद है","Shop Closed")}</b><small>${can ? (on ? L("बंद करने के लिए टैप करें","Tap to close") : L("खोलने के लिए टैप करें","Tap to open")) : sub}</small></span><span class="sbt-knob" aria-hidden="true"><i></i></span></button>
      <div class="sb-link"><small>${L("ग्राहकों के लिए आपका पक्का लिंक","Your fixed customer link")}</small><a href="${esc(url)}" target="_blank" rel="noopener" id="custUrl">${esc(url.replace(/^https?:\/\//, ""))}</a></div>
      <div class="sb-btns"><button type="button" class="btn btn-ghost" id="sbCopy">📋 ${L("कॉपी","Copy")}</button><a class="btn sb-wa" href="https://wa.me/?text=${encodeURIComponent(wa)}" target="_blank" rel="noopener">💬 WhatsApp</a><button type="button" class="btn btn-ghost" id="sbQr">🖨️ QR</button><button type="button" class="btn btn-ghost" id="sbApp">📱 ${L("ऐप","App")}</button></div>`;
    // v10.12: one tap = Shop Open / Closed (the same ONLINE flag; closed = customers see "Closed" and the server refuses orders)
    $("#onSw").onclick = async e => { const b = e.currentTarget; const want = b.getAttribute("aria-checked") !== "true"; b.disabled = true;
      try { const r = await api("/api/admin/online", {method:"POST", body:{online: want}}); me.shop.online = r.online; toast(r.online ? L("दुकान खुली ✅ ग्राहक ऑर्डर कर सकते हैं","Shop is open ✅ Customers can order") : L("दुकान बंद — ग्राहकों को “बंद है” दिखेगा","Shop is closed. Customers see “Closed”")); }
      catch (x) { if (!authFail(x)) toast(x.message); } renderShopBar(); };
    $("#sbCopy").onclick = () => copyText(url);
    $("#sbQr").onclick = ev => downloadPoster(ev.currentTarget);
    $("#sbApp").onclick = () => homeScreenSheet();
  }
  function copyText(t){ const ok = () => toast(L("लिंक कॉपी हो गया ✅","Link copied ✅"));
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(ok, () => fallback());
    fallback(); function fallback(){ const i = document.createElement("textarea"); i.value = t; document.body.appendChild(i); i.select(); try { document.execCommand("copy"); ok(); } catch {} i.remove(); } }
  // v10.13: a salon's printed QR carries ?src=qr, so a scan at the shop is a walk-in (straight into the queue). The shared link stays plain = online.
  const qrUrl = u => !isSvc() || !u ? u : u + (u.includes("?") ? "&" : "?") + "src=qr";
  async function downloadPoster(b){ if (b) b.disabled = true;
    try { const s = (D && D.settings) || (await loadDash()).settings; await loadScript("/qr.js?v=10.13.1");
      const url = (me.shop && me.shop.customer_url) || location.origin + me.shop.link;
      const en = AK.lang === "en", nHi = s.store_name_hi || (me.shop && me.shop.name) || "", nEn = s.store_name_en || "";
      const blob = await AKQR.poster({url: qrUrl(url), name: en ? (nEn || nHi) : nHi, nameEn: en ? (nEn && nHi !== nEn ? nHi : "") : nEn, phone: s.phone || "", lang: AK.lang});
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `QR-poster-${(me.shop && me.shop.slug) || "dukan"}.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      toast(L("पोस्टर डाउनलोड हो गया","Poster downloaded")); }
    catch (x) { toast(x.message); } if (b) b.disabled = false; }
  const upImg = data_url => api("/api/admin/image", {method:"POST", body:{data_url}}).then(r => r.image_id);
  // First login: make the initials icon so "Add to Home Screen" shows a proper tile even before a logo is uploaded.
  // v8: no automatic letter tile any more — a shop without its own logo shows the platform logo (server-side fallback).
  async function autoIcons(){ return; try { const ap = me.shop && me.shop.app; if (!ap || ap.lock || (ap.icons && ap.icons.i192)) return; const st = (svcNow && svcNow.status) || me.shop.status; if (st === "paused") return;
    await loadScript("/appicon.js"); const ids = await AppIcon.uploadAll(AppIcon.fromInitials(me.shop.name, ap.color), upImg);
    const r = await api("/api/admin/app", {method:"PUT", body:{icons: ids}}); me.shop.app = r.app; } catch (e) { console.warn("auto icon", e); } }
  async function homeScreenSheet(){
    await loadScript("/appicon.js"); const ap = me.shop.app || {}; const locked = !!ap.lock;
    let pending = null, color = ap.color || "#1f6b3a", name = ap.name || "", preview = ap.icon_urls && (ap.icon_urls.i192) || null;
    openSheet(L("होम-स्क्रीन पर लोगो और नाम","Home-screen logo & name"));
    $("#sheetBody").innerHTML = `<div class="hs-wrap"><p class="hint">${L("ग्राहक जब आपका लिंक “Add to Home Screen” करेंगे, तो उनके फ़ोन पर यही लोगो और नाम दिखेगा।","When customers “Add to Home Screen”, their phone shows this logo and name.")}</p>
      <div class="hs-phone" aria-label="${L("झलक","Preview")}"><div class="hs-app"><div class="hs-ic" id="hsIc"></div><span id="hsNm"></span></div><div class="hs-app ghost"><div class="hs-ic"></div><span>Camera</span></div><div class="hs-app ghost"><div class="hs-ic"></div><span>WhatsApp</span></div></div>
      ${locked ? `<p class="info-note">🔒 ${L("डेवलपर ने लोगो और नाम लॉक किया है। बदलना हो तो डेवलपर से कहें।","The developer has locked the logo and name. Ask the developer to change it.")}</p>` : `
      <form class="form" id="hsF"><label for="hsName">${L("होम-स्क्रीन नाम (12 अक्षर तक)","Home-screen name (max 12)")} <small id="hsCnt"></small></label><input id="hsName" maxlength="24" value="${esc(name)}" placeholder="${esc(ap.home_name || me.shop.name)}">
      <label>${L("लोगो","Logo")}</label><div class="row2"><label class="btn btn-ghost">🖼️ ${L("लोगो चुनें","Choose logo")}<input type="file" accept="image/*" id="hsFile" hidden></label><button class="btn btn-ghost" type="button" id="hsIni">🏪 ${L("Apna Dhanda लोगो","Platform logo")}</button></div>
      <label for="hsCol">${L("रंग","Colour")}</label><input type="color" id="hsCol" value="${esc(color)}">
      <p class="err" id="hsErr" role="alert"></p><button class="btn btn-primary btn-block" type="submit">💾 ${L("सेव करें","Save")}</button></form>`}</div>`;
    const cnt = v => AppIcon.count ? AppIcon.count(v) : [...v].length;
    const paint = () => { const nm = ($("#hsName") ? $("#hsName").value.trim() : name) || ap.home_name || me.shop.name; $("#hsNm").textContent = nm;
      const ic = $("#hsIc"); ic.style.background = color; ic.innerHTML = `<img src="${esc(preview || ("/s/" + me.shop.slug + "/icon.svg?b=1"))}" alt="">`;
      if ($("#hsCnt")) { const n = cnt($("#hsName").value.trim()); $("#hsCnt").textContent = `${n}/12`; $("#hsCnt").style.color = n > 12 ? "#b91c1c" : ""; } };
    paint(); if (locked) return;
    $("#hsName").oninput = paint;
    $("#hsCol").oninput = e => { color = e.target.value; paint(); };
    $("#hsFile").onchange = async e => { const f = e.target.files[0]; if (!f) return; try { pending = await AppIcon.fromFile(f, color); preview = pending.i192; paint(); } catch (x) { toast(x.message); } };
    $("#hsIni").onclick = () => { pending = "clear"; preview = null; paint(); };
    $("#hsF").onsubmit = async e => { e.preventDefault(); const nm = $("#hsName").value.trim(); if (cnt(nm) > 12) { $("#hsErr").textContent = L("नाम 12 अक्षर तक रखें","Keep the name to 12 characters"); return; }
      const btn = e.target.querySelector("[type=submit]"); btn.disabled = true;
      try { const body = {name: nm, theme: color}; if (pending === "clear") body.icons = {}; else if (pending) body.icons = await AppIcon.uploadAll(pending, upImg);
        const r = await api("/api/admin/app", {method:"PUT", body}); me.shop.app = r.app; toast(L("सेव हो गया ✅ नए ग्राहकों के फ़ोन पर यही दिखेगा","Saved ✅")); closeSheet(); }
      catch (x) { if (!authFail(x)) $("#hsErr").textContent = x.message; btn.disabled = false; } };
  }
  // ---------- orders ----------
  // ---------- service status banner (set by the developer: grace = payment due, paused = read-only) ----------
  let svcT = null, svcNow = null;
  function renderSvc(svc){
    const wasExpired = isExpired(svcNow); svcNow = svc || null; const el = $("#svcBanner");
    if (inRecharge) { if (el) el.hidden = true; const sb = $("#shopBar"); if (sb) sb.hidden = true; if (wasExpired && !isExpired(svc) && !rechargeByChoice) location.replace("/admin"); return; }
    if (isExpired(svc)) return rechargeView();
    if (me && me.shop) renderShopBar(); if (!el) return;
    const st = svc && svc.status || "active"; document.body.classList.toggle("svc-paused", st === "paused" && !isExpired(svc));
    const sub = svc && svc.sub;
    if (st === "active" && sub && (sub.state === "DUE" || sub.state === "PAYMENT_PENDING_VERIFY" || (subBill && subBill.status === "unpaid"))) {
      const day = t => new Date(t).toLocaleDateString(AK.lang === "en" ? "en-IN" : "hi-IN", {timeZone:"Asia/Kolkata", day:"numeric", month:"short"});
      el.className = "svc-banner grace"; el.hidden = false;
      el.innerHTML = sub.state === "PAYMENT_PENDING_VERIFY"
        ? `<b>⏳ ${L("पेमेंट की जाँच हो रही है","Payment is being verified")}</b><small>${L(`दुकान ${day(sub.provisional_until)} तक चालू है। जाँच के बाद अपने आप आगे बढ़ जाएगी।`, `Your shop stays open till ${day(sub.provisional_until)}; it extends automatically once verified.`)}</small>`
        : `<b>🔔 ${sub.state === "DUE" ? L(`सब्सक्रिप्शन ${sub.days_left} दिन में खत्म हो रहा है`, `Subscription ends in ${sub.days_left} day(s)`) : L("नया सब्सक्रिप्शन बिल आया है","New subscription bill")}</b>
           <small>${subBill ? `${L("बिल","Bill")} ${esc(subBill.number)} · ${money(subBill.amount_paise)} · ` : ""}${L(`${day(sub.ends_at)} के बाद दुकान अपने आप रुक जाएगी।`, `The shop pauses by itself after ${day(sub.ends_at)}.`)}</small>
           <span class="svc-dl"><a class="btn btn-primary" href="#recharge" id="goRecharge">💳 ${L("सब्सक्रिप्शन रिचार्ज करें","Recharge subscription")}</a></span>`;
      const g = el.querySelector("#goRecharge"); if (g) g.onclick = e => { e.preventDefault(); rechargeByChoice = true; rechargeView(); };
      return;
    }
    if (st === "active") { el.hidden = true; el.innerHTML = ""; return; }
    if (st === "pending") { el.className = "svc-banner grace"; el.hidden = false;
      el.innerHTML = `<b>⏳ ${L("आपकी दुकान मंज़ूरी के इंतज़ार में है","Your shop is waiting for approval")}</b><small>${L("मंज़ूरी के बाद ग्राहक ऑर्डर कर पाएँगे। तब तक अपना सामान, सेटिंग और फ़ोन नंबर भर लें।","Customers can order once it is approved. Meanwhile add your items, settings and phone number.")}</small>`; return; }
    const tel = svc.dev_contact ? ` <a href="tel:+91${esc(svc.dev_contact)}">📞 ${esc(svc.dev_contact)}</a>` : "";
    const day = t => new Date(t).toLocaleDateString(AK.lang === "en" ? "en-IN" : "hi-IN", {timeZone:"Asia/Kolkata", day:"numeric", month:"short"});
    el.className = "svc-banner " + st; el.hidden = false;
    el.innerHTML = st === "grace"
      ? `<b>⚠️ ${L("मेंटेनेंस भुगतान बाकी — डेवलपर से संपर्क करें","Maintenance payment due — contact developer")}</b>${tel}
         <small>${L("वेबसाइट अभी चालू है।","The website is still working.")}${svc.pauses_at ? " " + L(`भुगतान न होने पर ${day(svc.pauses_at)} को ऑनलाइन ऑर्डर रुक जाएँगे।`, `Online ordering pauses on ${day(svc.pauses_at)} if unpaid.`) : ""}</small>`
      : `<b>⛔ ${L("सेवा रुकी हुई है — डेवलपर से संपर्क करें","Service paused — contact developer")}</b>${tel}
         <small>${L("ग्राहक अभी ऑर्डर नहीं कर सकते। पैनल सिर्फ़ देखने के लिए है। आपका सारा डेटा सुरक्षित है — नीचे से डाउनलोड करें।","Customers can't order right now. The panel is read-only. All your data is safe — download it below.")}</small>
         <span class="svc-dl"><a class="btn btn-ghost" href="/api/admin/csv" download>⬇️ ${L("सामान CSV","Items CSV")}</a><a class="btn btn-ghost" href="/api/admin/orders.csv" download>⬇️ ${L("ऑर्डर CSV","Orders CSV")}</a></span>`;
  }
  async function loadDash(){ D = await api("/api/admin/dashboard"); renderSvc(D.service); const sn = D.settings.store_name_hi || "Admin"; $("#aStore").textContent = sn; if (D.admin) { me = {...me, ...D.admin}; renderShopBar(); } return D; }
  let orderExtra = {}; // v10.8: date filter / "finished today" (dashboard chips)
  // ---------- v10.12: 📋 Today's orders — the shopkeeper's home. Only the active orders, big buttons; everything else is in the menu.
  const ordersHome = () => tab === "today" ? todayView() : ordersView();
  async function todayView(){
    const pre = activeOrders();
    try { await loadDash(); } catch (e) { if (!authFail(e)) errRetry(app, e, todayView); return; }
    if (isSvc()) return svcTodayView(pre);
    if (!lastMaxId) lastMaxId = D.latest_order_id;
    const c = Object.fromEntries(D.counts.map(x => [x.status, x.n]));
    const active = (c.pending||0)+(c.accepted||0)+(c.preparing||0)+(c.ready||0)+(c.out_for_delivery||0);
    const ds = D.dash || {active, delivered_today: 0, order_value_today: (D.today && D.today.value) || 0};
    orderFilter = "active"; orderExtra = {};
    const big = (id, ic, txt) => `<button type="button" class="td-btn" id="${id}"><span aria-hidden="true">${ic}</span><b>${txt}</b></button>`;
    app.innerHTML = `<section class="today">
      <div class="td-head"><h2>📋 ${L("आज के ऑर्डर","Today's orders")}</h2><span class="td-date">${new Date().toLocaleDateString(AK.lang === "en" ? "en-IN" : "hi-IN", {weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata"})}</span></div>
      <div class="td-stats"><div class="ts-a"><b>${ds.active ?? active}</b><small>${L("नए / चालू","New / active")}</small></div><div><b>${ds.delivered_today ?? 0}</b><small>${L("पूरे हुए","Done")}</small></div><div><b>${money(ds.order_value_today ?? 0)}</b><small>${L("आज की बिक्री","Sales today")}</small></div></div>
      <div id="olist" class="olist td-list"><p class="loading">…</p></div>
      <h3 class="td-more-h">${L("और","More")}</h3>
      <div class="td-grid">${big("tdAll", "🛒", L("सारे ऑर्डर","All orders"))}${big("tdItems", "🧺", L(W("items")[0], W("items")[1]))}${shopFam() === "kirana" ? big("tdStock", "📦", L("स्टॉक","Stock")) : ""}${big("tdCat", "🗂️", L("कैटेगरी","Categories"))}${big("tdQr", "🖨️", L("QR पोस्टर","QR poster"))}${big("tdShare", "💬", L("लिंक भेजें","Share link"))}${big("tdSet", "⚙️", L("सेटिंग","Settings"))}</div>
    </section>`;
    $("#tdAll").onclick = () => go("orders"); $("#tdItems").onclick = () => go("products"); if ($("#tdStock")) $("#tdStock").onclick = () => go("stock"); $("#tdSet").onclick = () => go("settings"); $("#tdCat").onclick = () => go("categories");
    $("#tdQr").onclick = ev => downloadPoster(ev.currentTarget);
    $("#tdShare").onclick = () => { const url = (me.shop && me.shop.customer_url) || location.origin + me.shop.link; const txt = `${me.shop.name}: ${L("घर बैठे ऑर्डर करें","order from home")}\n${url}`;
      if (navigator.share) navigator.share({title: me.shop.name, text: txt}).catch(() => {}); else window.open("https://wa.me/?text=" + encodeURIComponent(txt), "_blank", "noopener"); };
    await loadOrders(pre);
    const ol = $("#olist"); if (ol && ol.querySelector("p.empty") && !ol.querySelector("[id^='o-']")) ol.innerHTML = `<div class="td-empty"><span aria-hidden="true">☕</span><b>${L("अभी कोई नया ऑर्डर नहीं","No new orders right now")}</b><small>${L("नया ऑर्डर आते ही यहाँ दिखेगा और घंटी बजेगी","New orders show up here with a ring")}</small></div>`;
  }

  // ---------- v10.13: 📅 Today's Appointments — salon / service shops. KPIs first, the 2×2 tile grid, then the active list.
  // Same data as the kirana Today (dashboard + active orders); "Waiting" = pending, "In Service" = accepted…, "Completed" = delivered.
  async function svcTodayView(pre){
    // v10.13 (Krish 10:27 PM): Waiting + In service counts, online requests (✅/❌), auto-accept switch, the token queue, then the 2×2 tiles.
    // No manual add: customers add themselves by scanning the shop QR.
    if (!lastMaxId) lastMaxId = D.latest_order_id;
    const ds = D.dash || {delivered_today: 0, delivered_value_today: 0};
    const auto = !!(D.settings && D.settings.auto_accept);
    orderFilter = "active"; orderExtra = {};
    const dt = new Date().toLocaleDateString(AK.lang === "en" ? "en-IN" : "hi-IN", {day: "numeric", month: "short", timeZone: "Asia/Kolkata"});
    app.innerHTML = `<section class="today today-svc">
      <div class="td-head"><h2>${PROF().words.today_icon || "📅"} ${esc(PW("today_title", ""))}</h2><span class="td-date">${dt}</span></div>
      <div class="td-big"><div class="tb-wait"><b id="tbWait">…</b><small>⏳ ${esc(L("इंतज़ार में","Waiting"))}</small></div><div class="tb-in"><b id="tbIn">…</b><small>✂️ ${esc(L("सेवा चालू","In service"))}</small></div></div>
      <p class="td-mini"><span id="tdNextV">⏭️ —</span><span>${shopType() === "salon" ? `✅ ${esc(L("आज पूरी","Done today"))}: ${ds.delivered_today ?? 0}` : `💰 ${money(ds.delivered_value_today ?? 0)} · ✅ ${ds.delivered_today ?? 0}`}</span></p>
      <label class="aa-row"><span><b>⚡ ${esc(L("ऑटो-स्वीकार","Auto-accept"))}</b><small>${esc(auto ? L("घर से आई बुकिंग सीधे लाइन में जुड़ेगी","Online bookings join the queue directly") : L("घर से आई बुकिंग पहले आपसे पूछेगी","Online bookings wait for your ✅ Accept"))}</small></span><input type="checkbox" role="switch" id="aaSw" ${auto ? "checked" : ""} aria-label="${esc(L("ऑटो-स्वीकार","Auto-accept"))}"><i class="aa-knob" aria-hidden="true"></i></label>
      <div id="priceNudge"></div>
      <div id="reqBox"></div>
      <h3 class="td-sec">📋 ${esc(L("आज की लाइन","Today's queue"))}</h3>
      <div id="olist" class="olist td-list"><p class="loading">…</p></div>
      ${gridHtml()}
    </section>`;
    $("#aaSw").onchange = async ev => { const on = ev.target.checked; ev.target.disabled = true;
      try { await api("/api/admin/settings", {method: "PUT", body: {auto_accept: on}}); if (D.settings) D.settings.auto_accept = on; toast(on ? L("⚡ ऑटो-स्वीकार चालू","⚡ Auto-accept ON") : L("ऑटो-स्वीकार बंद","Auto-accept OFF")); }
      catch (x) { if (!authFail(x)) { toast(x.message); ev.target.checked = !on; } } ev.target.disabled = false; svcTodayView(); };
    // v10.13.1: a gentle one-line nudge while some services still have no price (they stay hidden from customers until priced)
    if (shopType() !== "salon") loadCatalog().then(c => { const n = (c.products || []).filter(p => !p.variants || !p.variants.length).length, el = $("#priceNudge"); if (!el) return;
      el.innerHTML = n ? `<button type="button" class="svc-nudge td-nudge" data-go="products">💡 ${esc(L("बुकिंग शुरू करने के लिए सेवाओं के दाम डालें","Set prices to start taking bookings"))} ›</button>` : ""; }).catch(() => {});
    await loadOrders(pre);
    if (!$("#reqBox")) return; // v10.15.1: the owner moved to another screen while this loaded
    const list = [...ORD.values()];
    const reqs = list.filter(o => o.source && o.status === "pending" && o.token_no == null).sort((a, b) => a.created_at - b.created_at);
    const queue = list.filter(o => !reqs.includes(o)).sort((a, b) => (a.status === "pending") - (b.status === "pending") || (a.token_no ?? 1e9) - (b.token_no ?? 1e9) || a.created_at - b.created_at);
    $("#reqBox").innerHTML = reqs.length ? `<h3 class="td-sec td-req">🏠 ${esc(L("ऑनलाइन रिक्वेस्ट","Online requests"))} (${reqs.length})</h3><div class="olist td-list">${reqs.map(orderCard).join("")}</div>` : "";
    $("#olist").innerHTML = queue.length ? queue.map(orderCard).join("") : `<p class="td-empty-line">${esc(L("लाइन में अभी कोई नहीं — ग्राहक QR स्कैन करके ख़ुद जुड़ेंगे","No one in the queue — customers join by scanning your QR"))}</p>`;
    const nWait = queue.filter(o => o.status === "pending").length;
    salonHead(nWait, reqs.length);
    $("#tbWait").textContent = nWait; $("#tbIn").textContent = queue.filter(o => o.status !== "pending").length;
    const nx = queue.filter(o => o.status === "pending")[0];
    const iname = i => AK.lang === "en" && i.product_name_en ? i.product_name_en : i.product_name;
    $("#tdNextV").innerHTML = `⏭️ ${esc(PW("kpi_next", ""))}: ` + (nx ? `${nx.token_no != null ? `<b class="tok-badge">#${Number(nx.token_no)}</b> ` : ""}${esc(nx.customer_name)} · ${esc(nx.items.map(iname).slice(0, 1).join(", "))}` : "—");
  }
  // v10.13: the Appointments tile = a read-only history (today + past days, newest first). No add button, no actions.
  async function svcHistoryView(){
    app.innerHTML = `<section class="svc-hist"><h2>📅 ${esc(L("अपॉइंटमेंट हिस्ट्री","Appointment history"))}</h2><div id="hist"><p class="loading">…</p></div></section>`;
    let r; try { r = await api("/api/admin/orders?status=all"); } catch (e) { if (!authFail(e)) $("#hist") && errRetry($("#hist"), e, svcHistoryView); return; }
    if (!$("#hist")) return;
    const iname = i => AK.lang === "en" && i.product_name_en ? i.product_name_en : i.product_name;
    const day = ms => new Date(ms).toLocaleDateString(AK.lang === "en" ? "en-IN" : "hi-IN", {weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata"});
    const tm = ms => new Date(ms).toLocaleTimeString(AK.lang === "en" ? "en-IN" : "hi-IN", {hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata"});
    let last = ""; const rows = [];
    for (const o of r.orders) { const d = day(o.created_at); if (d !== last) { rows.push(`<h3 class="hist-day">${esc(d)}</h3>`); last = d; }
      const req = o.source && o.status === "pending" && o.token_no == null;
      rows.push(`<div class="hist-row st-${o.status}"><span class="hist-tok">${o.token_no != null ? "#" + Number(o.token_no) : "—"}</span><span class="hist-main"><b>${esc(o.customer_name)}</b>${srcTag(o)}<small>${esc(o.items.map(iname).join(", "))} · ${tm(o.created_at)}</small></span><span class="badge st-${o.status}${req ? " st-request" : ""}">${esc(req ? L("नई रिक्वेस्ट","Request") : o.skipped_at ? L("⏭ स्किप","⏭ Skipped") : stName(o.status))}</span></div>`); }
    $("#hist").innerHTML = rows.length ? rows.join("") : `<p class="td-empty-line">${esc(L("अभी कोई अपॉइंटमेंट नहीं","No appointments yet"))}</p>`;
  }
  async function ordersView(){
    if (isSvc()) return svcHistoryView();
    try { await loadDash(); } catch (e) { if (!authFail(e)) errRetry(app, e, ordersView); return; }
    if (!lastMaxId) lastMaxId = D.latest_order_id;
    const c = Object.fromEntries(D.counts.map(x => [x.status, x.n]));
    const active = (c.pending||0)+(c.accepted||0)+(c.preparing||0)+(c.ready||0)+(c.out_for_delivery||0);
    const ds = D.dash || {active, delivered_today: 0, closed_today: 0, delivered_value_today: 0, order_value_today: D.today.value, out_count: 0, low_only_count: D.low_count};
    const lowN = D.dash ? ds.low_only_count : D.low_count;
    const svc = isSvc(); const dlvT = svc ? L("आज पूरे हुए","Completed today") : L("आज पहुँचे","Delivered today");
    const chip = (k, ic, n, label) => `<button type="button" class="dchip" data-chip="${k}" aria-pressed="${orderExtra.chip === k}"><span aria-hidden="true">${ic}</span> <b>${n}</b> <small>${label}</small></button>`;
    app.innerHTML = `
      <div class="gsearch"><label class="sr-only" for="gq">${L("सामान या ऑर्डर खोजें","Search items or orders")}</label><input id="gq" type="search" autocomplete="off" placeholder="🔍 ${svc ? L("सेवा, नाम या फ़ोन खोजें","Search services, name or phone") : L("सामान, ऑर्डर नं., नाम या फ़ोन खोजें","Search items, order no., name or phone")}"><div id="gres" class="gres" hidden></div></div>
      <div class="stats"><div class="stat ${c.pending?"hot":""}"><b>${c.pending||0}</b><small>${svc ? esc(stName("pending")) : L("नए (मंज़ूरी बाकी)","New (pending)")}</small></div>
      <div class="stat"><b>${D.today.n}</b><small>${svc ? esc(PW("today_title", "")) : L("आज के ऑर्डर","Today's orders")}</small></div>
      <div class="stat"><b>${money(D.today.value)}</b><small>${L("आज की बिक्री","Today's value")}</small></div></div>
      <div class="dchips" role="group" aria-label="${L("आज का हाल","Today")}">${chip("active", "✅", ds.active, L("चालू","Active"))}${chip("delivered", svc ? "✔️" : "🏠", ds.delivered_today, dlvT)}${chip("closed", "❌", ds.closed_today, L("आज रद्द/अस्वीकार","Cancelled+rejected today"))}</div>
      <p class="sales-line">💰 ${svc ? dlvT : L("आज पहुँचे ऑर्डर","Delivered today")}: <b>${money(ds.delivered_value_today)}</b> · ${svc ? L("आज की सारी अपॉइंटमेंट (रद्द छोड़कर)","All appointments today (excl. cancelled)") : L("आज के कुल ऑर्डर (रद्द छोड़कर)","All orders today (excl. cancelled)")}: <b>${money(ds.order_value_today)}</b></p>
      <div class="qa-row">
        <button type="button" class="qa" data-qa="add"><span aria-hidden="true">➕</span>${WL("add")}</button>
        ${svc ? "" : `<button type="button" class="qa" data-qa="stock"><span aria-hidden="true">📦</span>${L("स्टॉक आया","Stock in")}</button>`}
        <button type="button" class="qa" data-qa="link"><span aria-hidden="true">🔗</span>${L("दुकान लिंक/QR","Shop link / QR")}</button>
        <button type="button" class="qa" data-qa="report"><span aria-hidden="true">📊</span>${L("रिपोर्ट","Report")}</button></div>
      <div class="stk-cards">
      ${lowN && !svc ? `<button type="button" class="a-card low-card" id="lowCard"><span class="lc-ic" aria-hidden="true">⚠️</span><span class="lc-t"><b>${L(`${lowN} सामान कम स्टॉक में`, `${lowN} items low on stock`)}</b><small>${D.low_stock.filter(v => !D.dash || v.stock > 0).slice(0, 3).map(v => `${esc(v.name_hi)} ${esc(v.label)}: ${v.stock}`).join(" · ")}${lowN > 3 ? " …" : ""}</small></span><span class="lc-go">${L("स्टॉक भरें","Fill stock")} ›</span></button>` : ""}
      ${ds.out_count && !svc ? `<button type="button" class="a-card low-card out-card" id="outCard"><span class="lc-ic" aria-hidden="true">🚫</span><span class="lc-t"><b>${L(`ख़त्म (${ds.out_count})`, `Khatam (${ds.out_count})`)}</b><small>${L("इनका स्टॉक 0 है","These are at 0")}</small></span><span class="lc-go">${L("देखें","View")} ›</span></button>` : ""}</div>
      ${D.best_sellers && D.best_sellers.length ? `<details class="a-card"><summary><b>🔥 ${L("सबसे ज़्यादा बिकने वाले (30 दिन)","Best sellers (30 days)")}</b></summary><ol class="bs-list">${D.best_sellers.map(b=>`<li>${icI(b)} ${esc(b.name)} <b>× ${b.qty}</b></li>`).join("")}</ol><button class="btn btn-ghost" type="button" data-goto="reports">📊 ${L("पूरी रिपोर्ट","Full report")}</button></details>` : ""}
      <div id="alertsCard"></div>
      <div class="seg" id="seg">${(svc ? [["active",L("चालू","Active")+` (${active})`],["pending",stName("pending")],["delivered",stName("delivered")],["cancelled",stName("cancelled")],["all",L("सब","All")]] : [["active",L("चालू","Active")+` (${active})`],["pending",stName("pending")],["ready",stName("ready")],["out_for_delivery",stName("out_for_delivery")],["delivered",stName("delivered")],["rejected",stName("rejected")],["cancelled",stName("cancelled")],["all",L("सब","All")]]).map(([k,n])=>`<button type="button" data-f="${k}" aria-pressed="${orderFilter===k && !orderExtra.chip}">${esc(n)}</button>`).join("")}</div>
      <div class="toolbar-a"><input id="oq" type="search" aria-label="${L("ऑर्डर खोजें","Search orders")}" placeholder="${svc ? esc(PW("search_ph", "")) : L("ऑर्डर नं., नाम या फ़ोन","Order no., name or phone")}"></div>
      <div class="date-row"><label>📅 ${L("से","From")} <input type="date" id="od1" value="${esc(orderExtra.from || "")}"></label><label>${L("तक","To")} <input type="date" id="od2" value="${esc(orderExtra.to || "")}"></label><button type="button" class="btn btn-ghost" id="odToday">${L("आज","Today")}</button><button type="button" class="btn btn-ghost" id="odClear" aria-label="${L("तारीख़ हटाएँ","Clear dates")}">✕</button></div>
      ${orderExtra.chip ? `<p class="chip-note">${L("फ़िल्टर","Filter")}: <b>${esc(({active: L("चालू","Active"), delivered: L("आज पहुँचे","Delivered today"), closed: L("आज रद्द/अस्वीकार","Cancelled+rejected today")})[orderExtra.chip])}</b> <button type="button" class="linkish" id="chipClear">${L("हटाएँ","Clear")}</button></p>` : ""}
      <div id="olist"><p class="loading">…</p></div>`;
    if ($("#lowCard")) $("#lowCard").onclick = () => { stkFilter = "low"; go("stock"); };
    if ($("#outCard")) $("#outCard").onclick = () => { stkFilter = "out"; go("stock"); };
    $("#seg").onclick = e => { const b = e.target.closest("[data-f]"); if (!b) return; orderFilter = b.dataset.f; delete orderExtra.chip; delete orderExtra.done; document.querySelectorAll("#seg button").forEach(x=>x.setAttribute("aria-pressed", x===b)); const n = $(".chip-note"); if (n) n.remove(); document.querySelectorAll("[data-chip]").forEach(x => x.setAttribute("aria-pressed", "false")); loadOrders(); };
    document.querySelector(".dchips").onclick = e => { const b = e.target.closest("[data-chip]"); if (!b) return; const k = b.dataset.chip;
      orderExtra = {chip: k}; orderFilter = k === "active" ? "active" : k === "delivered" ? "delivered" : "closed"; if (k !== "active") orderExtra.done = "today"; ordersView(); };
    if ($("#chipClear")) $("#chipClear").onclick = () => { orderExtra = {}; orderFilter = "active"; ordersView(); };
    const dch = () => { orderExtra.from = $("#od1").value; orderExtra.to = $("#od2").value; loadOrders(); };
    $("#od1").onchange = dch; $("#od2").onchange = dch;
    $("#odToday").onclick = () => { const d = new Date(Date.now() + 330*60000).toISOString().slice(0, 10); $("#od1").value = d; $("#od2").value = d; if (orderFilter !== "all" && orderFilter !== "active") orderFilter = "all"; dch(); };
    $("#odClear").onclick = () => { $("#od1").value = ""; $("#od2").value = ""; dch(); };
    document.querySelector(".qa-row").onclick = e => { const b = e.target.closest("[data-qa]"); if (!b) return; const k = b.dataset.qa;
      if (k === "add") return catalogPicker(); if (k === "stock") { stkFilter = "all"; return go("stock"); } if (k === "report") return go("reports");
      if (k === "link") { const sb = $("#shopBar"); if (sb && !sb.hidden) { sb.scrollIntoView({block: "start", behavior: "smooth"}); sb.classList.add("flash"); setTimeout(() => sb.classList.remove("flash"), 1600); } return; } };
    let qt; $("#oq").oninput = () => { clearTimeout(qt); qt = setTimeout(loadOrders, 250); };
    let gt; $("#gq").oninput = () => { clearTimeout(gt); gt = setTimeout(globalSearch, 250); };
    loadOrders(); renderAlerts($("#alertsCard"), true); flushOutbox();
  }
  // v10.8: ONE search box — items + orders, grouped
  async function globalSearch(){
    const q = $("#gq").value.trim(); const el = $("#gres"); if (!el) return;
    if (q.length < 2) { el.hidden = true; el.innerHTML = ""; return; }
    try { const r = await api(`/api/admin/search?q=${encodeURIComponent(q)}`); if ($("#gq").value.trim() !== q) return;
      el.hidden = false;
      el.innerHTML = `<div class="gr-g"><b>🧺 ${L("सामान","Items")} (${r.products.length})</b>${r.products.length ? r.products.map(p => `<button type="button" class="gr-i" data-gp="${p.id}"><span>${icI(p)} ${esc(AK.nm(p))}${p.name_en ? ` <small>${esc(p.name_en)}</small>` : ""}</span><small>${L("स्टॉक","Stock")} ${p.stock}${p.active ? "" : " · " + L("छुपा","hidden")}</small></button>`).join("") : `<p class="gr-none">${L("कोई सामान नहीं","No items")}</p>`}</div>
        <div class="gr-g"><b>🛒 ${L("ऑर्डर","Orders")} (${r.orders.length})</b>${r.orders.length ? r.orders.map(o => `<button type="button" class="gr-i" data-go="${o.id}"><span>${esc(o.code)} · ${esc(o.customer_name)} <small>${esc(o.phone)}</small></span><small>${money(o.total_paise)} · ${esc(stName(o.status))}</small></button>`).join("") : `<p class="gr-none">${L("कोई ऑर्डर नहीं","No orders")}</p>`}</div>`;
      el.onclick = e => { const p = e.target.closest("[data-gp]"); if (p) { const id = Number(p.dataset.gp); go("products"); setTimeout(() => editProduct(id), 400); return; }
        const o = e.target.closest("[data-go]"); if (o) { focusOrder = Number(o.dataset.go); orderFilter = "all"; orderExtra = {}; $("#oq").value = ""; el.hidden = true; document.querySelectorAll("#seg button").forEach(x => x.setAttribute("aria-pressed", x.dataset.f === "all")); loadOrders(); } };
    } catch (e) { if (!authFail(e)) { el.hidden = false; el.innerHTML = `<p class="err">${esc(e.message)}</p>`; } }
  }
  // v10.15.2 speed: Today asks for its active orders at the same time as the dashboard (pre = that request), not after it
  const activeOrders = () => { const p = api(`/api/admin/orders?${new URLSearchParams({status: "active", q: ""})}`); p.catch(() => {}); return p; };
  async function loadOrders(pre){
    const q = $("#oq")?.value.trim() || "";
    const qs = new URLSearchParams({status: orderFilter, q}); if (orderExtra.from) qs.set("from", orderExtra.from); if (orderExtra.to) qs.set("to", orderExtra.to); if (orderExtra.done) qs.set("done", orderExtra.done);
    try { const r = await (pre || api(`/api/admin/orders?${qs}`)); ORD = new Map(r.orders.map(o => [o.id, o])); $("#olist").innerHTML = r.orders.length ? r.orders.map(orderCard).join("") : `<p class="empty">${L("कोई ऑर्डर नहीं","No orders here")}</p>`;
      if (focusOrder) { const el = document.getElementById("o-" + focusOrder); focusOrder = null; if (el) { el.classList.add("focus"); el.scrollIntoView({block:"center"}); } } }
    catch (e) { if (!authFail(e)) errRetry($("#olist"), e, loadOrders); }
  }
  // v10.8: a failed load shows the reason + a big retry button (weak internet)
  function errRetry(el, e, fn){ if (!el) return; const net = e && e.code === "network";
    el.innerHTML = `<div class="a-card retry-card" role="alert"><p class="err">${net ? "📶 " + L("इंटरनेट नहीं है / कमज़ोर है","No internet / weak signal") : esc(e.message)}</p><button type="button" class="btn btn-primary" data-retry>🔄 ${L("फिर से कोशिश करें","Try again")}</button></div>`;
    el.querySelector("[data-retry]").onclick = () => { el.innerHTML = `<p class="loading">…</p>`; fn(); }; }
  // ---------- v10.8: 📶 offline outbox — safe saves (status change, stock +qty) wait in this phone and go when the net is back.
  // Each carries its idempotency key, so a save that did reach the server before the net dropped is never applied twice.
  const OUTBOX = "ak_outbox";
  const obGet = () => { try { return JSON.parse(localStorage.getItem(OUTBOX) || "[]"); } catch { return []; } };
  const obSet = l => { try { localStorage.setItem(OUTBOX, JSON.stringify(l.slice(-50))); } catch {} };
  async function safeSave(path, body, label){
    body = {...body, idempotency_key: body.idempotency_key || ikey()};
    try { return await api(path, {method: "POST", body}); }
    catch (e) { if (e.code !== "network") throw e;
      obSet([...obGet(), {path, body, label, at: Date.now()}]); toast("📶 " + L("इंटरनेट नहीं — नेट आते ही अपने आप सेव होगा","No internet — will save automatically when back online")); drawOutbox(); return null; }
  }
  let flushing = false;
  async function flushOutbox(){
    if (flushing || !me) return; const list = obGet(); if (!list.length) return drawOutbox(); flushing = true; let done = 0;
    try { for (const it of list) {
        try { await api(it.path, {method: "POST", body: it.body}); done++; }
        catch (e) { if (e.code === "network") break; done++; toast(`${it.label || ""}: ${e.message}`); } // a real "no" (e.g. already moved) is not retried
      }
      obSet(obGet().slice(done)); if (done) { toast(L(`✅ ${done} रुका हुआ बदलाव सेव हुआ`, `✅ ${done} queued change(s) saved`)); if (tab === "orders" || tab === "today") loadOrders(); else if (tab === "stock") stockView(); }
    } finally { flushing = false; drawOutbox(); }
  }
  function drawOutbox(){ let el = $("#outboxBar"); const n = obGet().length;
    if (!n) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement("div"); el.id = "outboxBar"; el.className = "outbox-bar"; el.setAttribute("role", "status"); app.before(el); }
    el.innerHTML = `⏳ ${L(`${n} बदलाव नेट का इंतज़ार कर रहे हैं`, `${n} change(s) waiting for internet`)} <button type="button" class="btn btn-ghost" id="obNow">🔄 ${L("अभी भेजें","Send now")}</button>`;
    $("#obNow").onclick = flushOutbox; }
  window.addEventListener("online", () => setTimeout(flushOutbox, 800));
  window.AKDirty = () => !!document.querySelector(".imp-wrap") || !$("#sheet").hidden; // pwa.js: never auto-reload over an open form
  const when = ms => new Date(ms).toLocaleString(AK.lang==="en"?"en-IN":"hi-IN", {day:"numeric", month:"short", hour:"numeric", minute:"2-digit", timeZone:"Asia/Kolkata"});
  let ORD = new Map();
  const EDITABLE = ["pending","accepted","preparing","ready"];
  // v10.11: restaurant order type on the card (big and clear) — kirana orders show nothing new
  function otypeChip(o){ if (!o || !o.order_type || (o.order_type === "delivery" && shopFam() !== "food")) return "";
    return o.order_type === "table" ? `🍽️ ${L("टेबल","Table")} ${esc(o.table_no)}` : o.order_type === "parcel" ? `🥡 ${L("पार्सल","Parcel")}` : `🛵 ${L("डिलीवरी","Delivery")}`; }
  // v10.13: 🏪 Walk-in (shop QR, ?src=qr) or 🏠 Online (booked from home) on every salon card
  const srcTag = o => !isSvc() || !o.source ? "" : o.source === "walkin" ? ` <span class="src-tag src-walkin">🏪 ${L("वॉक-इन","Walk-in")}</span>` : ` <span class="src-tag src-online">🏠 ${L("ऑनलाइन","Online")}</span>`;
  function orderCard(o){
    const wa = `https://wa.me/91${o.phone}?text=${encodeURIComponent(L(`नमस्ते ${o.customer_name} जी, आपका ऑर्डर ${o.code}: `,`Hello ${o.customer_name}, about your order ${o.code}: `))}`;
    const pn = PROF().next, pa = Object.assign({}, ACT, PROF().actions || {}), ico = PROF().action_icons || {}; // v10.13: salon = ✂️ Start service → ✔️ Complete
    const isReq = isSvc() && o.source && o.status === "pending" && o.token_no == null; // v10.13: an online request waits for ✅ Accept
    const acts = isReq ? `<button class="btn btn-primary" type="button" data-queue="${o.id}">✅ ${L("स्वीकार करें","Accept")}</button>` : ((pn || NEXT)[o.status]||[]).map(([s,ic,cls,ak]) => `<button class="btn ${cls}" type="button" data-st="${s}" data-id="${o.id}" data-from="${o.status}">${ico[ak] || ic} ${esc(ak && pa[ak] ? L(...pa[ak]) : stName(s))}</button>`).join("");
    // v10.13: a queued salon customer who isn't there → ⏭ Skip (the line moves on); an online request → ❌ Reject
    const neg = isSvc() && o.status === "pending" && o.token_no != null ? `<button class="btn btn-ghost" type="button" data-skip="${o.id}">⏭ ${L("स्किप / नहीं आए","Skip / Not here")}</button>` :
      o.status === "pending" ? `<button class="btn btn-danger" type="button" data-st="rejected" data-id="${o.id}" data-from="${o.status}">✖ ${L("अस्वीकार","Reject")}</button>` :
      ["accepted","preparing","ready","out_for_delivery"].includes(o.status) ? `<button class="btn btn-danger" type="button" data-st="cancelled" data-id="${o.id}" data-from="${o.status}">${L("रद्द करें","Cancel")}</button>` : "";
    const pu = o.push || {}; const lastOut = pu.last ? ({accepted:L("भेजी गई (push service ने ली)","sent (accepted by push service)"), expired:L("डिवाइस पुराना, हटाया","device expired, removed"), rejected:L("नहीं गई","failed"), error:L("नहीं गई","failed"), no_subscription:L("ग्राहक ने चालू नहीं की","customer has not turned them on")})[pu.last.outcome] || pu.last.outcome : "";
    const pushLine = `<br>🔔 ${L("ग्राहक को सूचना","Customer notifications")}: ${pu.customer_devices ? L("चालू","on") : L("बंद (ग्राहक ने चालू नहीं की)","off (customer has not enabled)")}${pu.last && pu.customer_devices ? ` · ${L("आख़िरी","last")}: ${esc(lastOut)}` : ""}`;
    const SB = !!o.svc_items; // v10.14: salon catalogue booking — names (+ the shop's own price if set), no money, no bill, no payment line
    const editable = !SB && EDITABLE.includes(o.status), packing = !isSvc() && ["accepted","preparing","ready"].includes(o.status);
    const packed = new Set(o.packed || []); const np = o.items.filter(i => packed.has(i.id)).length;
    const subOf = id => (o.subs || []).filter(s => s.item_id === id && s.status === "pending").pop();
    const line = i => { const sb = subOf(i.id);
      return `<div class="o-line">${packing ? `<label class="pk"><input type="checkbox" data-pack="${o.id}" value="${i.id}" ${packed.has(i.id) ? "checked" : ""} aria-label="${L("पैक हुआ","Packed")}: ${esc(AK.lang === "en" && i.product_name_en ? i.product_name_en : i.product_name)}"></label>` : ""}<span>${icI(i)} ${esc(AK.lang === "en" && i.product_name_en ? i.product_name_en : i.product_name)} ${SB ? "" : `<small>(${esc(i.variant_label)})</small> × ${i.qty}`}${sb ? `<br><small class="sub-wait">🔁 ${L("सुझाव भेजा","Suggested")}: ${esc(sb.to.name)} ${esc(sb.to.label)} — ${L("ग्राहक के जवाब का इंतज़ार","waiting for the customer")}</small>` : ""}</span><b>${SB ? (i.unit_price_paise ? money(i.unit_price_paise) : "") : money(i.line_total_paise)}</b>${editable ? `<button type="button" class="icon-btn o-ed" data-edit="${o.id}:${i.id}" aria-label="${L("बदलें / हटाएँ","Change / remove")}: ${esc(AK.lang === "en" && i.product_name_en ? i.product_name_en : i.product_name)}">✏️</button>` : ""}</div>`; };
    const answered = (o.subs || []).filter(s => s.status === "accepted" || s.status === "declined");
    const otChip = otypeChip(o);
    return `<article class="order st-${o.status}" id="o-${o.id}"><div class="o-head"><div>${isSvc() ? `${o.token_no != null ? `<span class="tok-badge" title="${esc(L("टोकन","Token"))}">#${Number(o.token_no)}</span> ` : ""}<b>👤 ${esc(o.customer_name)}</b>${SB ? "" : ` · ${money(o.total_paise)}`}${srcTag(o)}<small>${esc(o.code)} · ${when(o.created_at)}</small>` : `<b>${esc(o.code)}</b> · ${money(o.total_paise)}<small>${when(o.created_at)}</small>`}</div><span class="badge st-${o.status}${isReq ? " st-request" : ""}">${esc(isReq ? L("नई रिक्वेस्ट","Request") : stName(o.status))}</span></div>
      ${otChip ? `<div class="o-type ot-${esc(o.order_type)}">${otChip}</div>` : ""}
      ${packing ? `<div class="pk-count" id="pkc-${o.id}">📦 ${L("पैकिंग","Packed")}: <b>${np}/${o.items.length}</b></div>` : ""}
      <div class="o-items">${o.items.map(line).join("")}
        ${o.discount_paise ? `<div><span>${L("छूट","Discount")}${o.discount_title ? ` <small>(${esc(o.discount_title)})</small>` : ""}</span><span>− ${money(o.discount_paise)}</span></div>` : ""}
        ${isSvc() || (o.order_type && o.order_type !== "delivery") ? "" : `<div><span>${L("डिलीवरी","Delivery")}</span><span>${o.delivery_paise?money(o.delivery_paise):L("फ्री","Free")}</span></div>`}</div>
      ${(o.changes || []).length ? `<div class="o-changes">${o.changes.map(ch => `<div>${esc(ch.note)}</div>`).join("")}</div>` : ""}
      ${answered.length ? `<div class="o-changes">${answered.map(s => `<div>${s.status === "accepted" ? "✅" : "❎"} ${L("ग्राहक","Customer")}: ${esc(s.from.name)} → ${esc(s.to.name)} ${esc(s.to.label)} — ${s.status === "accepted" ? L("माना","accepted") : L("नहीं माना","declined")}</div>`).join("")}</div>` : ""}
      <div class="o-meta">👤 <b>${esc(o.customer_name)}</b>${SB && !o.phone ? "" : ` · <a href="tel:+91${esc(o.phone)}">📞 ${esc(o.phone)}</a> · <a href="${esc(wa)}" target="_blank" rel="noopener">💬 WhatsApp</a>`}<br>
        ${isSvc() ? (o.address ? `🏠 ${esc([o.address, o.locality, o.pincode].filter(Boolean).join(", "))}` : "") : o.order_type === "table" ? `🍽️ ${L("टेबल","Table")} <b>${esc(o.table_no)}</b>` : o.order_type === "parcel" ? `🥡 ${L("पार्सल — ग्राहक ले जाएगा","Parcel — customer picks up")}` : `🏠 ${esc([o.address, o.locality, o.pincode].filter(Boolean).join(", "))}`}${o.landmark?`<br>📍 ${esc(o.landmark)}`:""}${o.instructions?`<br>📝 ${esc(o.instructions)}`:""}
        ${SB ? "" : `${isSvc() && !o.address ? "" : "<br>"}💵 `}${SB ? "" : isSvc() ? esc(PW("pay_after", "")) : o.payment_method==="cod"?"Cash on Delivery":"UPI on delivery"}${!SB && o.payment_status==="collected_on_delivery"?` · ${L("पैसे मिले","Collected")}`:""}${o.reason?`<br>❕ ${esc(o.reason)}`:""}${pushLine}</div>
      <div class="o-actions">${acts}${neg}${SB ? "" : `<button class="btn btn-ghost" type="button" data-bill="${o.id}">🧾 ${L("बिल","Bill")}</button>`}</div></article>`;
  }
  app.addEventListener("change", async e => { // 📦 packing checklist (convenience only — never blocks anything)
    const c = e.target.closest("[data-pack]"); if (!c) return; const oid = Number(c.dataset.pack);
    const ids = [...document.querySelectorAll(`[data-pack="${oid}"]`)].filter(x => x.checked).map(x => Number(x.value));
    const all = document.querySelectorAll(`[data-pack="${oid}"]`).length; const pc = $("#pkc-" + oid); if (pc) pc.innerHTML = `📦 ${L("पैकिंग","Packed")}: <b>${ids.length}/${all}</b>${ids.length === all ? " ✅" : ""}`;
    const o = ORD.get(oid); if (o) o.packed = ids;
    try { await api(`/api/admin/orders/${oid}/packed`, {method: "POST", body: {packed: ids}}); } catch (x) { if (!authFail(x)) toast(x.message); }
  });
  app.addEventListener("click", async e => {
    if (e.target.closest("#helpBtn")) return helpView();
    const ed = e.target.closest("[data-edit]"); if (ed) { const [oid, iid] = ed.dataset.edit.split(":").map(Number); return editItemSheet(oid, iid); }
    const bl = e.target.closest("[data-bill]"); if (bl) return billView(Number(bl.dataset.bill));
    const sk = e.target.closest("[data-skip]");
    if (sk) { if (!confirm(L("यह ग्राहक नहीं आया? बारी छोड़कर अगले को बुलाएँ?","Customer not here? Skip and move to the next?"))) return; sk.disabled = true;
      try { await api(`/api/admin/orders/${sk.dataset.skip}/skip`, {method: "POST", body: {}}); toast(L("⏭ स्किप किया","⏭ Skipped")); } catch (x) { if (authFail(x)) return; toast(x.message); } ordersHome(); return; }
    const qb = e.target.closest("[data-queue]");
    if (qb) { qb.disabled = true; try { const r = await api(`/api/admin/orders/${qb.dataset.queue}/queue`, {method: "POST", body: {}}); toast(`✅ ${L("स्वीकार — टोकन","Accepted — token")} #${r.order.token_no}`); } catch (x) { if (authFail(x)) return; toast(x.message); } ordersHome(); return; }
    const b = e.target.closest("[data-st]"); if (!b) return;
    const to = b.dataset.st; let reason = "";
    if (to === "rejected" || to === "cancelled") { reason = prompt(L("कारण लिखें (ग्राहक को दिखेगा):","Reason (shown to the customer):"), PW("reject_reason", L("सामान ख़त्म है","Item out of stock"))); if (!reason) return; }
    b.disabled = true;
    try { const r = await safeSave(`/api/admin/orders/${b.dataset.id}/status`, {status:to, from:b.dataset.from, reason}, `${stName(to)}`); if (r) { toast(stName(to)); ordersHome(); } else b.disabled = false; }
    catch (x) { if (!authFail(x)) { toast(x.message); ordersHome(); } }
  });
  // ---------- v10.8: ✏️ unavailable item — lower qty / remove / suggest a substitute ----------
  function editItemSheet(oid, iid){
    const o = ORD.get(oid); const it = o && o.items.find(i => i.id === iid); if (!it) return;
    openSheet(L("सामान नहीं है? बदलें","Item not available?"));
    const last = o.items.length === 1;
    $("#sheetBody").innerHTML = `<p><b>${icI(it)} ${esc(it.product_name)} (${esc(it.variant_label)})</b> × ${it.qty} · ${money(it.line_total_paise)}</p>
      <label for="eiWhy">${L("कारण (ग्राहक को दिखेगा)","Reason (customer sees it)")}</label><input id="eiWhy" value="${esc(L("सामान उपलब्ध नहीं","Not available"))}" maxlength="120">
      ${it.qty > 1 ? `<label for="eiQty">${L("नई मात्रा","New quantity")}</label><div class="ei-row"><select id="eiQty">${Array.from({length: it.qty - 1}, (_, k) => it.qty - 1 - k).map(n => `<option value="${n}">${n}</option>`).join("")}</select><button type="button" class="btn btn-blue" id="eiSetQty">✏️ ${L("मात्रा घटाएँ","Lower qty")}</button></div>` : ""}
      ${last ? `<p class="hint">⚠️ ${L("ऑर्डर में यही एक सामान है — हटा नहीं सकते। पूरा ऑर्डर अस्वीकार/रद्द करें या दूसरा सामान सुझाएँ।","This is the only item — it can't be removed. Reject/cancel the order or suggest a substitute.")}</p>` : `<button type="button" class="btn btn-danger wide" id="eiRemove">➖ ${L("ऑर्डर से हटाएँ (स्टॉक वापस)","Remove from order (stock returned)")}</button>`}
      <h3 class="ei-h">🔁 ${L("बदले में दूसरा सामान सुझाएँ","Suggest a substitute")}</h3>
      <input id="eiFind" type="search" aria-label="${L("सामान खोजें","Search items")}" placeholder="🔍 ${L("सामान खोजें (स्टॉक वाले)","Search in-stock items")}"><div id="eiList" class="ei-list"><p class="loading">…</p></div>`;
    const why = () => $("#eiWhy").value.trim();
    const done = async (r, msg) => { closeSheet(); toast(msg); loadOrders(); loadDash().catch(() => {}); };
    const call = async (path, body, msg, btn) => { if (btn) btn.disabled = true;
      try { const r = await api(path, {method: "POST", body}); done(r, msg); }
      catch (x) { if (btn) btn.disabled = false; if (authFail(x)) return; if (x.data && x.data.code === "order_empty" || x.code === "order_empty") toast(L("ऑर्डर खाली नहीं हो सकता — अस्वीकार/रद्द करें","Order can't be empty — reject/cancel it")); else toast(x.message); } };
    if ($("#eiSetQty")) $("#eiSetQty").onclick = e => call(`/api/admin/orders/${oid}/items`, {item_id: iid, action: "qty", qty: Number($("#eiQty").value), reason: why()}, L("✅ मात्रा घटाई — बिल और स्टॉक अपडेट","✅ Qty lowered — bill and stock updated"), e.currentTarget);
    if ($("#eiRemove")) $("#eiRemove").onclick = e => call(`/api/admin/orders/${oid}/items`, {item_id: iid, action: "remove", reason: why()}, L("✅ हटाया — बिल और स्टॉक अपडेट","✅ Removed — bill and stock updated"), e.currentTarget);
    (async () => {
      let cat; try { cat = await loadCatalog(); } catch (x) { $("#eiList").innerHTML = `<p class="err">${esc(x.message)}</p>`; return; }
      const opts = []; for (const p of cat.products || []) for (const v of p.variants || []) if (v.id !== it.variant_id && v.active !== 0 && v.active !== false && p.active !== 0 && p.active !== false && v.stock >= it.qty) opts.push({p, v});
      const draw = () => { const q = ($("#eiFind").value || "").trim().toLowerCase();
        const list = opts.filter(({p}) => !q || (p.name_hi + " " + (p.name_en || "")).toLowerCase().includes(q)).slice(0, 30);
        const d = v => (v.price_paise - it.unit_price_paise) * it.qty;
        $("#eiList").innerHTML = list.length ? list.map(({p, v}) => `<button type="button" class="ei-opt" data-sv="${v.id}"><span>${icI(p)} ${esc(AK.nm(p))} <small>${esc(v.label)} · ${L("स्टॉक","stock")} ${v.stock}</small></span><b>${money(v.price_paise)}<small> (${d(v) === 0 ? "=" : (d(v) > 0 ? "+" : "−") + money(Math.abs(d(v)))})</small></b></button>`).join("") : `<p class="empty">${L("कोई स्टॉक वाला सामान नहीं मिला","No in-stock item found")}</p>`; };
      draw(); $("#eiFind").oninput = draw;
      $("#eiList").onclick = e => { const b = e.target.closest("[data-sv]"); if (!b) return;
        call(`/api/admin/orders/${oid}/substitute`, {item_id: iid, variant_id: Number(b.dataset.sv)}, L("🔁 सुझाव ग्राहक को भेजा — जवाब आने पर 🔔 आएगा","🔁 Suggestion sent — you'll get a 🔔 when they answer"), b); };
    })();
  }
  // ---------- v10.8: 🧾 bill — clean printable page (🖨️ Print / Save as PDF) + 📤 Share + WhatsApp to the customer ----------
  async function billView(oid){
    let r; try { r = await api(`/api/admin/orders/${oid}/bill`); } catch (x) { if (!authFail(x)) toast(x.message); return; }
    const {shop, order: o} = r; const rs = p => "₹" + (p / 100).toLocaleString("en-IN", {minimumFractionDigits: p % 100 ? 2 : 0, maximumFractionDigits: 2});
    const pm = o.payment_method === "cod" ? L("कैश (डिलीवरी पर)","Cash on delivery") : L("UPI (डिलीवरी पर)","UPI on delivery");
    const dt = new Date(o.created_at).toLocaleString("en-IN", {day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata"});
    const text = [`🧾 ${shop.name}`, `${L("ऑर्डर","Order")} ${o.code} · ${dt}`, ...o.items.map(i => `${i.name} ${i.label} × ${i.qty} = ${rs(i.line_paise)}`), `${L("कुल सामान","Subtotal")}: ${rs(o.subtotal_paise)}`,
      ...(o.discount_paise ? [`${L("छूट","Discount")}: − ${rs(o.discount_paise)}`] : []), `${L("डिलीवरी","Delivery")}: ${o.delivery_paise ? rs(o.delivery_paise) : L("फ्री","Free")}`, `${L("कुल","Total")}: ${rs(o.total_paise)}`, `${L("भुगतान","Payment")}: ${pm}`].join("\n");
    const ov = overlay(L("बिल","Bill") + " · " + o.code); ov.w.classList.add("bill-wrap");
    ov.body.innerHTML = `<div class="bill" id="billDoc"><h2>${esc(shop.name)}</h2>${shop.phone ? `<p class="b-sub">📞 ${esc(shop.phone)}${shop.address ? " · " + esc(shop.address) : ""}</p>` : ""}
      <div class="b-meta"><span>${L("ऑर्डर नं.","Order no.")} <b>${esc(o.code)}</b></span><span>${esc(dt)}</span></div>
      <p class="b-cust">👤 ${esc(o.customer_name)} · ${esc(o.phone)}<br>${esc(o.address)}</p>
      <table><thead><tr><th>${L("सामान","Item")}</th><th>${L("मात्रा","Qty")}</th><th>${L("दाम","Price")}</th><th>${L("कुल","Amount")}</th></tr></thead>
      <tbody>${o.items.map(i => `<tr><td>${esc(i.name)} <small>${esc(i.label)}</small></td><td>${i.qty}</td><td>${rs(i.unit_paise)}</td><td>${rs(i.line_paise)}</td></tr>`).join("")}</tbody></table>
      <div class="b-sum"><div><span>${L("कुल सामान","Subtotal")}</span><span>${rs(o.subtotal_paise)}</span></div>${o.discount_paise ? `<div><span>${L("छूट","Discount")}${o.discount_title ? ` (${esc(o.discount_title)})` : ""}</span><span>− ${rs(o.discount_paise)}</span></div>` : ""}
      <div><span>${L("डिलीवरी","Delivery")}</span><span>${o.delivery_paise ? rs(o.delivery_paise) : L("फ्री","Free")}</span></div><div class="b-tot"><span>${L("कुल","Total")}</span><span>${rs(o.total_paise)}</span></div>
      <div><span>${L("भुगतान","Payment")}</span><span>${esc(pm)}${o.payment_status === "collected_on_delivery" ? " ✅" : ""}</span></div></div><p class="b-thanks">🙏 ${L("धन्यवाद! फिर आइए","Thank you! Visit again")}</p></div>`;
    ov.foot.innerHTML = `<button type="button" class="btn btn-primary" id="bPrint">🖨️ ${L("प्रिंट / PDF","Print / PDF")}</button><button type="button" class="btn btn-blue" id="bShare">📤 ${L("शेयर","Share")}</button><a class="btn sb-wa" id="bWa" target="_blank" rel="noopener" href="https://wa.me/91${esc(o.phone)}?text=${encodeURIComponent(text)}">💬 WhatsApp</a>${r.wa_self && r.wa_self.url ? `<a class="btn sb-wa b-self" id="bWaSelf" target="_blank" rel="noopener" href="${esc(r.wa_self.url)}">📲 ${L("मेरे WhatsApp पे भेजो","Send to my WhatsApp")}</a>` : ""}`;
    $("#bPrint").onclick = () => { document.body.classList.add("printing-bill"); window.print(); setTimeout(() => document.body.classList.remove("printing-bill"), 500); };
    $("#bShare").onclick = async () => { if (navigator.share) { try { await navigator.share({title: `${shop.name} · ${o.code}`, text}); } catch {} } else copyText(text); };
  }
  // ---------- v10.8: ❓ Madad — kaise use karein ----------
  function helpView(){
    const ov = overlay("❓ " + L("मदद · कैसे इस्तेमाल करें","Help · How to use"));
    const sec = (ic, t, steps) => `<details class="a-card help-sec"><summary><b>${ic} ${t}</b></summary><ol>${steps.map(s => `<li>${s}</li>`).join("")}</ol></details>`;
    ov.body.innerHTML = `<p class="help-intro">${L("कैसे इस्तेमाल करें — छोटे स्टेप्स। कुछ समझ न आए तो नीचे WhatsApp करें।","How to use — short steps. Stuck? WhatsApp us below.")}</p>
      ${sec("➕", L("सामान जोड़ें","Add items"), [L("📦 स्टॉक टैब → 📋 तैयार लिस्ट: सामान पर टिक करें, दाम भरें, “सब जोड़ें”।","Stock tab → 📋 Ready list: tick items, fill price, “Add all”."), L("या 📝 लिस्ट / Excel / CSV: लिस्ट पेस्ट करें या फ़ाइल डालें → प्रीव्यू जाँचें → Save।","Or 📝 List / Excel / CSV: paste or upload → check the preview → Save."), L("एक-एक करके: 🧺 सामान टैब → ➕ नया सामान।","One by one: 🧺 Items tab → ➕ New item.")])}
      ${sec("📦", L("स्टॉक","Stock"), [L("📦 स्टॉक टैब में हर सामान का स्टॉक दिखता है।","The 📦 Stock tab shows every item's stock."), L("माल आया? +5 / +10 / +20 दबाएँ, या कई सामान टिक करके “📦 स्टॉक आया”।","Stock arrived? Tap +5 / +10 / +20, or tick many and “📦 Stock in”."), L("स्टॉक लिमिट से नीचे गया तो 🔔 आएगा — वहीं से +10 / +20।","Below the limit you get a 🔔 — +10 / +20 right there.")])}
      ${sec("🛒", L("ऑर्डर","Orders"), [L("नया ऑर्डर आए तो ✅ मंज़ूर करें (या ✖ अस्वीकार)।","New order: ✅ accept (or ✖ reject)."), L("🧺 तैयार हो रहा → हर सामान पर टिक (पैकिंग) → 📦 तैयार → 🛵 रास्ते में → 🏠 पहुँच गया।","Preparing → tick each item → Ready → Out for delivery → Delivered."), L("कोई सामान नहीं है? ✏️ दबाएँ: मात्रा घटाएँ, हटाएँ, या दूसरा सामान सुझाएँ — बिल अपने आप ठीक।","Item missing? Tap ✏️: lower qty, remove, or suggest a substitute — the bill fixes itself."), L("🧾 बिल: प्रिंट, PDF या WhatsApp पर भेजें।","🧾 Bill: print, PDF or send on WhatsApp.")])}
      ${sec("🔗", L("दुकान लिंक / QR","Shop link / QR"), [L("ऊपर हरे बॉक्स में आपका पक्का लिंक है — 📋 कॉपी या 💬 WhatsApp से ग्राहकों को भेजें।","Your fixed link is in the green box on top — 📋 copy or 💬 WhatsApp it to customers."), L("🖨️ QR दबाकर पोस्टर डाउनलोड करें, दुकान पर लगाएँ।","Tap 🖨️ QR to download a poster for the shop."), L("लिंक कभी नहीं बदलता — नया अपडेट उसी लिंक पर आता है।","The link never changes — updates arrive on the same link.")])}
      ${sec("🔔", L("सूचनाएँ","Notifications"), [L("⚙️ सेटिंग → 🔔 ऑर्डर अलर्ट चालू करें (फ़ोन पूछे तो Allow)।","⚙️ Settings → turn on 🔔 order alerts (tap Allow)."), L("ऊपर 🔔 घंटी में सब सूचनाएँ: नया ऑर्डर, कम स्टॉक, ग्राहक का जवाब, बिल।","The 🔔 bell lists everything: new orders, low stock, customer answers, bills."), L("🆕 “नया अपडेट आया” दिखे तो Refresh दबाएँ।","See “🆕 New update”? Tap Refresh.")])}
      <a class="btn sb-wa wide" href="https://wa.me/918435424535?text=${encodeURIComponent(L("नमस्ते Krish, Apna Dhanda में मदद चाहिए: ","Hi Krish, I need help with Apna Dhanda: "))}" target="_blank" rel="noopener">💬 ${L("Krish से WhatsApp करें","WhatsApp Krish")}</a>`;
  }
  function startPolling(){ clearInterval(pollT); pollT = setInterval(async () => {
    try { const r = await api(`/api/admin/orders?status=pending`); const max = r.orders.reduce((m,o)=>Math.max(m,o.id), 0);
      const badge = $("#newBadge"); badge.hidden = !r.orders.length; badge.textContent = r.orders.length;
      if (max > lastMaxId && lastMaxId) { ding(); toast(PW("new_toast", L("🔔 नया ऑर्डर आया!","🔔 New order!"))); if (navigator.vibrate) navigator.vibrate([200,100,200]); if (tab === "orders" || tab === "today") ordersHome(); }
      lastMaxId = Math.max(lastMaxId, max); document.title = (r.orders.length ? `(${r.orders.length}) ` : "") + L("दुकानदार पैनल","Shop Admin");
    } catch (e) { authFail(e); } }, 15000); }
  function ding(){ try { const c = new (window.AudioContext||window.webkitAudioContext)(); [0,0.18].forEach((d,i) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = i?1320:880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(.25, c.currentTime+d); g.gain.exponentialRampToValueAtTime(.001, c.currentTime+d+.3); o.start(c.currentTime+d); o.stop(c.currentTime+d+.32); }); } catch {} }


  // ---------- products ----------
  async function loadCatalog(){ catalog = await api("/api/admin/catalog"); return catalog; }
  async function productsView(){
    try { await Promise.all([loadCatalog(), D ? null : loadDash()]); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    if (shopType() === "salon") return salonCatalogView(); // v10.14: salon = the fixed master catalogue (nothing to add)
    if (isSvc()) return svcServicesView(); // v10.13.1: salon / service = no stock, no CSV, one-tap suggestions (Krish 26 Oct 11:02 PM)
    app.innerHTML = `<div class="toolbar-a"><input id="pq" type="search" placeholder="${isKirana() ? L("सामान खोजें","Search items") : L("खोजें","Search")}"><button class="btn btn-primary" type="button" id="addP">+ ${WL("new_item")}</button></div>${isKirana() ? "" : `<p class="hint type-hint">${AK.TYPES[shopType()].icon} ${shopFam() === "food" ? L("अपना मेन्यू बनाएँ: डिश, प्लेट (हाफ़ / फुल) और रेट डालें।","Build your menu: add dishes, plates (half / full) and prices.") : L("अपनी सेवाएँ डालें, जैसे हेयर कट ₹100। बुकिंग जल्द आ रही है।","Add your services, e.g. Haircut ₹100. Booking is coming soon.")}</p>`}
      <p><button class="btn btn-ghost btn-block" type="button" data-goto="history">📜 ${L("स्टॉक और रेट की हिस्ट्री","Stock & price history")}</button></p>
      <div id="plist"></div>
      <div class="a-card"><h3>📄 ${L("एक साथ बहुत सारा सामान (CSV/Excel)","Bulk items (CSV / Excel)")}</h3>
        <p class="hint">${L("सारा सामान CSV में डाउनलोड करें, Excel/Sheets में रेट-स्टॉक बदलें, फिर वापस अपलोड करें।","Download all items as CSV, edit rates/stock in Excel or Sheets, then upload back.")}</p>
        <div class="o-actions"><a class="btn btn-ghost" href="/api/admin/csv" download>⬇️ ${L("CSV डाउनलोड","Download CSV")}</a><a class="btn btn-ghost" href="/api/admin/orders.csv" download>⬇️ ${L("ऑर्डर CSV","Orders CSV")}</a><label class="btn btn-ghost">⬆️ ${L("CSV अपलोड","Upload CSV")}<input type="file" accept=".csv,text/csv" id="csvIn" hidden></label></div><p id="csvMsg" class="hint"></p></div>`;
    const draw = () => { const q = $("#pq").value.trim().toLowerCase(); const cats = Object.fromEntries(catalog.categories.map(c=>[c.id,c]));
      const list = catalog.products.filter(p => !q || [p.name_hi,p.name_en,p.brand].join(" ").toLowerCase().includes(q));
      $("#plist").innerHTML = list.length ? list.map(p => { const low = p.variants.some(v=>v.active && v.stock <= v.low_stock);
        return `<div class="p-row ${p.active?"":"inactive"}"><span class="le">${icBox(p)}</span>
          <span class="pn"><b>${esc(AK.nm(p))}${p.featured?`<span class="tag feat">★</span>`:""}${!p.active?`<span class="tag off">${L("छुपा","Hidden")}</span>`:""}${low?`<span class="tag low">${L("स्टॉक कम","Low")}</span>`:""}</b>
          <small>${esc(p.name_en)} · ${esc(cats[p.category_id]?.name_hi || "—")}</small><small>${p.variants.map(v=>`${esc(v.label)} ${money(v.price_paise)} · ${L("स्टॉक","stock")} ${v.stock}`).join(" | ")}</small></span>
          <button class="mini" type="button" data-edit="${p.id}" aria-label="Edit">✏️</button></div>`; }).join("") : `<p class="empty">${L("कोई सामान नहीं","No items")}</p>`; };
    draw(); $("#pq").oninput = draw; $("#addP").onclick = () => editProduct(null);
    $("#plist").onclick = e => { const b = e.target.closest("[data-edit]"); if (b) editProduct(Number(b.dataset.edit)); };
    $("#csvIn").onchange = async e => { const file = e.target.files[0]; if (!file) return; const text = await file.text(); const msg = $("#csvMsg");
      try { const dry = await api("/api/admin/csv", {method:"POST", body:{csv:text, dry_run:true}});
        if (!dry.ok) { msg.innerHTML = `<span class="err">${dry.errors.slice(0,8).map(x=>`${L("लाइन","Row")} ${x.row}: ${esc(x.error)}`).join("<br>")}</span>`; return; }
        if (!confirm(L(`${dry.rows} लाइनें, ${dry.products} सामान। अपलोड करें?`,`${dry.rows} rows, ${dry.products} items. Import?`))) return;
        const r = await api("/api/admin/csv", {method:"POST", body:{csv:text}}); msg.textContent = L(`${r.created} नए, ${r.updated} अपडेट`,`${r.created} new, ${r.updated} updated`); productsView();
      } catch (x) { msg.innerHTML = `<span class="err">${esc(x.message)}</span>`; } e.target.value = ""; };
  }
  function vrow(v={}){ const r = x => x==null||x==="" ? "" : (x/100).toFixed(2).replace(/\.00$/,"");
    return `<div class="vrow" data-vid="${v.id||""}"><div class="vl"><label>${isKirana() ? L("साइज़/पैक","Pack size") : WL("size")}</label><input name="label" value="${esc(v.label||"")}" placeholder="${esc(isKirana() ? "1 kg" : W("size_ph")[AK.lang === "en" ? 1 : 0])}" required maxlength="40"></div>
      <div><label>${L("रेट ₹","Price ₹")}</label><input name="price" inputmode="decimal" value="${r(v.price_paise)}" required></div>
      <div><label>MRP ₹ <small>${L("(अगर हो)","(if any)")}</small></label><input name="mrp" inputmode="decimal" value="${r(v.mrp_paise)}"></div>
      <div><label>${WL("stock")}</label><input name="stock" inputmode="numeric" value="${v.stock ?? (isKirana() ? 10 : shopFam() === "food" ? 50 : 99)}"></div>
      <button class="x" type="button" data-rmv aria-label="Remove">🗑</button>
      <input type="hidden" name="low_stock" value="${v.low_stock ?? 3}"><input type="hidden" name="sku" value="${esc(v.sku||"")}"></div>`; }
  function editProduct(id){
    if (isSvc()) return editService(id); // v10.13.1: salon / service form = name, price, time chips, photo (no brand / MRP / stock)
    const p = id ? catalog.products.find(x=>x.id===id) : {name_hi:"", name_en:"", brand:"", description:"", icon: isKirana() ? "🛍️" : shopFam() === "food" ? "🍽️" : "⭐", active:true, featured:false, category_id: catalog.categories[0]?.id, variants:[{}]};
    let imageId = p.image_id || null, icon = p.icon || "🛍️";
    openSheet(id ? WL("edit_item") : WL("new_item")); const STK = stickersFor();
    $("#sheetBody").innerHTML = `<form class="form" id="pf2" novalidate>
      ${id ? `<button class="btn btn-ghost btn-block" type="button" data-hist="${id}">📜 ${L("इस सामान की स्टॉक/रेट हिस्ट्री","Stock & price history of this item")}</button>` : ""}
      ${STK.length ? `<div class="stk-box"><button class="btn ${id ? "btn-ghost" : "btn-primary"} btn-block" type="button" id="stkBtn" aria-expanded="${id ? "false" : "true"}">✨ ${L("स्टिकर से जल्दी जोड़ें","Quick add with a sticker")}</button>
        <div id="stk" ${id ? "hidden" : ""}><p class="hint">${L("एक स्टिकर दबाएँ — नाम, कैटेगरी और तस्वीर अपने-आप भर जाएँगे। फिर बस रेट और स्टॉक डालें।","Tap a sticker — name, category and picture fill in. Then just add price and stock.")}</p>
        <div class="stk-tabs" id="stkTabs">${STK.map((g, i) => `<button type="button" data-g="${i}" aria-pressed="${i === 0}">${esc(g.items[0][0])} ${esc(AK.lang === "en" ? g.en : g.g)}</button>`).join("")}</div>
        <div class="stk-grid" id="stkGrid"></div></div></div>` : ""}
      <div class="row2"><div><label for="nh">${L("नाम (हिंदी)","Name (Hindi)")}</label><input id="nh" name="name_hi" value="${esc(AK.nm(p))}" required maxlength="80" placeholder="${esc(W("name_ph")[0])}"></div>
      <div><label for="ne">${L("नाम (English)","Name (English)")}</label><input id="ne" name="name_en" value="${esc(p.name_en)}" maxlength="80"></div></div>
      <div class="row2"><div><label for="cat">${L("कैटेगरी","Category")}</label><select id="cat" name="category_id">${catalog.categories.map(c=>`<option value="${c.id}" ${c.id===p.category_id?"selected":""}>${esc(c.icon)} ${esc(c.name_hi)}</option>`).join("")}<option value="" ${!p.category_id?"selected":""}>—</option></select></div>
      <div><label for="br">${L("ब्रांड","Brand")} <small>${L("(ज़रूरी नहीं)","(optional)")}</small></label><input id="br" name="brand" value="${esc(p.brand)}" maxlength="60"></div></div>
      <label>${WL("per")}</label><div id="vrows">${p.variants.map(vrow).join("")}</div>
      <button class="btn btn-ghost" type="button" id="addV">+ ${WL("another")}</button>
      <label>${L("फ़ोटो या आइकन","Photo or icon")}</label>
      <div class="row2" style="align-items:center"><div class="photo-prev" id="prev"></div><div><label class="btn btn-ghost">📷 ${L("फ़ोटो लें / चुनें","Take / choose photo")}<input type="file" accept="image/*" id="ph" hidden></label><button class="btn btn-ghost" type="button" id="noPh" ${imageId?"":"hidden"}>${L("फ़ोटो हटाएँ","Remove photo")}</button></div></div>
      <div class="icons" id="icons">${iconsFor().map(i=>`<button type="button" data-ic="${i}" aria-pressed="${i===icon}">${i}</button>`).join("")}</div>
      ${isSvc() ? `<label for="dur">⏱️ ${L("कितना समय लगता है (मिनट)","Time it takes (minutes)")}</label><input id="dur" name="duration_min" type="number" inputmode="numeric" min="5" max="600" step="5" value="${esc(String(p.duration_min ?? 20))}">` : ""}
      <label for="ds">${L("जानकारी","Description")} <small>${L("(ज़रूरी नहीं)","(optional)")}</small></label><textarea id="ds" name="description" maxlength="500">${esc(p.description)}</textarea>
      <label class="switch">${L("दुकान में दिखाएँ","Show in shop")}<input type="checkbox" name="active" ${p.active?"checked":""}></label>
      <label class="switch">${L("ख़ास सामान (ऊपर दिखे)","Featured (shown on top)")}<input type="checkbox" name="featured" ${p.featured?"checked":""}></label>
      <p class="err" id="perr2" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit">💾 ${L("सेव करें","Save")}</button>
      ${id?`<button class="btn btn-danger btn-block" type="button" id="delP" style="margin-top:10px">🗑 ${L("सामान हटाएँ","Delete item")}</button>`:""}</form>`;
    const prev = () => $("#prev").innerHTML = imageId ? `<img src="/api/img/${esc(imageId)}" alt="">` : `<span class="stk-big">${esc(icon)}</span>`; prev();
    // v6 stickers: tap → icon + names + category (names only overwrite what a sticker filled, never the shopkeeper's typing)
    let stkFilled = {hi: id ? null : "", en: id ? null : ""}, newCat = null;
    const stkDraw = gi => { const g = STK[gi]; if (!g || !$("#stkGrid")) return; $("#stkGrid").innerHTML = g.items.map(([e, hi, en]) => `<button type="button" class="stk" data-e="${esc(e)}" data-hi="${esc(hi)}" data-en="${esc(en)}" data-g="${gi}" aria-pressed="${e === icon}"><span>${esc(e)}</span><small>${esc(AK.lang === "en" ? en : hi)}</small></button>`).join(""); };
    stkDraw(0);
    if ($("#stkBtn")) $("#stkBtn").onclick = () => { const h = $("#stk").hidden = !$("#stk").hidden; $("#stkBtn").setAttribute("aria-expanded", String(!h)); };
    if ($("#stkTabs")) $("#stkTabs").onclick = e => { const b = e.target.closest("[data-g]"); if (!b) return; document.querySelectorAll("#stkTabs button").forEach(x => x.setAttribute("aria-pressed", x === b)); stkDraw(Number(b.dataset.g)); };
    if ($("#stkGrid")) $("#stkGrid").onclick = e => { const b = e.target.closest(".stk"); if (!b) return; const f = $("#pf2");
      icon = b.dataset.e; document.querySelectorAll("#stkGrid .stk").forEach(x => x.setAttribute("aria-pressed", x === b));
      if (!f.name_hi.value.trim() || f.name_hi.value === stkFilled.hi) { f.name_hi.value = b.dataset.hi; stkFilled.hi = b.dataset.hi; }
      if (!f.name_en.value.trim() || f.name_en.value === stkFilled.en) { f.name_en.value = b.dataset.en; stkFilled.en = b.dataset.en; }
      const g = STK[Number(b.dataset.g)]; const low = x => String(x || "").toLowerCase();
      const c = g && catalog.categories.find(c => g.kw.some(k => low(c.name_hi).includes(low(k)) || low(c.name_en).includes(low(k))));
      const nw = f.category_id.querySelector('option[value="new"]'); if (nw) nw.remove();
      if (c) f.category_id.value = String(c.id);
      else if (g) { newCat = {name_hi: g.g, name_en: g.en, icon: g.items[0][0]}; f.category_id.insertAdjacentHTML("afterbegin", `<option value="new">➕ ${esc(g.items[0][0])} ${esc(g.g)} (${L("नई","new")})</option>`); f.category_id.value = "new"; }
      document.querySelectorAll("#icons button").forEach(x => x.setAttribute("aria-pressed", x.dataset.ic === icon)); prev();
      const v = document.querySelector("#vrows [name=price]"); if (v && !id) setTimeout(() => v.focus({preventScroll: false}), 50); };
    $("#icons").onclick = e => { const b = e.target.closest("[data-ic]"); if (!b) return; icon = b.dataset.ic; document.querySelectorAll("#icons button").forEach(x=>x.setAttribute("aria-pressed", x===b)); prev(); };
    $("#addV").onclick = () => $("#vrows").insertAdjacentHTML("beforeend", vrow({}));
    $("#vrows").onclick = e => { if (e.target.closest("[data-rmv]") && $("#vrows").children.length > 1) e.target.closest(".vrow").remove(); };
    $("#noPh").onclick = () => { imageId = null; $("#noPh").hidden = true; prev(); };
    $("#ph").onchange = async e => { const file = e.target.files[0]; if (!file) return; $("#prev").textContent = "⏳";
      try { const data_url = await shrink(file); const r = await api("/api/admin/image", {method:"POST", body:{data_url}}); imageId = r.image_id; $("#noPh").hidden = false; prev(); }
      catch (x) { toast(x.message); prev(); } };
    $("#pf2").onsubmit = async e => { e.preventDefault(); const f = e.target;
      const variants = [...document.querySelectorAll("#vrows .vrow")].map(r => ({ id: r.dataset.vid ? Number(r.dataset.vid) : undefined, label: r.querySelector('[name=label]').value, price: r.querySelector('[name=price]').value.trim(), mrp: r.querySelector('[name=mrp]').value.trim(), stock: Number(r.querySelector('[name=stock]').value || 0), low_stock: Number(r.querySelector('[name=low_stock]').value || 3), sku: r.querySelector('[name=sku]').value }));
      let catId = f.category_id.value;
      if (catId === "new" && newCat) { try { catId = String((await api("/api/admin/categories", {method:"POST", body:newCat})).id); const o = f.category_id.querySelector('option[value="new"]'); if (o) o.value = catId; f.category_id.value = catId; newCat = null; } catch (x) { if (!authFail(x)) $("#perr2").textContent = x.message; return; } }
      const body = {name_hi:f.name_hi.value, name_en:f.name_en.value, brand:f.brand.value, description:f.description.value, category_id: catId && catId !== "new" ? Number(catId) : null, icon, image_id:imageId, active:f.active.checked, featured:f.featured.checked, variants, ...(isSvc() && f.duration_min ? {duration_min: f.duration_min.value} : {})};
      try { await api(id ? `/api/admin/products/${id}` : "/api/admin/products", {method: id?"PUT":"POST", body}); toast(L("सेव हो गया ✅","Saved ✅")); closeSheet(); D = null; productsView(); }
      catch (x) { if (!authFail(x)) $("#perr2").textContent = x.message; } };
    if (id) $("#delP").onclick = async () => { if (!confirm(L("यह सामान हमेशा के लिए हटाएँ? (सिर्फ़ छुपाना हो तो 'दुकान में दिखाएँ' बंद करें)","Delete this item permanently? (To just hide it, turn off 'Show in shop')"))) return;
      try { await api(`/api/admin/products/${id}`, {method:"DELETE"}); closeSheet(); D = null; productsView(); } catch (x) { toast(x.message); } };
  }

  // ---- v10.13.1 (Krish 26 Oct 11:02 PM "simple 4-5 suggest button do jisse direct add ho jaye service … by default set hona chahiye"):
  // salon / service Services page + form. Stock is unlimited (SVC_STOCK), no MRP / brand / category / CSV / stock history.
  const SVC_STOCK = 100000; // the most the server accepts = always "available" to customers
  const svcSuggest = () => (shopType() === "salon" && window.AK_PROFILE && AK_PROFILE.SALON_DEFAULTS) || [];
  const svcKey = x => String(x || "").trim().toLowerCase();
  const svcHas = d => catalog.products.some(p => svcKey(p.name_en) === svcKey(d.en) || svcKey(p.name_hi) === svcKey(d.hi));
  const SVC_LABEL = "Regular"; // a one-price service's price row label (no time shown: Krish 11:07 PM "Time hata do")
  const svcAutoLabel = l => !String(l || "").trim() || String(l).trim() === SVC_LABEL || /^\d+\s*(min|मिनट)$/i.test(String(l).trim());
  // Krish 11:04 PM: "Service pehle se hi set karo lekin price shopkeeper set karega" — names + minutes are preset, the PRICE is always the shopkeeper's.
  // An unpriced service = a product with no price row yet: customers never see it (the public catalog lists only priced items) until a price is saved.
  const svcUnpriced = p => !p.variants || !p.variants.length;
  const svcPriceBox = (key, ph) => `<form class="svc-price" data-pf="${key}" novalidate><span class="sp-r">₹</span><input name="price" type="number" inputmode="numeric" min="1" step="1" placeholder="${esc(ph || L("दाम","Price"))}" aria-label="${esc(L("दाम ₹","Price ₹"))}" required><button class="btn btn-primary" type="submit">${L("जोड़ें","Add")}</button></form>`;
  const svcPriceOk = v => { const n = Number(String(v || "").trim()); return n > 0 && n <= 100000 ? n : 0; };
  // v10.14 (Krish 26 Oct 11:30 + 11:33 PM): a salon never adds services — every standard male-salon service is ON by default.
  // He may write his own price (optional, shown to customers) or switch one off. Saves on blur / Enter; toast "Saved ✓".
  async function salonCatalogView(){
    let C; try { C = await api("/api/admin/salon-services"); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const nmS = s => AK.lang === "en" ? s.name_en : s.name_hi;
    const draw = () => { const on = C.services.filter(s => s.on).length;
      app.innerHTML = `<section class="sc-cat"><div class="sc-hero"><span class="sc-hero-i" aria-hidden="true">✂️</span><div><b>${esc(L(`${on} सेवाएँ चालू`, `${on} services live`))}</b><small>${esc(L("ग्राहक इनमें से कुछ भी बुक कर सकते हैं। दाम डालना ज़रूरी नहीं — डालेंगे तो ग्राहक को दिखेगा। जो काम नहीं करते, उसे बंद करें।","Customers can book any of these. A price is optional — if you add one, customers see it. Switch off anything you don't do."))}</small></div></div>
        ${C.groups.map(g => { const list = C.services.filter(s => s.group === g.key); return `<h3 class="sc-g"><span aria-hidden="true">${g.icon}</span> ${esc(AK.lang === "en" ? g.name_en : g.name_hi)}</h3><div class="sc-list">${list.map(s => `
          <div class="sc-row${s.on ? "" : " sc-off"}" data-k="${s.key}"><span class="sc-i" aria-hidden="true">${s.icon}</span><span class="sc-n">${esc(nmS(s))}${s.on ? "" : `<small>${esc(L("बंद","Off"))}</small>`}</span>
            <label class="sc-p"><span>₹</span><input type="number" inputmode="numeric" min="0" step="1" data-price="${s.key}" value="${s.price_paise != null ? s.price_paise / 100 : ""}" placeholder="${esc(L("दाम","Price"))}" aria-label="${esc(L("दाम ₹","Price ₹"))}: ${esc(nmS(s))}"></label>
            <label class="sc-sw"><input type="checkbox" role="switch" data-on="${s.key}" ${s.on ? "checked" : ""} aria-label="${esc(nmS(s))}"><i aria-hidden="true"></i></label></div>`).join("")}</div>`; }).join("")}</section>`; };
    const save = async (body, okMsg) => { try { C = await api("/api/admin/salon-services", {method: "PUT", body}); toast(okMsg); return true; } catch (x) { if (!authFail(x)) toast(x.message); return false; } };
    draw();
    app.onchange = async e => {
      const sw = e.target.closest("[data-on]"); if (sw) { await save({key: sw.dataset.on, on: sw.checked}, sw.checked ? L("चालू ✓","On ✓") : L("बंद — ग्राहकों को नहीं दिखेगी","Off — hidden from customers")); draw(); return; }
      const pi = e.target.closest("[data-price]"); if (pi) { const v = pi.value.trim(); if (v !== "" && !(Number(v) >= 0 && Number(v) <= 100000)) { toast(L("सही दाम डालें","Enter a valid price")); return; }
        const cur = C.services.find(s => s.key === pi.dataset.price); const was = cur && cur.price_paise != null ? String(cur.price_paise / 100) : "";
        if (v === was) return; await save({key: pi.dataset.price, price: v}, L("सेव हो गया ✓","Saved ✓")); }
    };
    app.onkeydown = e => { const pi = e.target.closest && e.target.closest("[data-price]"); if (pi && e.key === "Enter") { e.preventDefault(); pi.blur(); } };
  }
  function svcServicesView(){
    const sug = svcSuggest(); let open = null; // the chip whose ₹ box is open
    const unpriced = () => catalog.products.filter(svcUnpriced);
    app.innerHTML = `<div class="toolbar-a"><input id="pq" type="search" placeholder="${L("सेवा खोजें","Search services")}"><button class="btn btn-primary" type="button" id="addP">+ ${WL("new_item")}</button></div>
      <p class="svc-nudge" id="svcNudge" hidden>💡 ${L("बुकिंग शुरू करने के लिए दाम डालें","Set prices to start taking bookings")}</p>
      ${sug.length ? `<div class="svc-sugg" id="svcSugg"><p class="ss-h">⚡ ${L("एक टैप में जोड़ें","Tap to add")}</p><div class="ss-chips" id="ssChips"></div><div id="ssBox"></div></div>` : ""}
      <div id="plist"></div>`;
    const chips = () => { if (!$("#ssChips")) return; $("#ssChips").innerHTML = sug.map((d, i) => { const has = svcHas(d);
        return `<button type="button" class="ss-chip${has ? " ss-on" : ""}" data-sugg="${i}" ${has ? `disabled aria-pressed="true"` : `aria-pressed="${open === i}"`}><span class="ss-n">${has ? "✓" : esc(d.icon)} ${esc(AK.lang === "en" ? d.en : d.hi)}</span></button>`; }).join("");
      const d = sug[open]; $("#ssBox").innerHTML = d && !svcHas(d) ? `<div class="ss-box"><b>${esc(d.icon)} ${esc(AK.lang === "en" ? d.en : d.hi)}</b>${svcPriceBox("s" + open)}</div>` : ""; };
    const draw = () => { const q = $("#pq").value.trim().toLowerCase();
      $("#svcNudge").hidden = !unpriced().length;
      const list = catalog.products.filter(p => !q || [p.name_hi,p.name_en].join(" ").toLowerCase().includes(q));
      $("#plist").innerHTML = list.length ? list.map(p => {
          if (svcUnpriced(p)) return `<div class="p-row svc-row svc-unpriced"><button type="button" class="svc-open" data-edit="${p.id}"><span class="le">${icBox(p)}</span><span class="pn"><b>${esc(AK.nm(p))}</b><small><em class="sp-need">${L("दाम डालें","Set price")}</em></small></span></button>${svcPriceBox("p" + p.id)}</div>`;
          return `<button type="button" class="p-row svc-row ${p.active?"":"inactive"}" data-edit="${p.id}"><span class="le">${icBox(p)}</span>
          <span class="pn"><b>${esc(AK.nm(p))}${!p.active?`<span class="tag off">${L("छुपा","Hidden")}</span>`:""}</b>
          <small>${p.variants.map(v => `${p.variants.length > 1 ? esc(v.label) + " " : ""}${money(v.price_paise)}`).join(" | ")}</small></span>
          <span class="mini" aria-hidden="true">✏️</span></button>`; }).join("")
        : q ? `<p class="empty">${L("कुछ नहीं मिला","Nothing found")}</p>` : `<p class="empty svc-empty">${sug.length ? L("अभी कोई सेवा नहीं। ऊपर एक दबाकर जोड़ें:","No services yet. Tap one to add:") : L("अभी कोई सेवा नहीं। “+ नई सेवा” दबाएँ।","No services yet. Tap “+ New service”.")}</p>`; };
    chips(); draw(); $("#pq").oninput = draw; $("#addP").onclick = () => editProduct(null);
    $("#plist").onclick = e => { const b = e.target.closest("[data-edit]"); if (b) editProduct(Number(b.dataset.edit)); };
    if ($("#ssChips")) $("#ssChips").onclick = e => { const b = e.target.closest("[data-sugg]"); if (!b || b.disabled) return; const i = Number(b.dataset.sugg);
      if (svcHas(sug[i])) { toast(L("यह सेवा पहले से है ✓","Already added ✓")); return; }
      open = open === i ? null : i; chips(); const inp = $("#ssBox input"); if (inp) inp.focus(); };
    // one submit handler for every ₹ box on the page (a chip's box or an unpriced row's box)
    app.onsubmit = async e => { const f = e.target.closest(".svc-price"); if (!f) return; e.preventDefault();
      const price = svcPriceOk(f.price.value); if (!price) { toast(L("सही दाम डालें","Enter a price")); f.price.focus(); return; }
      const key = f.dataset.pf, btn = f.querySelector("button"); btn.disabled = true;
      try {
        if (key[0] === "s") { const d = sug[Number(key.slice(1))]; if (!d || svcHas(d)) return;
          await api("/api/admin/products", {method:"POST", body:{name_hi: d.hi, name_en: d.en, icon: d.icon, category_id: null, active: true, featured: false, duration_min: d.min, variants: [{label: SVC_LABEL, price, mrp: "", stock: SVC_STOCK, low_stock: 0}]}});
        } else { const p = catalog.products.find(x => x.id === Number(key.slice(1))); if (!p) return; const min = Number(p.duration_min || 20);
          await api(`/api/admin/products/${p.id}`, {method:"PUT", body:{name_hi: p.name_hi, name_en: p.name_en || "", brand: p.brand || "", description: p.description || "", category_id: p.category_id || null, icon: p.icon, image_id: p.image_id || null, active: true, featured: !!p.featured, duration_min: min, variants: [{label: SVC_LABEL, price, mrp: "", stock: SVC_STOCK, low_stock: 0}]}}); }
        toast(L("जुड़ गया ✓","Added ✓")); D = null; await productsView();
      } catch (x) { btn.disabled = false; if (!authFail(x)) toast(x.message); } };
  }
  function svcRow(v = {}){ const r = x => x==null||x==="" ? "" : (x/100).toFixed(2).replace(/\.00$/,"");
    return `<div class="vrow svc-vrow" data-vid="${v.id||""}"><div class="vl"><label>${L("प्रकार","Type")}</label><input name="label" value="${esc(svcAutoLabel(v.label) ? "" : v.label)}" placeholder="${esc(L("जैसे स्टाइलिंग","e.g. Styling"))}" maxlength="40"></div>
      <div><label>${L("रेट ₹","Price ₹")}</label><input name="price" inputmode="decimal" value="${r(v.price_paise)}" required placeholder="100"></div>
      <button class="x" type="button" data-rmv aria-label="Remove">🗑</button></div>`; }
  function editService(id){
    const p = id ? catalog.products.find(x=>x.id===id) : {name_hi:"", name_en:"", brand:"", description:"", icon:"⭐", active:true, featured:false, category_id:null, duration_min:20, variants:[{}]};
    let imageId = p.image_id || null, icon = p.icon || "⭐"; const vrs = p.variants && p.variants.length ? p.variants : [{}];
    const dur0 = Number(p.duration_min || 20); // Krish 11:07 PM "Time hata do": nothing to set; the hidden minutes only feed the token page's wait estimate
    openSheet(id ? WL("edit_item") : WL("new_item"));
    $("#sheetBody").innerHTML = `<form class="form svc-form" id="pf2" novalidate>
      <div class="row2"><div><label for="nh">${L("सेवा का नाम (हिंदी)","Service name (Hindi)")}</label><input id="nh" name="name_hi" value="${esc(p.name_hi)}" required maxlength="80" placeholder="${esc(W("name_ph")[0])}"></div>
      <div><label for="ne">${L("नाम (English)","Name (English)")}</label><input id="ne" name="name_en" value="${esc(p.name_en)}" maxlength="80" placeholder="Haircut"></div></div>
      <div id="vrows">${vrs.map(svcRow).join("")}</div>
      <button class="btn btn-ghost" type="button" id="addV">+ ${WL("another")}</button>
      <input type="hidden" name="duration_min" value="${dur0}">
      <label>${L("फ़ोटो या आइकन","Photo or icon")} <small>${L("(ज़रूरी नहीं)","(optional)")}</small></label>
      <div class="row2" style="align-items:center"><div class="photo-prev" id="prev"></div><div><label class="btn btn-ghost">📷 ${L("फ़ोटो लें / चुनें","Take / choose photo")}<input type="file" accept="image/*" id="ph" hidden></label><button class="btn btn-ghost" type="button" id="noPh" ${imageId?"":"hidden"}>${L("फ़ोटो हटाएँ","Remove photo")}</button></div></div>
      <div class="icons" id="icons">${iconsFor().map(i=>`<button type="button" data-ic="${i}" aria-pressed="${i===icon}">${i}</button>`).join("")}</div>
      <label class="switch">${L("ग्राहकों को दिखाएँ","Show to customers")}<input type="checkbox" name="active" ${p.active?"checked":""}></label>
      <p class="err" id="perr2" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit">💾 ${L("सेव करें","Save")}</button>
      ${id?`<button class="btn btn-danger btn-block" type="button" id="delP" style="margin-top:10px">🗑 ${L("सेवा हटाएँ","Delete service")}</button>`:""}</form>`;
    const prev = () => $("#prev").innerHTML = imageId ? `<img src="/api/img/${esc(imageId)}" alt="">` : `<span class="stk-big">${esc(icon)}</span>`; prev();
    $("#icons").onclick = e => { const b = e.target.closest("[data-ic]"); if (!b) return; icon = b.dataset.ic; document.querySelectorAll("#icons button").forEach(x=>x.setAttribute("aria-pressed", x===b)); prev(); };
    $("#addV").onclick = () => $("#vrows").insertAdjacentHTML("beforeend", svcRow({}));
    $("#vrows").onclick = e => { if (e.target.closest("[data-rmv]") && $("#vrows").children.length > 1) e.target.closest(".vrow").remove(); };
    $("#noPh").onclick = () => { imageId = null; $("#noPh").hidden = true; prev(); };
    $("#ph").onchange = async e => { const file = e.target.files[0]; if (!file) return; $("#prev").textContent = "⏳";
      try { const data_url = await shrink(file); const r = await api("/api/admin/image", {method:"POST", body:{data_url}}); imageId = r.image_id; $("#noPh").hidden = false; prev(); }
      catch (x) { toast(x.message); prev(); } };
    $("#pf2").onsubmit = async e => { e.preventDefault(); const f = e.target; const dur = Number(f.duration_min.value) || 20;
      const rows = [...document.querySelectorAll("#vrows .vrow")];
      const variants = rows.map((r, i) => { const lab = r.querySelector('[name=label]').value.trim();
        return { id: r.dataset.vid ? Number(r.dataset.vid) : undefined, label: lab || (rows.length > 1 && i > 0 ? `${L("प्रकार","Type")} ${i + 1}` : SVC_LABEL), price: r.querySelector('[name=price]').value.trim(), mrp: "", stock: SVC_STOCK, low_stock: 0 }; });
      if (!f.name_hi.value.trim() && f.name_en.value.trim()) f.name_hi.value = f.name_en.value.trim();
      const body = {name_hi:f.name_hi.value, name_en:f.name_en.value, brand: p.brand || "", description: p.description || "", category_id: p.category_id || null, icon, image_id:imageId, active:f.active.checked, featured: !!p.featured, variants, duration_min: dur};
      try { await api(id ? `/api/admin/products/${id}` : "/api/admin/products", {method: id?"PUT":"POST", body}); toast(L("सेव हो गया ✅","Saved ✅")); closeSheet(); D = null; productsView(); }
      catch (x) { if (!authFail(x)) $("#perr2").textContent = x.message; } };
    if (id) $("#delP").onclick = async () => { if (!confirm(L("यह सेवा हटाएँ? (सिर्फ़ छुपाना हो तो 'ग्राहकों को दिखाएँ' बंद करें)","Delete this service? (To just hide it, turn off 'Show to customers')"))) return;
      try { await api(`/api/admin/products/${id}`, {method:"DELETE"}); closeSheet(); D = null; productsView(); } catch (x) { toast(x.message); } };
  }
  // v10.8.1: small square avatar (≤256px, ≤30 KB) for the owner photo
  function shrinkAvatar(file){ return new Promise((res, rej) => { const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); const side = Math.min(img.width, img.height), sx = (img.width - side) / 2, sy = (img.height - side) / 2;
      for (const px of [256, 200, 160]) { const c = document.createElement("canvas"); c.width = c.height = Math.min(px, side); c.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, c.width, c.height);
        for (const q of [0.82, 0.7, 0.58, 0.45]) { let d = c.toDataURL("image/webp", q); if (!/^data:image\/webp/.test(d)) d = c.toDataURL("image/jpeg", q);
          if ((d.length - d.indexOf(",") - 1) * 3 / 4 <= 29000) return res(d); } }
      rej(new Error(L("फ़ोटो छोटी नहीं हो पाई, दूसरी फ़ोटो चुनें","Couldn't shrink that photo, try another"))); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(L("यह फ़ोटो नहीं खुली","Couldn't read that photo"))); }; img.src = url; }); }
  function shrink(file){ return new Promise((res, rej) => { const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const max = 640; const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.78)); };
    img.onerror = () => rej(new Error(L("यह फ़ोटो नहीं खुली","Couldn't read that photo"))); img.src = url; }); }

  // ---------- categories ----------
  async function categoriesView(){
    try { await loadCatalog(); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const count = id => catalog.products.filter(p=>p.category_id===id).length;
    app.innerHTML = `<form class="a-card form" id="cf"><h3>+ ${L("नई कैटेगरी","New category")}</h3><div class="row2"><div><label for="ch">${L("नाम (हिंदी)","Name (Hindi)")}</label><input id="ch" name="name_hi" required maxlength="60"></div><div><label for="ce">English</label><input id="ce" name="name_en" maxlength="60"></div></div>
      <label for="ci">${L("आइकन","Icon")}</label><input id="ci" name="icon" value="🛍️" maxlength="8"><p class="err" id="cerr"></p><button class="btn btn-primary">${L("जोड़ें","Add")}</button></form>
      <div id="clist">${catalog.categories.map((c,i) => `<div class="c-row" data-cid="${c.id}"><span style="font-size:24px">${esc(c.icon)}</span><span class="cn"><b>${esc(c.name_hi)}</b>${!c.active?`<span class="tag off">${L("छुपी","Hidden")}</span>`:""}<small>${esc(c.name_en)} · ${count(c.id)} ${L("सामान","items")}</small></span>
        <button class="mini" type="button" data-up="${i}" ${i===0?"disabled":""} aria-label="Up">↑</button><button class="mini" type="button" data-down="${i}" ${i===catalog.categories.length-1?"disabled":""} aria-label="Down">↓</button><button class="mini" type="button" data-cedit="${c.id}" aria-label="Edit">✏️</button></div>`).join("")}</div>`;
    $("#cf").onsubmit = async e => { e.preventDefault(); const f = e.target; try { await api("/api/admin/categories", {method:"POST", body:{name_hi:f.name_hi.value, name_en:f.name_en.value, icon:f.icon.value}}); categoriesView(); } catch (x) { $("#cerr").textContent = x.message; } };
    $("#clist").onclick = async e => { const ids = catalog.categories.map(c=>c.id); let b;
      if ((b = e.target.closest("[data-up]")) || (b = e.target.closest("[data-down]"))) { const i = Number(b.dataset.up ?? b.dataset.down); const j = b.dataset.up != null ? i-1 : i+1; [ids[i], ids[j]] = [ids[j], ids[i]]; await api("/api/admin/categories/order", {method:"POST", body:{ids}}); categoriesView(); }
      else if ((b = e.target.closest("[data-cedit]"))) editCategory(catalog.categories.find(c=>c.id===Number(b.dataset.cedit))); };
  }
  function editCategory(c){
    openSheet(L("कैटेगरी बदलें","Edit category"));
    $("#sheetBody").innerHTML = `<form class="form" id="cf2"><label for="h">${L("नाम (हिंदी)","Name (Hindi)")}</label><input id="h" name="name_hi" value="${esc(c.name_hi)}" required maxlength="60">
      <label for="e">English</label><input id="e" name="name_en" value="${esc(c.name_en)}" maxlength="60"><label for="i">${L("आइकन","Icon")}</label><input id="i" name="icon" value="${esc(c.icon)}" maxlength="8">
      <label class="switch">${L("दुकान में दिखाएँ","Show in shop")}<input type="checkbox" name="active" ${c.active?"checked":""}></label><p class="err" id="e2"></p>
      <button class="btn btn-primary btn-block">💾 ${L("सेव","Save")}</button><button class="btn btn-danger btn-block" type="button" id="delC" style="margin-top:10px">🗑 ${L("हटाएँ","Delete")}</button></form>`;
    $("#cf2").onsubmit = async e => { e.preventDefault(); const f = e.target; try { await api(`/api/admin/categories/${c.id}`, {method:"PUT", body:{name_hi:f.name_hi.value, name_en:f.name_en.value, icon:f.icon.value, active:f.active.checked}}); closeSheet(); categoriesView(); } catch (x) { $("#e2").textContent = x.message; } };
    $("#delC").onclick = async () => { try { await api(`/api/admin/categories/${c.id}`, {method:"DELETE"}); closeSheet(); categoriesView(); } catch (x) { $("#e2").textContent = x.message; } };
  }


  const loadScript = src => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("load failed")); document.head.appendChild(s); });
  // ---------- order alerts (Web Push to the shopkeeper's phone) ----------
  // v10.5: Dukaan keys are "admin.*" (customer keys are "cust.<slug>.*", Dev keys "dev.*"); the old key is read once.
  const PUSH_KEY = "admin.push";
  function pushKeyGet(){ try { return localStorage.getItem(PUSH_KEY) || localStorage.getItem("ak_admin_push"); } catch { return null; } }
  function pushKeySet(v){ try { if (v) localStorage.setItem(PUSH_KEY, v); else localStorage.removeItem(PUSH_KEY); localStorage.removeItem("ak_admin_push"); } catch {} }
  // v10.5: alerts that were on under the old site-wide worker (scope "/") move to the Dukaan app's own worker (scope /admin)
  // by themselves — no tap needed when the phone already allowed notifications.
  async function moveAlerts(){ try {
    const had = pushKeyGet(); if (!had || !AK.pushSupported() || Notification.permission !== "granted" || !window.AKPWA) return;
    const reg = await window.AKPWA.register(); if (!reg) return; const cur = await reg.pushManager.getSubscription();
    if (cur && cur.endpoint === had) return;
    const sub = await AK.getPushSubscription(); await api("/api/admin/push/subscribe", {method:"POST", body:{subscription:sub}});
    const old = window.AKPWA.oldEndpoint() || had; if (old && old !== sub.endpoint) { try { await api("/api/admin/push/unsubscribe", {method:"POST", body:{endpoint: old}}); } catch {} }
    pushKeySet(sub.endpoint);
  } catch {} }
  const OUT = () => ({accepted:L("✅ भेजा (push service ने लिया)","✅ sent (push service accepted)"), expired:L("🗑 पुराना डिवाइस — हटाया","🗑 expired device — removed"), rejected:L("⚠️ नहीं गया","⚠️ not sent"), error:L("⚠️ नहीं गया","⚠️ not sent"), no_subscription:L("— कोई डिवाइस चालू नहीं","— no device subscribed")});
  const EV = e => e === "new_order" ? L("नया ऑर्डर","New order") : e === "test" ? L("टेस्ट","Test") : e.startsWith("status:") ? L("ग्राहक को: ","To customer: ") + stName(e.slice(7)) : e;
  async function renderAlerts(el, compact){
    if (!el) return;
    let info = null; try { info = await api("/api/admin/push"); } catch (e) { if (authFail(e)) return; }
    const st = AK.pushState(); const ep = await AK.currentEndpoint();
    const on = !!(ep && pushKeyGet() === ep && info && info.devices.some(d => ep.endsWith(d.endpoint_tail)));
    const n = info ? info.devices.length : 0;
    const where = L("Android (Chrome) और कंप्यूटर पर चलता है। iPhone पर तभी, जब यह पेज Home Screen पर जोड़ा हो (Share → Add to Home Screen, iOS 16.4+)। फ़ोन का बैटरी-सेवर नोटिफिकेशन रोक सकता है — एक बार टेस्ट ज़रूर करें।","Works on Android (Chrome) and computers. On iPhone only if this page is added to the Home Screen (Share → Add to Home Screen, iOS 16.4+). Battery savers can block notifications — send a test once.");
    let html = `<div class="a-card alerts ${on ? "on" : ""}"><h3>🔔 ${L("ऑर्डर अलर्ट","Order alerts")}</h3>`;
    if (on) html += `<p><b>${L("इस फ़ोन पर चालू हैं।","On for this phone.")}</b> ${L("नया ऑर्डर आते ही नोटिफिकेशन भेजा जाएगा, पैनल बंद हो तब भी।","A notification is sent on every new order, even when this panel is closed.")}</p>
      <div class="o-actions"><button class="btn btn-ghost" type="button" id="alTest">📨 ${L("टेस्ट अलर्ट भेजें","Send test alert")}</button><button class="btn btn-ghost" type="button" id="alOff">${L("इस फ़ोन पर बंद करें","Turn off on this phone")}</button></div>`;
    else if (st === "ios_needs_homescreen") html += `<p>${L("iPhone पर: Safari में Share ⬆️ → “Add to Home Screen”। फिर Home Screen वाले आइकन से यह पैनल खोलें और यहाँ “अलर्ट चालू करें” दबाएँ (iOS 16.4+)।","On iPhone: in Safari tap Share ⬆️ → “Add to Home Screen”. Open the panel from that icon and tap “Enable order alerts” here (iOS 16.4+).")}</p>`;
    else if (st === "unsupported") html += `<p>${L("इस ब्राउज़र में नोटिफिकेशन नहीं चलते। Android पर Chrome में खोलें।","This browser can't show notifications. Open in Chrome on Android.")}</p>`;
    else if (st === "denied") html += `<p>${L("नोटिफिकेशन ब्लॉक हैं — ब्राउज़र की साइट सेटिंग में Notifications → Allow करें, फिर पेज रीलोड करें।","Notifications are blocked — allow them in the browser's site settings, then reload.")}</p>`;
    else html += `<button class="btn btn-notif btn-block" type="button" id="alOn">🔔 ${L("ऑर्डर अलर्ट चालू करें","Enable order alerts")}</button>`;
    if (!on) html += `<p class="hint">${where}</p>`;
    html += `<p class="hint">${L("पैनल खुला हो तो आवाज़ + बैज वाला अलर्ट भी आता है।","When this panel is open you also get a sound + badge.")} ${n ? L(`${n} डिवाइस जुड़े हैं।`,`${n} device(s) connected.`) : ""}</p>`;
    if (!compact && info && info.attempts.length) html += `<details><summary>${L("हाल की सूचनाएँ (रिकॉर्ड)","Recent notifications (log)")}</summary><ul class="al-log">${info.attempts.slice(0, 15).map(a => `<li><small>${when(a.at)}</small> ${a.code ? `<b>${esc(a.code)}</b> · ` : ""}${esc(EV(a.event))} — ${esc(OUT()[a.outcome] || a.outcome)}${a.http_status ? ` <small>(HTTP ${a.http_status})</small>` : ""}</li>`).join("")}</ul>
      <p class="hint">${L("“भेजा” का मतलब push service (Google/Apple/Mozilla) ने ले लिया। फ़ोन पर दिखा या नहीं, यह हमें पता नहीं चलता।","“Sent” means the push service (Google/Apple/Mozilla) accepted it. Whether the phone showed it is not visible to us.")}</p></details>`;
    el.innerHTML = html + `</div>`;
    const bOn = el.querySelector("#alOn"), bOff = el.querySelector("#alOff"), bT = el.querySelector("#alTest");
    if (bOn) bOn.onclick = async () => { bOn.disabled = true; bOn.textContent = "…";
      try { const sub = await AK.getPushSubscription(); await api("/api/admin/push/subscribe", {method:"POST", body:{subscription:sub}}); pushKeySet(sub.endpoint);
        const r = await api("/api/admin/push/test", {method:"POST", body:{endpoint: sub.endpoint}}); const ok = r.results.some(x => x.outcome === "accepted");
        toast(ok ? L("✅ अलर्ट चालू — टेस्ट नोटिफिकेशन भेजा","✅ Alerts on — test notification sent") : L("चालू हुआ, पर टेस्ट नहीं गया","On, but the test was not accepted")); }
      catch (e) { if (!authFail(e)) toast(e.code === "denied" ? L("नोटिफिकेशन ब्लॉक हुए","Notifications blocked") : e.code === "dismissed" ? L("अनुमति नहीं मिली","Permission not given") : e.message); }
      renderAlerts(el, compact); };
    if (bOff) bOff.onclick = async () => { try { await api("/api/admin/push/unsubscribe", {method:"POST", body:{endpoint: ep}}); pushKeySet(null); toast(L("इस फ़ोन पर अलर्ट बंद","Alerts off on this phone")); } catch (e) { toast(e.message); } renderAlerts(el, compact); };
    if (bT) bT.onclick = async () => { bT.disabled = true; try { const r = await api("/api/admin/push/test", {method:"POST", body:{endpoint: ep}}); const x = r.results[0] || {};
      toast(x.outcome === "accepted" ? L("📨 भेजा — फ़ोन पर आया?","📨 Sent — did it show up?") : `${OUT()[x.outcome] || x.outcome} ${x.status ? "(HTTP " + x.status + ")" : ""}`); } catch (e) { toast(e.message); } bT.disabled = false; };
  }

  // ---------- offers ----------
  const OSTATE = () => ({live:["🟢 "+L("लाइव — ग्राहकों को दिख रहा","Live — customers see it"),"live"], scheduled:["🕒 "+L("आने वाला (तारीख़ बाकी)","Scheduled"),"sched"], expired:["⌛ "+L("ख़त्म (तारीख़ निकल गई)","Expired"),"exp"], off:["⏸ "+L("बंद","Off"),"off"]});
  const istInput = ms => ms ? new Date(ms + 330*60000).toISOString().slice(0,16) : "";
  const fromIstInput = v => v ? Date.parse(v + ":00+05:30") : null;
  const COLORS = ["#c2410c","#1f6b3a","#b42318","#7c3aed","#0369a1","#a16207"];
  async function offersView(){
    let r; try { [r] = await Promise.all([api("/api/admin/offers"), loadCatalog()]); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const pn = id => catalog.products.find(p => p.id === id); const cn = id => catalog.categories.find(c => c.id === id);
    app.innerHTML = `<div class="toolbar-a"><h2 style="margin:0;flex:1">🏷️ ${L("ऑफर","Offers")}</h2><button class="btn btn-primary" type="button" id="addO">+ ${L("नया ऑफर","New offer")}</button></div>
      <p class="hint">${L("चालू ऑफर ग्राहकों के होमपेज पर दिखते हैं और जुड़े सामान पर “ऑफर” टैग लगता है। ऑफर वाला दाम चेकआउट पर सर्वर ख़ुद लगाता है; आख़िरी तारीख़ निकलते ही ऑफर अपने आप बंद।","Active offers show on the customer homepage and tag linked items. The server applies the offer price at checkout; offers stop by themselves after the end date.")}</p>
      ${r.offers.length ? r.offers.map(o => { const s = OSTATE()[o.state];
        const scope = [o.category_id && cn(o.category_id) ? `🗂️ ${esc(cn(o.category_id).name_hi)}` : "", ...[...new Set(o.items.map(i => i.product_id))].map(id => esc(pn(id)?.name_hi || "?"))].filter(Boolean).join(", ");
        const what = o.rule === "cart_flat" ? `₹${o.amount_off_paise/100} ${L("छूट","off")} · ${L("कार्ट","cart")} ≥ ₹${o.min_cart_paise/100}` : o.rule === "cart_percent" ? `${o.percent_off}% ${L("छूट","off")}${o.amount_off_paise ? ` (${L("₹" + o.amount_off_paise/100 + " तक","up to ₹" + o.amount_off_paise/100)})` : ""} · ${L("कार्ट","cart")} ≥ ₹${o.min_cart_paise/100}` : o.rule === "free_delivery" ? `🛵 ${L("फ्री डिलीवरी","Free delivery")}${o.min_cart_paise ? ` · ${L("कार्ट","cart")} ≥ ₹${o.min_cart_paise/100}` : ""}` : o.kind === "percent" ? `${o.percent_off}% ${L("छूट","off")}` : o.kind === "price" ? o.items.filter(i=>i.offer_price_paise).map(i => `${esc(i.name_hi)} ${esc(i.label||"")}: <s>${money(i.price_paise)}</s> → <b>${money(i.offer_price_paise)}</b>`).join(" · ") : L("सिर्फ़ सूचना","Info only");
        return `<div class="of-row" style="--oc:${esc(o.color)}"><div class="of-sw" aria-hidden="true"></div><div class="of-main">
          <b>${esc(o.title_hi)}</b>
          <small class="of-state ${s[1]}">${s[0]}</small>
          <small>${what}${scope ? ` · ${scope}` : ""}</small>
          <small>${o.starts_at ? L("शुरू ","From ") + when(o.starts_at) : ""}${o.ends_at ? ` · ${L("आख़िरी ","Until ")}${when(o.ends_at)}` : (o.starts_at ? "" : L("कोई आख़िरी तारीख़ नहीं","No end date"))}</small></div>
          <label class="switch sm"><span class="sr-only">${L("चालू","Active")}</span><input type="checkbox" data-oact="${o.id}" ${o.active ? "checked" : ""}></label>
          <button class="mini" type="button" data-oedit="${o.id}" aria-label="Edit">✏️</button></div>`; }).join("")
      : `<div class="a-card empty"><p>🏷️ ${esc(PW("offers_empty", L("अभी कोई ऑफर नहीं। “नया ऑफर” से बनाएँ — जैसे “दाल पर 10% छूट” या “आटा 5 kg सिर्फ़ ₹229”।","No offers yet. Tap “New offer” — e.g. “10% off dal” or “Atta 5 kg only ₹229”.")))}</p></div>`}`;
    $("#addO").onclick = () => editOffer(null);
    app.onchange = async e => { const c = e.target.closest("[data-oact]"); if (!c) return;
      try { await api(`/api/admin/offers/${c.dataset.oact}/active`, {method:"POST", body:{active:c.checked}}); toast(c.checked ? L("ऑफर चालू ✅","Offer on ✅") : L("ऑफर बंद","Offer off")); offersView(); } catch (x) { if (!authFail(x)) toast(x.message); } };
    app.onclick = e => { const b = e.target.closest("[data-oedit]"); if (b) editOffer(r.offers.find(o => o.id === Number(b.dataset.oedit))); };
  }
  function editOffer(o){
    const isNew = !o; if (o && o.rule) o = {...o, kind: o.rule}; o = o || {kind:"percent", percent_off:10, color:COLORS[0], active:true, items:[], title_hi:"", title_en:"", desc_hi:"", desc_en:""};
    const picked = new Set(o.items.map(i => i.product_id)); const prices = Object.fromEntries(o.items.filter(i => i.variant_id).map(i => [i.variant_id, (i.offer_price_paise/100).toFixed(2).replace(/\.00$/,"")]));
    let imageId = o.image_id || null;
    openSheet(isNew ? L("नया ऑफर","New offer") : L("ऑफर बदलें","Edit offer"));
    $("#sheetBody").innerHTML = `<form class="form" id="of" novalidate>
      <div class="row2"><div><label for="oth">${L("ऑफर का नाम (हिंदी)","Offer title (Hindi)")}</label><input id="oth" name="title_hi" value="${esc(o.title_hi)}" required maxlength="80" placeholder="${esc(PROF().words.offer_ph_hi || "दाल पर 10% छूट")}"></div>
      <div><label for="ote">English <small>${L("(ज़रूरी नहीं)","(optional)")}</small></label><input id="ote" name="title_en" value="${esc(o.title_en)}" maxlength="80" placeholder="${esc(PROF().words.offer_ph_en || "10% off dal")}"></div></div>
      <div class="row2"><div><label for="odh">${L("छोटी जानकारी (हिंदी)","Short description (Hindi)")}</label><input id="odh" name="desc_hi" value="${esc(o.desc_hi)}" maxlength="200"></div>
      <div><label for="ode">English</label><input id="ode" name="desc_en" value="${esc(o.desc_en)}" maxlength="200"></div></div>
      <label for="okind">${L("ऑफर किस तरह का?","Offer type")}</label>
      <select id="okind" name="kind"><option value="percent" ${o.kind==="percent"?"selected":""}>${L("% छूट (चुने सामान या कैटेगरी पर)","% off (chosen items or a category)")}</option><option value="price" ${o.kind==="price"?"selected":""}>${L("ख़ास दाम (हर साइज़ का अलग)","Special price (per pack size)")}</option><option value="cart_flat" ${o.rule==="cart_flat"?"selected":""}>${L("₹ छूट — कार्ट ₹X से ऊपर (जैसे ₹500 पर ₹50)","₹ off above a cart value (e.g. ₹50 off on ₹500)")}</option><option value="cart_percent" ${o.rule==="cart_percent"?"selected":""}>${L("% छूट — कार्ट ₹X से ऊपर","% off above a cart value")}</option><option value="free_delivery" ${o.rule==="free_delivery"?"selected":""}>${L("फ्री डिलीवरी (₹X से ऊपर, तारीख़ तक)","Free delivery (above ₹X, for a period)")}</option><option value="info" ${o.kind==="info"&&!o.rule?"selected":""}>${L("सिर्फ़ सूचना (दाम नहीं बदलेगा)","Info only (price unchanged)")}</option></select>
      <div id="pctRow"><label for="opct">${L("कितने % छूट (1–90)","% off (1–90)")}</label><input id="opct" name="percent_off" inputmode="numeric" value="${o.percent_off ?? 10}"></div>
      <div id="cartRow"><div class="row2"><div><label for="omin">${L("कम से कम कार्ट (₹)","Minimum cart (₹)")}</label><input id="omin" name="min_cart" inputmode="decimal" value="${o.min_cart_paise ? o.min_cart_paise/100 : ""}" placeholder="500"></div>
        <div id="amtCol"><label for="oamt" id="oamtL"></label><input id="oamt" name="amount_off" inputmode="decimal" value="${o.amount_off_paise ? o.amount_off_paise/100 : ""}" placeholder="50"></div></div>
        <p class="hint">${L("कार्ट पर एक ही छूट लगती है (सबसे ज़्यादा वाली)। चेकआउट पर सर्वर ख़ुद जाँचता है।","Only one cart discount applies (the biggest). The server checks it at checkout.")}</p></div>
      <div id="catRow"><label for="ocat">${L("पूरी कैटेगरी पर","Whole category")} <small>${L("(ज़रूरी नहीं)","(optional)")}</small></label><select id="ocat" name="category_id"><option value="">—</option>${catalog.categories.map(c => `<option value="${c.id}" ${c.id===o.category_id?"selected":""}>${esc(c.icon)} ${esc(c.name_hi)}</option>`).join("")}</select></div>
      <div id="itemsRow"><label>${L("किन सामान पर","Which items")}</label><input id="opq" type="search" placeholder="${L("सामान खोजें","Search items")}">
      <div class="opick" id="opick"></div></div>
      <div class="row2 dates"><div><label for="ost">${L("कब से","Starts")} <small>${L("(ख़ाली = अभी से)","(empty = now)")}</small></label><input id="ost" name="starts_at" type="datetime-local" value="${istInput(o.starts_at)}"></div>
      <div><label for="oen">${L("कब तक","Ends")} <small>${L("(ख़ाली = जब तक बंद न करें)","(empty = until switched off)")}</small></label><input id="oen" name="ends_at" type="datetime-local" value="${istInput(o.ends_at)}"></div></div>
      <label>${L("बैनर का रंग","Banner colour")}</label><div class="swatches" id="osw">${COLORS.map(c => `<button type="button" data-col="${c}" style="background:${c}" aria-pressed="${c===o.color}" aria-label="${c}"></button>`).join("")}<input type="color" id="ocol" value="${esc(o.color)}" aria-label="${L("दूसरा रंग","Other colour")}"></div>
      <label>${L("बैनर फ़ोटो","Banner photo")} <small>${L("(ज़रूरी नहीं)","(optional)")}</small></label>
      <div class="row2" style="align-items:center"><div class="photo-prev" id="oprev"></div><div><label class="btn btn-ghost">📷 ${L("फ़ोटो चुनें","Choose photo")}<input type="file" accept="image/*" id="oph" hidden></label><button class="btn btn-ghost" type="button" id="onoPh" ${imageId?"":"hidden"}>${L("फ़ोटो हटाएँ","Remove photo")}</button></div></div>
      <label class="switch">${L("ऑफर चालू (ग्राहकों को दिखे)","Offer on (customers see it)")}<input type="checkbox" name="active" ${o.active?"checked":""}></label>
      <p class="err" id="oerr" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit">💾 ${L("ऑफर सेव करें","Save offer")}</button>
      ${!isNew ? `<button class="btn btn-danger btn-block" type="button" id="delO" style="margin-top:10px">🗑 ${L("ऑफर हटाएँ","Delete offer")}</button>` : ""}</form>`;
    const f = $("#of"); let color = o.color;
    const prev = () => $("#oprev").innerHTML = imageId ? `<img src="/api/img/${esc(imageId)}" alt="">` : `<span style="display:block;width:100%;height:100%;border-radius:12px;background:${esc(color)}"></span>`;
    const drawPick = () => {
      const kind = f.kind.value, q = $("#opq").value.trim().toLowerCase();
      const cartK = ["cart_flat","cart_percent","free_delivery"].includes(kind);
      $("#pctRow").hidden = kind !== "percent" && kind !== "cart_percent"; $("#catRow").hidden = kind === "price" || cartK; $("#itemsRow").hidden = cartK; $("#cartRow").hidden = !cartK;
      $("#amtCol").hidden = kind === "free_delivery"; $("#oamtL").textContent = kind === "cart_flat" ? L("कितने ₹ छूट","₹ off") : L("ज़्यादा से ज़्यादा छूट ₹ (ज़रूरी नहीं)","Max discount ₹ (optional)");
      const list = catalog.products.filter(p => picked.has(p.id) || !q || [p.name_hi, p.name_en].join(" ").toLowerCase().includes(q)).sort((a,b) => (picked.has(b.id) - picked.has(a.id))).slice(0, q ? 60 : 40);
      $("#opick").innerHTML = list.map(p => `<div class="op-item ${picked.has(p.id) ? "on" : ""}"><label><input type="checkbox" data-pp="${p.id}" ${picked.has(p.id) ? "checked" : ""}> ${p.image ? "" : icI(p)} ${esc(AK.nm(p))} <small>${esc(p.name_en)}</small></label>
        ${kind === "price" && picked.has(p.id) ? `<div class="op-vars">${p.variants.map(v => `<label>${esc(v.label)} · ${L("अभी","now")} ${money(v.price_paise)} → ₹<input data-vp="${v.id}" inputmode="decimal" value="${esc(prices[v.id] || "")}" placeholder="${L("ऑफर दाम","offer price")}"></label>`).join("")}</div>` : ""}</div>`).join("") || `<p class="hint">${L("कुछ नहीं मिला","Nothing found")}</p>`;
    };
    drawPick(); prev();
    f.kind.onchange = drawPick; $("#opq").oninput = drawPick;
    $("#opick").onchange = e => { const c = e.target.closest("[data-pp]"); if (c) { c.checked ? picked.add(Number(c.dataset.pp)) : picked.delete(Number(c.dataset.pp)); drawPick(); } };
    $("#opick").oninput = e => { const i = e.target.closest("[data-vp]"); if (i) prices[i.dataset.vp] = i.value; };
    $("#osw").onclick = e => { const b = e.target.closest("[data-col]"); if (!b) return; color = b.dataset.col; $("#ocol").value = color; document.querySelectorAll("#osw [data-col]").forEach(x => x.setAttribute("aria-pressed", x === b)); prev(); };
    $("#ocol").oninput = e => { color = e.target.value; document.querySelectorAll("#osw [data-col]").forEach(x => x.setAttribute("aria-pressed", "false")); prev(); };
    $("#onoPh").onclick = () => { imageId = null; $("#onoPh").hidden = true; prev(); };
    $("#oph").onchange = async e => { const file = e.target.files[0]; if (!file) return; $("#oprev").textContent = "⏳";
      try { const data_url = await shrink(file); const r = await api("/api/admin/image", {method:"POST", body:{data_url}}); imageId = r.image_id; $("#onoPh").hidden = false; prev(); } catch (x) { toast(x.message); prev(); } };
    f.onsubmit = async e => { e.preventDefault();
      const kind = f.kind.value;
      const variant_prices = kind === "price" ? Object.entries(prices).filter(([vid, val]) => String(val).trim() !== "" && catalog.products.some(p => picked.has(p.id) && p.variants.some(v => v.id === Number(vid)))).map(([vid, val]) => ({variant_id:Number(vid), offer_price:String(val).trim()})) : [];
      const cartK = ["cart_flat","cart_percent","free_delivery"].includes(kind);
      const body = {title_hi:f.title_hi.value, title_en:f.title_en.value, desc_hi:f.desc_hi.value, desc_en:f.desc_en.value, kind, percent_off: kind === "percent" || kind === "cart_percent" ? Number(f.percent_off.value) : null,
        min_cart: cartK ? f.min_cart.value.trim() : "", amount_off: cartK && kind !== "free_delivery" ? f.amount_off.value.trim() : "",
        category_id: kind !== "price" && !cartK && f.category_id.value ? Number(f.category_id.value) : null, product_ids: cartK ? [] : [...picked], variant_prices, color, image_id:imageId,
        starts_at: fromIstInput(f.starts_at.value), ends_at: fromIstInput(f.ends_at.value), active: f.active.checked};
      try { await api(isNew ? "/api/admin/offers" : `/api/admin/offers/${o.id}`, {method: isNew ? "POST" : "PUT", body}); toast(L("ऑफर सेव ✅","Offer saved ✅")); closeSheet(); offersView(); }
      catch (x) { if (!authFail(x)) $("#oerr").textContent = x.message; } };
    if (!isNew) $("#delO").onclick = async () => { if (!confirm(L("यह ऑफर हटाएँ? (पुराने ऑर्डर नहीं बदलेंगे)","Delete this offer? (Past orders stay as they were)"))) return;
      try { await api(`/api/admin/offers/${o.id}`, {method:"DELETE"}); closeSheet(); offersView(); } catch (x) { toast(x.message); } };
  }

  // ---------- settings ----------
  // ---------- v10.12: 📍 shop location (once, from the shopkeeper's phone) → customers nearby see the distance on /shops
  function drawLocCard(step){
    const el = $("#locCard"); if (!el || !me || !me.shop) return; const loc = me.shop.location;
    const head = `<h3>📍 ${L("दुकान की लोकेशन","Shop location")}</h3>`;
    if (step && step.lat != null) {
      el.innerHTML = head + `<p class="loc-q">${L("यही आपकी दुकान की जगह है?","Is this your shop's location?")}</p><p class="loc-v">${step.lat.toFixed(5)}, ${step.lng.toFixed(5)}${step.acc ? ` · ±${Math.round(step.acc)} m` : ""}</p>
        <p class="hint">${L("दुकान के अंदर खड़े होकर ही सेव करें।","Save it only while you are standing in your shop.")}</p>
        <div class="row2"><button type="button" class="btn btn-primary btn-big" id="locYes">✅ ${L("हाँ, सेव करें","Yes, save")}</button><button type="button" class="btn btn-ghost btn-big" id="locNo">${L("रद्द करें","Cancel")}</button></div><p class="err" id="locErr" role="alert"></p>`;
      $("#locNo").onclick = () => drawLocCard();
      $("#locYes").onclick = async ev => { const b = ev.currentTarget; b.disabled = true;
        try { const r = await api("/api/admin/location", {method: "POST", body: {lat: step.lat, lng: step.lng, accuracy: step.acc, confirm: true}}); me.shop.location = r.location; toast(L("लोकेशन सेव हो गई ✅","Location saved ✅")); drawLocCard(); }
        catch (x) { if (!authFail(x)) { $("#locErr").textContent = x.message; b.disabled = false; } } };
      return;
    }
    el.innerHTML = head + (loc ? `<p class="loc-ok">✅ ${L("लोकेशन सेव है। पास के ग्राहकों को दूरी दिखेगी।","Location saved. Nearby customers see how far you are.")}</p>` : `<p class="hint">${L("एक बार सेव करें, ताकि पास के ग्राहक आपकी दुकान सबसे ऊपर देखें।","Save it once so nearby customers see your shop first.")}</p>`) +
      `<button type="button" class="btn ${loc ? "btn-ghost" : "btn-primary"} btn-block btn-big" id="locSet">📍 ${loc ? L("लोकेशन फिर से सेट करें","Set location again") : L("मेरी दुकान की लोकेशन सेट करें","Set my shop location")}</button>
      ${loc ? `<button type="button" class="btn btn-ghost btn-block" id="locClear">🗑️ ${L("लोकेशन हटाएँ","Remove location")}</button>` : ""}<p class="err" id="locErr" role="alert"></p>`;
    $("#locSet").onclick = ev => { const b = ev.currentTarget;
      if (!navigator.geolocation) { $("#locErr").textContent = L("इस फ़ोन पर लोकेशन नहीं मिल रही।","Location isn't available on this phone."); return; }
      b.disabled = true; b.textContent = "📍 " + L("लोकेशन देख रहे हैं…","Finding location…");
      navigator.geolocation.getCurrentPosition(p => drawLocCard({lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy}),
        err => { drawLocCard(); $("#locErr").textContent = err && err.code === 1 ? L("लोकेशन की इजाज़त नहीं मिली। फ़ोन की सेटिंग में इस साइट के लिए लोकेशन चालू करें।","Location permission was denied. Turn on location for this site in your phone settings.") : L("लोकेशन नहीं मिली। फिर कोशिश करें।","Couldn't get the location. Try again."); },
        {enableHighAccuracy: true, timeout: 15000, maximumAge: 0}); };
    if ($("#locClear")) $("#locClear").onclick = async ev => { if (!confirm(L("दुकान की लोकेशन हटाएँ?","Remove the shop location?"))) return; const b = ev.currentTarget; b.disabled = true;
      try { await api("/api/admin/location", {method: "POST", body: {clear: true}}); me.shop.location = null; toast(L("लोकेशन हटा दी","Location removed")); drawLocCard(); } catch (x) { if (!authFail(x)) { $("#locErr").textContent = x.message; b.disabled = false; } } };
  }
  async function settingsView(){
    try { await loadDash(); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const s = D.settings; const r = p => p ? (p/100).toFixed(2).replace(/\.00$/,"") : ""; const si = D.shop_info || {};
    const inp = (n, label, v, extra="") => `<label for="s_${n}">${label}</label><input id="s_${n}" name="${n}" value="${esc(v ?? "")}" ${extra}>`;
    const shopLink = (me && me.shop && me.shop.customer_url) || (location.origin + (me && me.shop ? me.shop.link : "/"));
    app.innerHTML = `<button type="button" class="a-card help-card" id="helpBtn"><span aria-hidden="true">❓</span> <b>${L("मदद","Help")}</b> <small>${L("कैसे इस्तेमाल करें + Krish से WhatsApp","How to use + WhatsApp Krish")}</small></button>
      ${isSvc() && shopType() !== "salon" ? `<div class="a-card set-tools"><h3>🧰 ${esc(PW("more_tools", "More"))}</h3><div class="svc-pills sp-left"><button type="button" class="svc-pill" data-go="offers"><span aria-hidden="true">🏷️</span> ${L("ऑफर","Offers")}</button><button type="button" class="svc-pill" data-go="categories"><span aria-hidden="true">🗂️</span> ${L("कैटेगरी","Categories")}</button></div></div>` : ""}
      <div class="a-card"><h3>🔗 ${L("आपकी दुकान का लिंक","Your shop link")}</h3>
        <p class="shop-link"><a href="${esc(shopLink)}" target="_blank" rel="noopener">${esc(shopLink)}</a></p>
        <div class="row2"><button class="btn btn-ghost" type="button" id="cpLink">📋 ${L("लिंक कॉपी","Copy link")}</button><button class="btn btn-primary" type="button" id="qrPoster">🖨️ ${L("QR पोस्टर डाउनलोड","Download QR poster")}</button></div>
        <p class="hint">${L("A4 पोस्टर — प्रिंट करके दुकान पर लगाएँ। ग्राहक QR स्कैन करके सीधे आपकी दुकान खोलेंगे।","A4 poster — print it and put it up in the shop. Customers scan the QR to open your shop.")}</p></div>
      <div class="a-card loc-card" id="locCard"></div>
      <div class="a-card type-card"><h3>${L("दुकान का प्रकार","Shop type")}</h3>
        <div class="type-now"><span class="tn-ic" aria-hidden="true">${AK.TYPES[shopType()].icon}</span><span><b>${esc(L(AK.TYPES[shopType()].hi, AK.TYPES[shopType()].en))}</b><small>${shopFam() === "kirana" ? L("ऑर्डर वाला सिस्टम · सामान","Order system · items") : shopFam() === "food" ? L("ऑर्डर वाला सिस्टम · मेन्यू","Order system · menu") : shopType() === "salon" ? L("बुकिंग वाला सिस्टम · सेवाएँ","Booking system · services") : L("अभी ऑर्डर वाला सिस्टम · सेवाएँ","Order system for now · services")}</small></span>
        <button class="btn btn-ghost" type="button" id="typeChange">${L("बदलें","Change")}</button></div></div>
      <form class="form" id="sf">
      <div class="a-card" id="shopInfo"><h3>🏪 ${L("दुकान की जानकारी","Shop details")}</h3><p class="hint">${L("यह ग्राहकों को आपकी दुकान के पेज पर दिखेगा।","Customers see this on your shop page.")}</p>
        <div class="si-photo"><div class="si-av" id="oprev">${si.owner_photo_id ? `<img src="/api/img/${esc(si.owner_photo_id)}" alt="">` : "👤"}</div><div><label class="btn btn-ghost">📷 ${L("अपनी फ़ोटो","Your photo")}<input type="file" accept="image/*" id="oph" hidden></label> <button class="btn btn-ghost" type="button" id="ono" ${si.owner_photo_id?"":"hidden"}>${L("हटाएँ","Remove")}</button></div></div>
        <input type="hidden" name="owner_photo_id" id="ownerPhotoId" value="${esc(si.owner_photo_id || "")}">
        <label for="s_owner_name">${L("आपका नाम","Your name")}</label><input id="s_owner_name" name="owner_name" value="${esc(me && me.owner_name || "")}" maxlength="60" required>
        <label>${L("मोबाइल (रजिस्ट्रेशन वाला)","Mobile (from registration)")}</label><p class="si-mob">📞 ${esc(si.mobile || "—")}</p>
        <label for="s_address">${L("दुकान का पता","Shop address")} <small>${L("(200 अक्षर तक)","(up to 200 letters)")}</small></label><textarea id="s_address" name="address" maxlength="200" rows="2" placeholder="${L("जैसे: मेन रोड, बस स्टैंड के पास, इंदौर","e.g. Main Road, near bus stand, Indore")}">${esc(si.address || s.address || "")}</textarea></div>
      <div class="a-card"><h3>🏪 ${L("दुकान","Shop")}</h3>
        ${(() => { const hiSame = !!s.store_name_hi && s.store_name_hi === s.store_name_en && !/[\u0900-\u097F]/.test(s.store_name_hi); // v10.15.1: don't pre-fill the Hindi box with the English name
          return inp("store_name_hi", L("दुकान का नाम (हिंदी)","Shop name (Hindi)"), hiSame ? "" : s.store_name_hi, `maxlength="200" lang="hi" placeholder="${esc(L("जैसे: सुमित किराना स्टोर","e.g. सुमित किराना स्टोर"))}"`) + `<p class="hint" style="margin-top:-4px">${L("हिंदी चुनने वाले ग्राहकों को यह नाम दिखेगा। खाली छोड़ें तो English नाम दिखेगा।","Customers who pick हिंदी see this name. Leave it empty to use the English name.")}</p>`; })()}${inp("store_name_en", L("दुकान का नाम (English)","Shop name (English)"), s.store_name_en)}
        ${inp("tagline_hi", L("टैगलाइन (हिंदी)","Tagline (Hindi)"), s.tagline_hi)}${inp("tagline_en", "Tagline (English)", s.tagline_en)}
        ${inp("phone", L("दुकान का फ़ोन (10 अंक)","Shop phone (10 digits)"), s.phone, 'inputmode="tel" placeholder="98XXXXXXXX"')}
        ${inp("whatsapp", L("WhatsApp नंबर (ऑर्डर इस पर आएँगे)","WhatsApp number (orders are sent here)"), s.whatsapp, 'inputmode="tel" placeholder="98XXXXXXXX"')}
        ${inp("announcement_hi", L("सूचना पट्टी (हिंदी) — जैसे आज का ऑफ़र","Notice bar (Hindi) — e.g. today's offer"), s.announcement_hi)}${inp("announcement_en", L("सूचना पट्टी (English)","Notice bar (English)"), s.announcement_en)}
        <label>${L("दुकान का लोगो","Shop logo")} <small>${L("(ज़रूरी नहीं)","(optional)")}</small></label>
        <div class="row2" style="align-items:center"><div class="photo-prev logo-prev" id="lprev">${s.logo_image_id ? `<img src="/api/img/${esc(s.logo_image_id)}" alt="">` : "🏪"}</div><div><label class="btn btn-ghost">📷 ${L("लोगो चुनें","Choose logo")}<input type="file" accept="image/*" id="lph" hidden></label> <button class="btn btn-ghost" type="button" id="lno" ${s.logo_image_id?"":"hidden"}>${L("हटाएँ","Remove")}</button></div></div>
        <input type="hidden" name="logo_image_id" id="logoId" value="${esc(s.logo_image_id || "")}"></div>
      <div class="a-card"><h3>🕗 ${L("समय","Hours")}</h3><div class="row2">${inp("open_time", L("खुलने का समय","Opens"), s.open_time, 'type="time"')}${inp("close_time", L("बंद होने का समय","Closes"), s.close_time, 'type="time"')}</div>
        <label class="switch">${L("आज दुकान बंद है (ऑर्डर बंद)","Shop closed today (stop orders)")}<input type="checkbox" name="force_closed" ${s.force_closed?"checked":""}></label></div>
      <div class="a-card"><h3>🛵 ${L("डिलीवरी","Delivery")}</h3>
        ${inp("delivery_pincodes", L("किन पिन कोड पर डिलीवरी (कॉमा से अलग, ख़ाली = सब)","Delivery PIN codes (comma separated, empty = any)"), s.delivery_pincodes, 'inputmode="numeric" placeholder="452001, 452002"')}
        ${inp("delivery_localities", L("या मोहल्ले/इलाके (कॉमा से अलग)","Or localities (comma separated)"), s.delivery_localities)}
        <div class="row2">${inp("delivery_charge", L("डिलीवरी चार्ज ₹","Delivery charge ₹"), r(s.delivery_charge_paise), 'inputmode="decimal" placeholder="0"')}${inp("free_delivery_above", L("इतने से ऊपर फ्री ₹","Free above ₹"), r(s.free_delivery_above_paise), 'inputmode="decimal" placeholder="—"')}</div>
        ${inp("min_order", L("कम से कम ऑर्डर ₹","Minimum order ₹"), r(s.min_order_paise), 'inputmode="decimal" placeholder="—"')}
        <div class="row2">${inp("delivery_time_hi", L("डिलीवरी समय (हिंदी)","Delivery time (Hindi)"), s.delivery_time_hi, 'placeholder="30–45 मिनट"')}${inp("delivery_time_en", L("डिलीवरी समय (English)","Delivery time (English)"), s.delivery_time_en, 'placeholder="30–45 min"')}</div></div>
      <div class="a-card"><h3>💵 ${L("भुगतान","Payment")}</h3>
        <label class="switch">Cash on Delivery<input type="checkbox" name="pay_cod" ${s.pay_cod?"checked":""}></label>
        <label class="switch">${L("डिलीवरी पर UPI","UPI on delivery")}<input type="checkbox" name="pay_upi_on_delivery" ${s.pay_upi_on_delivery?"checked":""}></label>
        ${inp("upi_id", "UPI ID", s.upi_id, 'placeholder="name@bank"')}</div>
      <div class="a-card"><h3>⭐ ${L("रेटिंग","Ratings")}</h3><label class="switch">${L("ग्राहकों की रेटिंग होमपेज पर दिखाएँ","Show customer ratings on the homepage")}<input type="checkbox" name="show_reviews" ${s.show_reviews?"checked":""}></label><p class="hint">${L("बंद हो तो रेटिंग सिर्फ़ आपको (रिपोर्ट में) दिखती हैं।","When off, ratings are visible only to you (in Reports).")}</p></div>
      <p class="err" id="serr" role="alert"></p><button class="btn btn-primary btn-block">💾 ${L("सेटिंग सेव करें","Save settings")}</button></form>
      <div id="alertsFull" style="margin-top:14px"></div>
      <div class="a-card"><h3>💾 ${L("पूरा बैकअप","Full backup")}</h3><p class="hint">${L("सारा सामान, ऑर्डर, ऑफर, रेटिंग और हिस्ट्री एक फ़ाइल में। हफ़्ते में एक बार डाउनलोड करके सँभाल लें। पासवर्ड इसमें नहीं होते।","All items, orders, offers, ratings and history in one file. Download it once a week and keep it safe. Passwords are not included.")}</p><a class="btn btn-ghost btn-block" href="/api/admin/backup" download>⬇️ ${L("पूरा बैकअप डाउनलोड करें","Download full backup")}</a></div>
      <div style="height:14px"></div>${passwordView(false)}
      <div class="a-card"><button class="btn btn-ghost btn-block" type="button" id="logout">🚪 ${L("लॉगआउट","Log out")}</button></div>`;
    bindPw(); renderAlerts($("#alertsFull"), false);
    $("#cpLink").onclick = () => copyText(shopLink);
    $("#qrPoster").onclick = ev => downloadPoster(ev.currentTarget);
    drawLocCard();
    const lprev = id => $("#lprev").innerHTML = id ? `<img src="/api/img/${esc(id)}" alt="">` : "🏪";
    $("#lph").onchange = async e => { const file = e.target.files[0]; if (!file) return; $("#lprev").textContent = "⏳";
      try { const data_url = await shrink(file); const r = await api("/api/admin/image", {method:"POST", body:{data_url}}); $("#logoId").value = r.image_id; $("#lno").hidden = false; lprev(r.image_id); toast(L("लोगो लगा — अब “सेटिंग सेव करें” दबाएँ","Logo ready — now tap Save settings")); } catch (x) { toast(x.message); lprev($("#logoId").value); } };
    $("#lno").onclick = () => { $("#logoId").value = ""; $("#lno").hidden = true; lprev(""); };
    // v10.8.1: owner photo — squared to 256px and squeezed under 30 KB in the phone, then saved with "Save settings"
    const oprev = id => $("#oprev").innerHTML = id ? `<img src="/api/img/${esc(id)}" alt="">` : "👤";
    $("#oph").onchange = async e => { const file = e.target.files[0]; if (!file) return; $("#oprev").textContent = "⏳";
      try { const data_url = await shrinkAvatar(file); const r = await api("/api/admin/image", {method:"POST", body:{data_url}}); $("#ownerPhotoId").value = r.image_id; $("#ono").hidden = false; oprev(r.image_id); toast(L("फ़ोटो लगी — अब “सेटिंग सेव करें” दबाएँ","Photo ready — now tap Save settings")); } catch (x) { toast(x.message); oprev($("#ownerPhotoId").value); } };
    $("#ono").onclick = () => { $("#ownerPhotoId").value = ""; $("#ono").hidden = true; oprev(""); };
    $("#sf").onsubmit = async e => { e.preventDefault(); const f = e.target; const b = {};
      for (const el of f.elements) { if (!el.name) continue; b[el.name] = el.type === "checkbox" ? el.checked : el.value.trim(); }
      try { await api("/api/admin/settings", {method:"PUT", body:b}); toast(L("सेव हो गया ✅","Saved ✅")); settingsView(); } catch (x) { if (!authFail(x)) $("#serr").textContent = x.message; } };
    $("#logout").onclick = async () => { me = null; await api("/api/admin/logout", {method:"POST", body:{}}).catch(()=>{}); clearInterval(pollT); $("#tabs").hidden = true; loginView(); };
  }

  // ---------- v4: reports ----------
  document.addEventListener("click", e => {
    const g = e.target.closest("[data-goto]"); if (g) { closeSheet(); go(g.dataset.goto); return; }
    const h = e.target.closest("[data-hist]"); if (h) { closeSheet(); historyView(Number(h.dataset.hist)); }
  });
  let rRange = "7d", rFrom = "", rTo = "";
  const pmName = m => m === "cod" ? L("कैश","Cash") : m === "upi_on_delivery" ? "UPI" : m;
  async function reportsView(){
    go.cur = "reports";
    const qs = () => `range=${rRange}${rRange === "custom" ? `&from=${rFrom}&to=${rTo}` : ""}`;
    app.innerHTML = `<div class="toolbar-a"><h2 style="margin:0;flex:1">📊 ${L("रिपोर्ट","Reports")}</h2></div>
      <div class="seg" id="rseg">${[["today",L("आज","Today")],["7d",L("7 दिन","7 days")],["30d",L("30 दिन","30 days")],["custom",L("तारीख़ चुनें","Custom")]].map(([k,n])=>`<button type="button" data-r="${k}" aria-pressed="${rRange===k}">${n}</button>`).join("")}</div>
      <form class="row2 rcustom" id="rcf" ${rRange==="custom"?"":"hidden"}><div><label for="rf">${L("से","From")}</label><input type="date" id="rf" value="${esc(rFrom)}"></div><div><label for="rt">${L("तक","To")}</label><input type="date" id="rt" value="${esc(rTo)}"></div><button class="btn btn-primary" style="grid-column:1/-1">${L("दिखाएँ","Show")}</button></form>
      <div id="rbody"><div class="skel-block"></div><div class="skel-block"></div></div>`;
    $("#rseg").onclick = e => { const b = e.target.closest("[data-r]"); if (!b) return; rRange = b.dataset.r;
      if (rRange === "custom" && !rFrom) { const d = new Date(Date.now() + 330*60000); rTo = d.toISOString().slice(0,10); d.setUTCDate(d.getUTCDate() - 13); rFrom = d.toISOString().slice(0,10); }
      reportsView(); };
    $("#rcf").onsubmit = e => { e.preventDefault(); rFrom = $("#rf").value; rTo = $("#rt").value; reportsView(); };
    let r, rt;
    try { [r, rt] = await Promise.all([api("/api/admin/reports?" + qs()), api("/api/admin/ratings")]); }
    catch (x) { if (!authFail(x) && $("#rbody")) $("#rbody").innerHTML = `<p class="err">${esc(x.message)}</p>`; return; }
    if (!$("#rbody")) return; // v10.15.1: moved to another screen while the report loaded
    const dv = r.delivered; const maxV = Math.max(1, ...r.days.map(d => d.value));
    const dd = s => new Date(s + "T00:00:00Z").toLocaleDateString(AK.lang==="en"?"en-IN":"hi-IN", {day:"numeric", month:"short", timeZone:"UTC"});
    const showDays = r.days.length > 31 ? r.days.slice(-31) : r.days;
    const bars = showDays.map(d => `<div class="bar" title="${esc(dd(d.day))}: ${money(d.value)} · ${d.n}"><i style="height:${Math.max(d.value ? 4 : 0, Math.round(d.value / maxV * 100))}%"></i><small>${showDays.length <= 8 || Number(d.day.slice(8)) % 5 === 1 ? esc(dd(d.day).split(" ")[0]) : ""}</small></div>`).join("");
    const payTot = r.payment.reduce((a, p) => a + p.value, 0) || 1;
    const stars = n => "★".repeat(n) + "☆".repeat(5 - n);
    // v10.15.1: a salon is a booking app — its report counts bookings, completed services, visits and top services (no cash/UPI, stock or "delivered value").
    if (shopType() === "salon") {
      const maxN = Math.max(1, ...showDays.map(d => d.n));
      const sbars = showDays.map(d => `<div class="bar" title="${esc(dd(d.day))}: ${d.n}"><i style="height:${Math.max(d.n ? 4 : 0, Math.round(d.n / maxN * 100))}%"></i><small>${showDays.length <= 8 || Number(d.day.slice(8)) % 5 === 1 ? esc(dd(d.day).split(" ")[0]) : ""}</small></div>`).join("");
      const nm = b => AK.lang === "en" ? (b.name_en || b.name) : (b.name || b.name_en);
      $("#rbody").innerHTML = `
      <div class="stats sr-stats"><div class="stat"><b>${r.bookings || 0}</b><small>${L("बुकिंग","Bookings")}</small></div><div class="stat"><b>${dv.orders}</b><small>${L("पूरी हुईं","Completed")}</small></div><div class="stat"><b>${r.visits || 0}</b><small>${L("विज़िट","Visits")}</small></div></div>
      <div class="stats sr-stats"><div class="stat"><b>${r.open || 0}</b><small>${L("चालू","Open")}</small></div><div class="stat"><b>${r.cancelled + r.rejected}</b><small>${L("रद्द","Cancelled")}</small></div><div class="stat"><b>${r.svc_value_paise ? money(r.svc_value_paise) : "—"}</b><small>${L("आपके रेट से","At your prices")}</small></div></div>
      <div class="a-card"><h3>📅 ${L("हर दिन पूरी हुई बुकिंग","Completed bookings per day")}</h3>${r.days.length > 31 ? `<p class="hint">${L("आख़िरी 31 दिन दिखाए गए हैं; CSV में सब है।","Showing the last 31 days; the CSV has all.")}</p>` : ""}
        <div class="bars" role="img" aria-label="${L("दिन के हिसाब से बुकिंग का चार्ट","Daily completed bookings chart")}">${sbars}</div></div>
      <div class="a-card"><h3>✂️ ${L("सबसे ज़्यादा ली गई सेवाएँ","Top services")}</h3>${r.best_sellers.length ? `<ol class="bs-list">${r.best_sellers.map(b => `<li>${icI(b)} ${esc(nm(b))} <b>× ${b.qty}</b></li>`).join("")}</ol>` : `<p class="hint">${L("अभी कोई डेटा नहीं — पूरी हुई बुकिंग से बनता है।","No data yet — built from completed bookings.")}</p>`}</div>
      <p class="hint">${L("“आपके रेट से” = पूरी हुई सेवाओं की आपकी लिखी कीमत का जोड़ (पैसे दुकान पर ही लिए जाते हैं)। विज़िट = आपका बुकिंग पेज कितनी बार खुला।","“At your prices” = completed services at the prices you set (payment happens at the shop). Visits = how often your booking page was opened.")}${r.test_orders_excluded ? ` ${r.test_orders_excluded} ${L("टेस्ट बुकिंग नहीं गिनी","test bookings not counted")}.` : ""}</p>
      <a class="btn btn-ghost btn-block" href="/api/admin/reports.csv?${qs()}" download>⬇️ ${L("रिपोर्ट CSV डाउनलोड","Download report CSV")}</a>`;
      return;
    }
    $("#rbody").innerHTML = `
      <div class="a-card rv"><p class="rv-label">${L("डिलीवर हुए ऑर्डर की कुल रक़म","Value of delivered orders")} <span class="tag">${L("ऑर्डर वैल्यू — मुनाफ़ा नहीं","order value, not profit")}</span></p>
        <p class="rv-big">${money(dv.value_paise)}</p>
        <p class="hint">${dv.orders} ${L("ऑर्डर डिलीवर","orders delivered")} · ${L("औसत ऑर्डर","avg order")} ${money(dv.avg_order_paise)}${dv.discount_paise ? ` · ${L("छूट दी","discounts")} ${money(dv.discount_paise)}` : ""}${r.test_orders_excluded ? ` · ${r.test_orders_excluded} ${L("टेस्ट ऑर्डर नहीं गिने","test orders not counted")}` : ""}</p></div>
      <div class="stats"><div class="stat"><b>${dv.orders}</b><small>${L("डिलीवर","Delivered")}</small></div><div class="stat"><b>${r.cancelled}</b><small>${L("रद्द","Cancelled")}</small></div><div class="stat"><b>${r.rejected}</b><small>${L("अस्वीकार","Rejected")}</small></div></div>
      <div class="a-card"><h3>📈 ${L("हर दिन की डिलीवर्ड वैल्यू","Delivered value per day")}</h3>${r.days.length > 31 ? `<p class="hint">${L("आख़िरी 31 दिन दिखाए गए हैं; CSV में सब है।","Showing the last 31 days; the CSV has all.")}</p>` : ""}
        <div class="bars" role="img" aria-label="${L("दिन के हिसाब से बिक्री का चार्ट","Daily delivered value chart")}">${bars}</div></div>
      <div class="a-card"><h3>💵 ${L("कैश या UPI","Cash vs UPI")}</h3>${r.payment.length ? r.payment.map(p => `<div class="pay-row"><span>${pmName(p.method)} · ${p.n}</span><span class="pbar"><i style="width:${Math.round(p.value/payTot*100)}%"></i></span><b>${money(p.value)}</b></div>`).join("") : `<p class="hint">${L("इस समय में कोई डिलीवर्ड ऑर्डर नहीं।","No delivered orders in this period.")}</p>`}</div>
      <div class="a-card"><h3>🔥 ${L("सबसे ज़्यादा बिकने वाले","Best sellers")}</h3>${r.best_sellers.length ? `<ol class="bs-list">${r.best_sellers.map(b => `<li>${icI(b)} ${esc(AK.lang === "en" ? (b.name_en || b.name) : b.name)} <b>× ${b.qty}</b> <small>${money(b.value)}</small></li>`).join("")}</ol>` : `<p class="hint">${L("अभी कोई डेटा नहीं — डिलीवर हुए ऑर्डर से बनता है।","No data yet — built from delivered orders.")}</p>`}</div>
      <div class="a-card"><h3>🐢 ${L("कम बिकने वाले सामान","Slow-moving items")}</h3><p class="hint">${L("इस समय में सबसे कम बिके (स्टॉक अभी कितना है)","Sold least in this period (with stock in hand)")}</p><ol class="bs-list">${r.slow_moving.map(b => `<li>${icI(b)} ${esc(AK.lang === "en" ? (b.name_en || b.name) : b.name)} <b>× ${b.qty}</b> <small>${L("स्टॉक","stock")} ${b.stock}</small></li>`).join("")}</ol></div>
      <a class="btn btn-ghost btn-block" href="/api/admin/reports.csv?${qs()}" download>⬇️ ${L("रिपोर्ट CSV डाउनलोड","Download report CSV")}</a>
      <div class="a-card" style="margin-top:14px"><h3>⭐ ${L("ग्राहकों की रेटिंग","Customer ratings")} ${rt.avg ? `· ${rt.avg}/5 (${rt.count})` : ""}</h3>
        <p class="hint">${rt.show_reviews ? L("होमपेज पर दिख रही हैं (सेटिंग में बंद कर सकते हैं)।","Shown on the homepage (turn off in Settings).") : L("सिर्फ़ आपको दिखती हैं। होमपेज पर दिखाने के लिए सेटिंग → रेटिंग।","Only you can see these. To show on the homepage: Settings → Ratings.")}</p>
        ${rt.ratings.length ? rt.ratings.map(x => `<div class="rt-row"><span class="stars" aria-label="${x.stars}/5">${stars(x.stars)}</span> <b>${esc(x.code)}</b> · ${esc(x.customer_name)}${x.is_test ? ` <span class="tag">TEST</span>` : ""}<small>${when(x.created_at)}</small>${x.comment ? `<p>“${esc(x.comment)}”</p>` : ""}</div>`).join("") : `<p class="hint">${L("अभी कोई रेटिंग नहीं। डिलीवरी के बाद ग्राहक रेटिंग दे सकते हैं।","No ratings yet. Customers can rate after delivery.")}</p>`}</div>`;
  }
  // ---------- v4: stock / price / status history (audit log) ----------
  const FIELD = {stock:["स्टॉक","Stock"], price:["रेट","Price"], mrp:["MRP","MRP"], status:["स्टेटस","Status"], deleted:["साइज़ हटाया","Size removed"]};
  function actorName(a){ if (a === "customer") return L("ग्राहक","Customer"); if (a === "system") return L("सिस्टम","System"); return a.replace(/^admin:/, "👤 "); }
  async function historyView(pid, field){
    field = field || ""; tab = "products";
    app.innerHTML = `<div class="toolbar-a"><button class="btn btn-ghost" type="button" data-goto="products">← ${L("सामान","Items")}</button><h2 style="margin:0;flex:1;font-size:1.05rem">📜 ${L("हिस्ट्री","History")}</h2></div>
      <div class="seg" id="hseg">${[["",L("सब","All")],["stock",L("स्टॉक","Stock")],["price",L("रेट","Price")],["status",L("ऑर्डर स्टेटस","Order status")]].map(([k,n])=>`<button type="button" data-h="${k}" aria-pressed="${field===k}">${n}</button>`).join("")}</div>
      <div id="hlist"><div class="skel-block"></div></div>`;
    $("#hseg").onclick = e => { const b = e.target.closest("[data-h]"); if (b) historyView(pid, b.dataset.h); };
    let r; try { r = await api(`/api/admin/audit?${pid ? "product_id=" + pid + "&" : ""}field=${field}`); } catch (x) { if (!authFail(x)) $("#hlist").innerHTML = `<p class="err">${esc(x.message)}</p>`; return; }
    const val = (f, v) => v == null ? "—" : (f === "price" || f === "mrp") ? money(Number(v)) : f === "status" ? esc(stName(v) || v) : esc(v);
    const title = pid && r.entries[0] ? `<p class="hint">${esc(r.entries[0].icon || "")} <b>${esc(r.entries[0].name_hi || "")}</b> — ${L("इस सामान के बदलाव","changes to this item")}</p>` : "";
    $("#hlist").innerHTML = title + (r.entries.length ? r.entries.map(x => {
      const f = x.field; const what = x.entity === "order" ? `📦 ${esc(x.label)}` : `${esc(x.icon || "")} ${esc(x.name_hi || L("(हटाया गया सामान)","(removed item)"))} <small>${esc(x.label)}</small>`;
      const change = f === "deleted" ? `${L("स्टॉक था","stock was")} ${esc(x.before)}` : x.before == null ? `${L("नया","new")}: ${val(f, x.after)}` : `${val(f, x.before)} → <b>${val(f, x.after)}</b>`;
      const delta = f === "stock" && x.before != null ? Number(x.after) - Number(x.before) : null;
      return `<div class="h-row f-${f}"><div class="h-top"><span>${what}</span><small>${when(x.at)}</small></div>
        <div class="h-mid"><span class="tag">${esc(L(...(FIELD[f] || [f, f])))}</span> ${change}${delta ? ` <span class="${delta > 0 ? "up" : "down"}">(${delta > 0 ? "+" : ""}${delta})</span>` : ""}</div>
        <small class="h-who">${actorName(x.actor)}${x.reason ? ` · ${esc(x.reason)}` : ""}</small></div>`; }).join("") : `<p class="empty">${L("अभी कोई बदलाव दर्ज नहीं।","No changes recorded yet.")}</p>`)
      + `<p class="hint">${L(`हर स्टॉक, रेट और ऑर्डर स्टेटस का बदलाव अपने आप दर्ज होता है। आख़िरी ${r.keep.rows.toLocaleString("en-IN")} बदलाव (ज़्यादा से ज़्यादा ${r.keep.days} दिन) रखे जाते हैं; पूरा बैकअप सेटिंग में।`, `Every stock, price and order-status change is recorded automatically. The latest ${r.keep.rows.toLocaleString("en-IN")} changes (up to ${r.keep.days} days) are kept; full backup is in Settings.`)}</p>`;
  }

  // ---------- sheet ----------
  function openSheet(title){ $("#sheetTitle").textContent = title; $("#sheet").hidden = false; $("#sheetBack").hidden = false; document.body.classList.add("noscroll"); }
  function closeSheet(){ notiOpen = false; $("#sheet").classList.remove("noti-sheet"); $("#sheet").hidden = true; $("#sheetBack").hidden = true; document.body.classList.remove("noscroll"); }
  $("#sheetClose").onclick = closeSheet; $("#sheetBack").onclick = closeSheet;
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });
  $("#langBtn").onclick = () => { AK.setLang(AK.lang === "en" ? "hi" : "en"); applyT(); AK.paintLang(); if (me && !$("#tabs").hidden) go(tab); else start(); };
  const _start = start; start = async function(){ await _start(); if (me && !me.must_change) startPolling(); if (me) refreshBill(); }; // v10.10.1: bill check only once logged in (it was a 401 on every logged-out load)
  start();

  // ---------- v8: subscription recharge (free UPI: QR + deep link + UTR; the developer verifies) ----------
  let inRecharge = false, rechargeByChoice = false, subBill = null;
  const isExpired = svc => !!(svc && svc.paused_reason === "expired");
  async function refreshBill(){ try { const r = await api("/api/admin/subscription"); subBill = r.invoice; if (svcNow) renderSvc(svcNow); } catch {} }
  window.addEventListener("hashchange", () => { if (me && location.hash === "#recharge") { rechargeByChoice = true; rechargeView(); } });
  const upiLink = (pt, inv) => `upi://pay?pa=${pt.upi_id}&pn=${encodeURIComponent(pt.upi_name || "Apna Dhanda")}&am=${(inv.amount_paise/100).toFixed(2)}&cu=INR&tn=${encodeURIComponent(inv.number)}`;
  function drawQR(canvas, text){
    const q = AKQR.encode(text), n = q.size, quiet = 4, px = Math.floor(260 / (n + quiet*2)), sz = px * (n + quiet*2);
    canvas.width = sz; canvas.height = sz; const x = canvas.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, sz, sz); x.fillStyle = "#111";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.modules[r][c]) x.fillRect((c + quiet)*px, (r + quiet)*px, px, px);
  }
  const shrinkShot = file => new Promise((ok, no) => { const img = new Image(); img.onload = () => { const k = Math.min(1, 1100 / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = Math.round(img.width*k); c.height = Math.round(img.height*k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src); ok(c.toDataURL("image/jpeg", 0.72)); }; img.onerror = () => no(new Error(L("फ़ोटो नहीं खुली","Could not read the image"))); img.src = URL.createObjectURL(file); });
  async function rechargeView(){
    inRecharge = true; $("#tabs").hidden = true; const sb = $("#shopBar"); if (sb) sb.hidden = true; const el = $("#svcBanner"); if (el) el.hidden = true;
    if (location.hash === "#recharge") history.replaceState(null, "", "/admin");
    app.innerHTML = `<p class="loading">…</p>`;
    let r; try { r = await api("/api/admin/subscription"); } catch (e) { app.innerHTML = `<div class="a-card"><p class="err">${esc(e.message)}</p></div>`; return; }
    if (!r.invoice) { try { r = await api("/api/admin/subscription/invoice", {method:"POST", body:{}}); } catch (e) { r.err = e.message; } }
    subBill = r.invoice; await loadS2("/qr.js");
    const sub = r.sub, inv = r.invoice, pt = r.pay_to || {}, expired = isExpired(r);
    const day = t => t ? new Date(t).toLocaleDateString(AK.lang === "en" ? "en-IN" : "hi-IN", {timeZone:"Asia/Kolkata", day:"numeric", month:"short", year:"numeric"}) : "—";
    const lastRej = (r.payments || []).find(p => p.status === "rejected");
    const pending = inv && inv.status === "pending_verify";
    app.innerHTML = `<div class="a-card recharge">
      <h2>💳 ${L("सब्सक्रिप्शन रिचार्ज करें","Recharge subscription")}</h2>
      ${expired ? `<p class="rc-alert">⛔ ${L("आपका सब्सक्रिप्शन खत्म हो गया है — दुकान अभी बंद है। पेमेंट के बाद दुकान अपने आप फिर चालू हो जाएगी। आपका सारा डेटा सुरक्षित है।","Your subscription has ended — the shop is closed. It reopens by itself after payment. All your data is safe.")}</p>`
        : `<p class="muted">${sub.state === "TRIAL" ? L(`फ्री ट्रायल ${day(sub.trial_end)} तक`, `Free trial till ${day(sub.trial_end)}`) : sub.ends_at ? L(`अभी ${day(sub.ends_at)} तक चालू`, `Active till ${day(sub.ends_at)}`) : ""}</p>`}
      ${r.err ? `<p class="err">${esc(r.err)}</p>` : ""}
      ${inv ? `<div class="rc-amt"><small>${L("राशि","Amount")}</small><b>${money(inv.amount_paise)}</b><small>${inv.months} ${L("महीना","month(s)")} · ${L("बिल","Bill")} ${esc(inv.number)}</small></div>` : ""}
      ${pending ? `<p class="rc-ok">✅ ${L("आपका पेमेंट (UTR) भेज दिया गया है — जाँच हो रही है।","Your payment (UTR) was sent — it is being verified.")}${sub.provisional_until ? " " + L(`तब तक दुकान ${day(sub.provisional_until)} तक चालू है।`, `Your shop is open till ${day(sub.provisional_until)} meanwhile.`) : ""}</p>`
        : inv && pt.upi_id ? `
        ${lastRej ? `<p class="rc-alert">❌ ${L("पिछला पेमेंट नहीं मिला","Last payment was not found")}: ${esc(lastRej.reason)} (UTR ${esc(lastRej.utr)})</p>` : ""}
        <ol class="rc-steps"><li>${L("QR स्कैन करें या नीचे बटन दबाएँ","Scan the QR or tap the button")}</li><li>${L("पेमेंट के बाद 12 अंकों का UTR / Transaction ID डालें","After paying, enter the 12-digit UTR / Transaction ID")}</li></ol>
        <div class="rc-qr"><canvas id="upiQR" aria-label="UPI QR"></canvas><small>${esc(pt.upi_name || "")} · ${esc(pt.upi_id)}</small></div>
        <a class="btn btn-primary btn-block" id="upiBtn" href="${esc(upiLink(pt, inv))}">📲 ${L("UPI ऐप से पे करें","Pay with a UPI app")}</a>
        <form id="utrF" class="rc-form">
          <label for="utr">UTR / Transaction ID (12 ${L("अंक","digits")})</label>
          <input id="utr" inputmode="numeric" autocomplete="off" maxlength="16" placeholder="123456789012" required>
          <label for="shot">${L("पेमेंट का स्क्रीनशॉट (ज़रूरी नहीं)","Payment screenshot (optional)")}</label>
          <input id="shot" type="file" accept="image/*">
          <p class="err" id="utrErr" role="alert"></p>
          <button class="btn btn-primary btn-block" id="utrBtn">✅ ${L("जमा करें","Submit")}</button>
        </form>` : inv ? `<p class="err">${L("डेवलपर ने अभी पेमेंट का UPI सेट नहीं किया है — कृपया उनसे संपर्क करें।","The developer hasn't set up UPI payment yet — please contact them.")}</p>` : ""}
      ${(r.invoices || []).length ? `<details class="rc-hist"><summary>${L("पुराने बिल","Past bills")}</summary>${r.invoices.map(i => `<p>${esc(i.number)} · ${money(i.amount_paise)} · ${esc(i.status === "paid" ? L("भुगतान हुआ","paid") : i.status === "pending_verify" ? L("जाँच में","verifying") : L("बाकी","unpaid"))}</p>`).join("")}</details>` : ""}
      <div class="rc-foot">${expired ? "" : `<button class="btn btn-ghost" id="rcBack">← ${L("वापस","Back")}</button>`}<button class="btn btn-ghost" id="rcOut">${L("लॉग आउट","Log out")}</button></div></div>`;
    const qc = $("#upiQR"); if (qc && inv) try { drawQR(qc, upiLink(pt, inv)); } catch (e) { qc.replaceWith(Object.assign(document.createElement("p"), {className: "err", textContent: e.message})); }
    const back = $("#rcBack"); if (back) back.onclick = () => { inRecharge = false; rechargeByChoice = false; location.replace("/admin"); };
    $("#rcOut").onclick = async () => { try { await api("/api/admin/logout", {method:"POST", body:{}}); } catch {} location.replace("/admin"); };
    const f = $("#utrF"); if (f) f.onsubmit = async e => { e.preventDefault(); const btn = $("#utrBtn"); $("#utrErr").textContent = "";
      const utr = $("#utr").value.replace(/[\s-]/g, ""); if (!/^\d{12}$/.test(utr)) { $("#utrErr").textContent = L("UTR 12 अंकों का होना चाहिए","UTR must be 12 digits"); return; }
      btn.disabled = true;
      try { const file = $("#shot").files[0]; const screenshot = file ? await shrinkShot(file) : undefined;
        const x = await api("/api/admin/subscription/pay", {method:"POST", body:{invoice_id: inv.id, utr, screenshot}});
        toast(x.provisional ? L("✅ जमा हो गया — दुकान फिर चालू!","✅ Submitted — your shop is open again!") : L("✅ जमा हो गया — जाँच के बाद दुकान चालू होगी","✅ Submitted — the shop opens after verification"));
        svcNow = {...(svcNow || {}), status: x.status, paused_reason: x.paused_reason, sub: x.sub}; rechargeView();
      } catch (x) { btn.disabled = false; $("#utrErr").textContent = x.message; } };
  }
  const loadS2 = src => new Promise(ok => { if (window.AKQR || document.querySelector(`script[src="${src}"]`)) { if (window.AKQR) return ok(); } const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = ok; document.head.appendChild(s); });

  // ---------- v10.4: 🔔 Notification Center (bills, due reminders, updates, new features, issues, messages from Krish) ----------
  const NT = {bill:["बिल","Bill"], due:["रिचार्ज याद","Due reminder"], update:["अपडेट","Update"], feature:["नया फ़ीचर","New feature"], issue:["समस्या / मेंटेनेंस","Issue / maintenance"], message:["संदेश","Message"], stock:["कम स्टॉक","Low stock"]};
  let NOTI = null, notiT = null, notiOpen = false, notiOpenId = null;
  const ndt = t => new Date(t).toLocaleString(AK.lang === "en" ? "en-IN" : "hi-IN", {timeZone:"Asia/Kolkata", day:"numeric", month:"short", hour:"numeric", minute:"2-digit"});
  const nday = t => new Date(t).toLocaleDateString(AK.lang === "en" ? "en-IN" : "hi-IN", {timeZone:"Asia/Kolkata", day:"numeric", month:"short", year:"numeric"});
  function notifInit(){
    const b = $("#bellBtn"); if (b) { b.hidden = false; b.onclick = () => openNoti(); }
    if (!notiT) notiT = setInterval(loadNoti, 90000);
    loadNoti().then(readNotiHash);
  }
  function readNotiHash(){ const mt = /^#notif=(\d+)$/.exec(location.hash); if (!mt) return; history.replaceState(null, "", "/admin"); openNoti(Number(mt[1])); }
  window.addEventListener("hashchange", () => { if (me && /^#notif=/.test(location.hash)) loadNoti().then(readNotiHash); });
  async function loadNoti(){ if (!me) return; try { NOTI = await api("/api/admin/notifications"); } catch { return; } drawBell(); drawIssue(); if (notiOpen) drawNoti(); }
  function drawBell(){
    const b = $("#bellBtn"), i = $("#bellBadge"); if (!b || !NOTI) return; const n = NOTI.unread || 0;
    i.hidden = !n; i.textContent = n > 99 ? "99+" : String(n); b.classList.toggle("has-new", n > 0);
    b.setAttribute("aria-label", L(`सूचनाएँ — ${n} नई`, `Notifications — ${n} new`));
  }
  function drawIssue(){
    const el = $("#issueBanner"); if (!el) return; const list = (NOTI && NOTI.banner) || [];
    el.hidden = !list.length;
    el.innerHTML = list.map(n => `<button type="button" class="ib-item" data-n="${n.id}"><span class="ib-ic" aria-hidden="true">⚠️</span><span class="ib-tx"><b>${esc(AK.pickMsg(n.title))}</b>
      <small>🛠️ ${L("कब तक ठीक होगा","Expected fix")}: <b>${n.fix_by ? esc(ndt(n.fix_by)) : L("जल्द — हम काम कर रहे हैं","soon — we're on it")}</b></small></span><span class="ib-go" aria-hidden="true">›</span></button>`).join("");
    el.querySelectorAll("[data-n]").forEach(b => b.onclick = () => openNoti(Number(b.dataset.n)));
  }
  function openNoti(id){
    notiOpen = true; notiOpenId = id || null; openSheet("🔔 " + L("सूचनाएँ","Notifications")); $("#sheet").classList.add("noti-sheet"); drawNoti();
    if (id) { markRead([id]); const el = document.querySelector(`.noti[data-id="${id}"]`); if (el) setTimeout(() => el.scrollIntoView({block: "center"}), 60); }
  }
  async function markRead(ids, all){
    if (!NOTI) return; const todo = all ? NOTI.items.filter(n => !n.read) : NOTI.items.filter(n => ids.includes(n.id) && !n.read); if (!todo.length) return;
    todo.forEach(n => { n.read = true; n.read_at = Date.now(); }); NOTI.unread = NOTI.items.filter(n => !n.read).length; drawBell(); if (notiOpen) drawNoti();
    try { const x = await api("/api/admin/notifications/read", {method:"POST", body: all ? {all: true} : {ids: todo.map(n => n.id)}}); NOTI.unread = x.unread; drawBell(); } catch {}
  }
  function billRows(n){
    const m = n.meta || {}; if (!m.amount_paise) return "";
    const row = (k, v) => v ? `<div><span>${k}</span><b>${v}</b></div>` : "";
    return `<div class="noti-bill">${row(L("राशि","Amount"), money(m.amount_paise) + (m.months ? ` · ${m.months} ${L("महीना","month(s)")}` : ""))}
      ${m.period_start ? row(L("अवधि","Period"), `${esc(nday(m.period_start))} – ${esc(nday(m.period_end))}`) : ""}
      ${row(L("आखिरी तारीख","Due date"), m.due_at ? esc(nday(m.due_at)) : "")}${row("UPI", m.upi_id ? esc(m.upi_id) + (m.upi_name ? ` <small>(${esc(m.upi_name)})</small>` : "") : "")}${row(L("बिल नं.","Bill no."), m.number ? esc(m.number) : "")}</div>`;
  }
  function stockNoti(n){ // v10.7: 📦 low-stock alert — what's left now + one-tap +10 / +20
    const m = n.meta || {}; const now = m.now_stock == null ? m.stock : m.now_stock;
    return `<div class="noti-stock"><p class="noti-text">${esc(AK.pickMsg(n.body))}</p><p class="ns-now">${L("अभी","Now")}: <b>${now}</b> ${m.cleared_at ? `· ✅ ${L("स्टॉक भर दिया","restocked")}` : ""}</p>
      <div class="ns-btns">${[10, 20].map(q => `<button type="button" class="btn btn-primary" data-rs="${m.alert_id}:${q}">+${q} ${L("जोड़ें","add")}</button>`).join("")}<button type="button" class="btn btn-ghost" data-sv="${m.variant_id}">📦 ${L("स्टॉक में देखें","Open in Stock")}</button></div></div>`; }
  function drawNoti(){
    const body = $("#sheetBody"); if (!body) return;
    const items = (NOTI && NOTI.items) || [];
    if (!items.length) { body.innerHTML = `<div class="noti-empty"><span aria-hidden="true">🔔</span><b>${L("अभी कोई सूचना नहीं","No notifications yet")}</b><p class="muted">${L("बिल, रिचार्ज की याद, नए फ़ीचर और ज़रूरी संदेश यहाँ आएँगे।","Bills, due reminders, new features and important messages will show up here.")}</p></div>`; return; }
    body.innerHTML = `<div class="noti-tools"><span class="muted">${NOTI.unread ? L(`${NOTI.unread} नई`, `${NOTI.unread} new`) : L("सब पढ़ ली ✓","All read ✓")}</span>${NOTI.unread ? `<button type="button" class="btn btn-ghost sm" id="notiAll">✓ ${L("सब पढ़ ली","Mark all read")}</button>` : ""}</div>
      <div class="noti-list">${items.map(n => {
        const open = n.id === notiOpenId, paid = n.invoice_status === "paid", t = NT[n.type] || [n.type, n.type];
        const pay = n.action === "recharge" && !paid ? `<button type="button" class="btn btn-primary noti-pay" data-pay="${n.id}">💳 ${L("अभी पे करें / UTR डालें","Pay now / Submit UTR")}</button>` : "";
        return `<article class="noti n-${esc(n.type)}${n.read ? "" : " unread"}${n.pinned ? " pinned" : ""}${open ? " open" : ""}" data-id="${n.id}">
          <button type="button" class="noti-head" data-open="${n.id}" aria-expanded="${open}">
            <span class="noti-ic" aria-hidden="true">${n.icon}</span>
            <span class="noti-main"><span class="noti-meta"><em>${esc(L(t[0], t[1]))}</em>${n.pinned ? `<span class="noti-pin">📌 ${L("ज़रूरी","Pinned")}</span>` : ""}<time>${esc(ndt(n.created_at))}</time></span>
              <b class="noti-title">${esc(AK.pickMsg(n.title))}</b></span>${n.read ? "" : `<i class="noti-dot" aria-label="${L("नई","new")}"></i>`}</button>
          <div class="noti-body">
            ${n.type === "issue" ? `<p class="noti-fix ${n.resolved_at ? "ok" : ""}">${n.resolved_at ? `✅ ${L("ठीक हो गया","Fixed")} · ${esc(ndt(n.resolved_at))}` : `🛠️ ${L("कब तक ठीक होगा","Expected fix")}: <b>${n.fix_by ? esc(ndt(n.fix_by)) : L("जल्द","soon")}</b>`}</p>` : ""}
            ${n.type === "stock" ? stockNoti(n) : ""}
            ${n.type === "bill" ? billRows(n) : ""}
            ${n.type === "stock" ? "" : n.type === "bill" && n.meta && n.meta.amount_paise ? `<p class="noti-text">${L("UPI से पे करके 12 अंकों का UTR नंबर डालें — दुकान चालू रहेगी।","Pay by UPI, then submit the 12-digit UTR — your shop stays open.")}</p>` : n.body ? `<p class="noti-text">${esc(AK.pickMsg(n.body))}</p>` : ""}
            ${paid ? `<p class="noti-paid">✅ ${L("भुगतान हो गया","Paid")}</p>` : ""}${pay}
          </div></article>`; }).join("")}</div>`;
    const all = $("#notiAll"); if (all) all.onclick = () => markRead([], true);
    body.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { const id = Number(b.dataset.open); notiOpenId = notiOpenId === id ? null : id; markRead([id]); drawNoti(); });
    body.querySelectorAll("[data-pay]").forEach(b => b.onclick = () => { markRead([Number(b.dataset.pay)]); closeSheet(); rechargeByChoice = true; rechargeView(); });
    body.querySelectorAll("[data-rs]").forEach(b => b.onclick = async () => { const [aid, q] = b.dataset.rs.split(":").map(Number); const it = await restockAlert(aid, q, b); if (it && tab === "stock") stockView(); });
    body.querySelectorAll("[data-sv]").forEach(b => b.onclick = () => { closeSheet(); stkFocus = Number(b.dataset.sv); stkFilter = "all"; go("stock"); });
  }

  // ---------- v10.7: 📦 STOCK tab — ready list, list/Excel/PDF import, stock in, kam-stock limits, one-tap restock ----------
  let STK = null, stkFilter = "all", stkQ = "", stkSel = new Set(), stkFocus = null;
  const V107 = "10.7.0";
  const ikey = () => "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  const nmx = x => AK.lang === "en" && x.name_en ? x.name_en : x.name_hi;
  function loadStockScript(src){ return new Promise((ok, no) => { if (document.querySelector(`script[data-src="${src}"]`)) return ok();
    const s = document.createElement("script"); s.src = src + "?v=" + V107; s.dataset.src = src; s.onload = ok; s.onerror = () => { s.remove(); no(new Error(L("फ़ाइल लोड नहीं हुई — नेट चेक करें","Could not load — check internet"))); }; document.head.appendChild(s); }); }
  // same duplicate rule as the server: name + pack size (1kg = 1 kg = 1 किलो)
  const UNITS = [[/^(kg|kgs|kilo|kilogram|किलो|कि\.?ग्रा\.?)$/,"kg"],[/^(g|gm|gms|gram|grams|gr|ग्राम|ग्रा\.?)$/,"g"],[/^(l|ltr|ltrs|litre|liter|litres|liters|लीटर|ली\.?)$/,"l"],[/^(ml|mls|मिली|मि\.?ली\.?)$/,"ml"],[/^(pc|pcs|piece|pieces|nos|no|पीस|नग)$/,"pc"],[/^(pkt|pack|packet|packets|पैकेट|पैक)$/,"pkt"],[/^(dozen|dz|दर्जन)$/,"dozen"]];
  const nName = s => String(s || "").normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}\p{M}]+/gu, " ").trim();
  const nLabel = s => String(s || "").normalize("NFC").toLowerCase().replace(/[०-९]/g, d => "०१२३४५६७८९".indexOf(d)).replace(/\s+/g, " ").trim()
    .replace(/(\d+(?:\.\d+)?)\s*([^\d\s]+)/g, (m0, n, u) => { const h = UNITS.find(([re]) => re.test(u)); return Number(n) + (h ? h[1] : u); }).replace(/\s+/g, "");
  const ikeyOf = (name, label) => nName(name) + "|" + nLabel(label);
  async function shopKeys(){ const c = await loadCatalog(); const m = new Map();
    for (const p of c.products) for (const v of p.variants) for (const n of [p.name_hi, p.name_en]) if (n) m.set(ikeyOf(n, v.label), {vid: v.id, name: p.name_hi, label: v.label, stock: v.stock, price_paise: v.price_paise});
    return m; }
  async function stockView(){
    app.innerHTML = `<p class="loading">…</p>`;
    try { STK = await api("/api/admin/stock"); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    drawStock();
  }
  function drawStock(){
    const c = STK.counts;
    app.innerHTML = `<div class="stk-head"><h2>📦 ${L("स्टॉक","Stock")}</h2><small>${L(`${c.all} सामान`, `${c.all} items`)}</small></div>
      <div class="stk-acts">${isKirana() ? `<button type="button" class="btn btn-primary" id="stCat">📋 ${L("तैयार लिस्ट से जोड़ें","Add from ready list")}</button>` : `<button type="button" class="btn btn-primary" id="stCat">➕ ${WL("add")}</button>`}
        <button type="button" class="btn btn-blue" id="stImp">📝 ${L("लिस्ट / Excel / PDF से","From list / Excel / PDF")}</button></div>
      <div class="seg" id="stSeg">${[["low", `⚠️ ${L("कम स्टॉक","Low stock")} (${c.low})`], ["out", `🚫 ${L("ख़त्म","Khatam")} (${c.out})`], ["all", `${L("सब","All")} (${c.all})`]].map(([k, t]) => `<button type="button" data-f="${k}" aria-pressed="${stkFilter === k}">${t}</button>`).join("")}</div>
      <div class="toolbar-a"><input id="stQ" type="search" value="${esc(stkQ)}" placeholder="${L("सामान खोजें…","Search items…")}"></div>
      <div id="stList"></div>
      <details class="a-card stk-set" id="stSet"><summary><b>⚙️ ${L("कम स्टॉक लिमिट","Low-stock limit")}</b> <small>${L("अभी","now")} ${STK.default_low}</small></summary>
        <form id="stDef" class="stk-def"><label for="stDefN">${L("नए सामान की लिमिट (इतने या कम बचे तो अलर्ट)","Limit for new items (alert at this many or fewer)")}</label>
        <div class="stk-defr"><input id="stDefN" type="number" inputmode="numeric" min="0" max="10000" value="${STK.default_low}" required><button class="btn btn-primary">${L("सेव","Save")}</button></div>
        <label class="stk-chk"><input type="checkbox" id="stDefAll"> ${L("सारे मौजूदा सामान पर भी लगाओ","Apply to all existing items too")}</label></form></details>
      <details class="a-card" id="stLogD"><summary><b>📜 ${L("स्टॉक रजिस्टर (माल आया)","Stock register (stock in)")}</b></summary><div id="stLog"><p class="loading">…</p></div></details>
      <div class="stk-bar" id="stBar" hidden><span id="stBarN"></span><button type="button" class="btn btn-primary" id="stIn">📦 ${L("स्टॉक आया","Stock in")}</button><button type="button" class="btn btn-ghost" id="stClr" aria-label="${L("हटाएँ","Clear")}">✕</button></div>`;
    $("#stSeg").onclick = e => { const b = e.target.closest("[data-f]"); if (!b) return; stkFilter = b.dataset.f; document.querySelectorAll("#stSeg button").forEach(x => x.setAttribute("aria-pressed", x === b)); drawStockList(); };
    $("#stQ").oninput = e => { stkQ = e.target.value; drawStockList(); };
    $("#stCat").onclick = () => catalogPicker(); $("#stImp").onclick = () => importer();
    $("#stDef").onsubmit = async e => { e.preventDefault(); const all = $("#stDefAll").checked;
      try { const r = await api("/api/admin/stock/limit", {method: "POST", body: {default_low: Number($("#stDefN").value), apply_all: all}}); toast(L(`✅ लिमिट ${r.default_low} सेव`, `✅ Limit ${r.default_low} saved`)); stockView(); } catch (x) { if (!authFail(x)) toast(x.message); } };
    $("#stLogD").ontoggle = e => { if (e.target.open) loadStockLog(); };
    $("#stIn").onclick = () => stockInSheet([...stkSel]); $("#stClr").onclick = () => { stkSel.clear(); drawStockList(); };
    drawStockList();
  }
  function drawStockList(){
    const q = nName(stkQ); let list = STK.items;
    if (stkFilter === "low") list = list.filter(x => x.state === "low"); else if (stkFilter === "out") list = list.filter(x => x.state === "out");
    if (q) list = list.filter(x => nName(x.name_hi + " " + x.name_en + " " + x.label).includes(q));
    const el = $("#stList"); if (!el) return;
    el.innerHTML = list.length ? list.map(stockRow).join("") : `<div class="stk-empty"><span aria-hidden="true">📦</span><b>${stkFilter === "all" && !q ? L("अभी कोई सामान नहीं","No items yet") : L("यहाँ कुछ नहीं","Nothing here")}</b><p class="muted">${stkFilter === "all" && !q ? L("ऊपर “तैयार लिस्ट से जोड़ें” दबाइए — 300+ सामान एक बार में।","Tap “Add from ready list” above — 300+ items at once.") : stkFilter === "low" ? L("कोई सामान कम नहीं ✅","Nothing is low ✅") : ""}</p></div>`;
    el.onclick = stockClick; el.onchange = stockChange;
    const bar = $("#stBar"); bar.hidden = !stkSel.size; $("#stBarN").textContent = L(`${stkSel.size} चुने`, `${stkSel.size} chosen`);
    if (stkFocus) { const f = document.getElementById("stk-" + stkFocus); if (f) { f.classList.add("focus"); setTimeout(() => f.scrollIntoView({block: "center"}), 60); } stkFocus = null; }
  }
  function stockRow(x){
    const st = x.state === "out" ? L("ख़त्म","Khatam") : x.state === "low" ? L("कम","Low") : L("बचे","left");
    return `<article class="stk s-${x.state}" id="stk-${x.vid}">
      <label class="stk-ck"><input type="checkbox" data-sel="${x.vid}" ${stkSel.has(x.vid) ? "checked" : ""} aria-label="${L("चुनें","Select")}"></label>
      <div class="stk-main"><b>${icI(x)} ${esc(nmx(x))}</b><small>${esc(x.label)} · ${money(x.price_paise)}${x.show ? "" : ` · <em class="stk-hid">${L("दुकान में छिपा","hidden")}</em>`}</small>
        <div class="stk-meta"><button type="button" class="pill" data-lim="${x.vid}" aria-label="${L("कम स्टॉक लिमिट बदलें","Change low-stock limit")}">🔔 ${L("लिमिट","limit")} ${x.low_stock}</button>
        <label class="stk-show"><input type="checkbox" data-show="${x.pid}" ${x.show ? "checked" : ""}> ${L("दुकान में दिखाओ","Show in shop")}</label></div></div>
      <div class="stk-num"><b>${x.stock}</b><small>${st}</small></div>
      <div class="stk-q">${[5, 10, 20].map(q => `<button type="button" class="btn" data-add="${x.vid}" data-q="${q}">+${q}</button>`).join("")}<button type="button" class="btn btn-ghost" data-cus="${x.vid}" aria-label="${L("अपनी मात्रा","Custom qty")}">✏️</button></div></article>`;
  }
  const stkItem = vid => STK.items.find(x => x.vid === vid);
  function applyStock(res){ for (const r of res.items || []) { const x = stkItem(r.variant_id); if (x) { x.stock = r.stock; x.state = r.stock <= 0 ? "out" : r.stock <= x.low_stock ? "low" : "ok"; } }
    STK.counts.low = STK.items.filter(x => x.state === "low").length; STK.counts.out = STK.items.filter(x => x.state === "out").length; }
  async function stockAdd(items, note, btn){
    if (btn) btn.disabled = true;
    try { const r = await safeSave("/api/admin/stock/in", {idempotency_key: ikey(), note: note || "", items}, L("स्टॉक","Stock")); if (!r) return null; // v10.8: offline → queued with its key
      applyStock(r); const one = r.items.length === 1 ? r.items[0] : null; const x = one && stkItem(one.variant_id);
      toast(one && x ? `✅ ${nmx(x)} ${x.label}: ${one.before} → ${one.stock}` : L(`✅ ${r.items.length} सामान का स्टॉक जुड़ा`, `✅ Stock added for ${r.items.length} items`));
      if (tab === "stock") { const seg = $("#stSeg"); if (seg) seg.querySelectorAll("button").forEach(b => { const k = b.dataset.f; b.textContent = k === "low" ? `⚠️ ${L("कम स्टॉक","Low stock")} (${STK.counts.low})` : k === "out" ? `🚫 ${L("ख़त्म","Khatam")} (${STK.counts.out})` : `${L("सब","All")} (${STK.counts.all})`; }); drawStockList(); }
      loadNoti(); return r;
    } catch (x) { if (!authFail(x)) toast(x.message); } finally { if (btn) btn.disabled = false; }
  }
  async function stockClick(e){
    const a = e.target.closest("[data-add]"); if (a) return stockAdd([{variant_id: Number(a.dataset.add), qty: Number(a.dataset.q)}], "", a);
    const c = e.target.closest("[data-cus]"); if (c) return stockInSheet([Number(c.dataset.cus)]);
    const l = e.target.closest("[data-lim]"); if (l) return limitSheet(Number(l.dataset.lim));
  }
  async function stockChange(e){
    const s = e.target.closest("[data-sel]"); if (s) { const v = Number(s.dataset.sel); s.checked ? stkSel.add(v) : stkSel.delete(v); const bar = $("#stBar"); bar.hidden = !stkSel.size; $("#stBarN").textContent = L(`${stkSel.size} चुने`, `${stkSel.size} chosen`); return; }
    const sh = e.target.closest("[data-show]"); if (sh) { const pid = Number(sh.dataset.show), on = sh.checked; sh.disabled = true;
      try { await api("/api/admin/stock/show", {method: "POST", body: {product_id: pid, show: on}}); STK.items.filter(x => x.pid === pid).forEach(x => x.show = on); toast(on ? L("✅ दुकान में दिख रहा है","✅ Now shown in shop") : L("🙈 दुकान से छिपा दिया (स्टॉक सुरक्षित)","🙈 Hidden from shop (stock kept)")); drawStockList(); }
      catch (x) { sh.checked = !on; if (!authFail(x)) toast(x.message); } finally { sh.disabled = false; } }
  }
  function stockInSheet(vids){
    const xs = vids.map(stkItem).filter(Boolean); if (!xs.length) return;
    openSheet("📦 " + L("स्टॉक आया","Stock in"));
    $("#sheetBody").innerHTML = `<form id="sif" class="form stk-in">${xs.map(x => `<div class="sin-row"><div><b>${icI(x)} ${esc(nmx(x))}</b><small>${esc(x.label)} · ${L("अभी","now")} ${x.stock}</small></div>
        <input type="number" inputmode="numeric" min="1" max="100000" name="q${x.vid}" data-v="${x.vid}" placeholder="${L("कितने आए","qty")}" aria-label="${L("कितने आए","Quantity")} ${esc(nmx(x))}" ${xs.length === 1 ? "autofocus" : ""} required></div>`).join("")}
      <div class="sin-quick">${xs.length === 1 ? [5, 10, 20, 50].map(q => `<button type="button" class="btn btn-ghost" data-qq="${q}">+${q}</button>`).join("") : ""}</div>
      <label for="sin-note">${L("नोट (वैकल्पिक) — जैसे सप्लायर/बिल नं.","Note (optional) — e.g. supplier / bill no.")}</label><input id="sin-note" maxlength="140">
      <p class="err" id="sinErr" role="alert"></p><button class="btn btn-primary btn-block" id="sinGo">✅ ${L("स्टॉक जोड़ें","Add stock")}</button></form>`;
    $("#sif").onclick = e => { const b = e.target.closest("[data-qq]"); if (b) { const i = $("#sif input[data-v]"); i.value = b.dataset.qq; } };
    $("#sif").onsubmit = async e => { e.preventDefault();
      const items = [...document.querySelectorAll("#sif input[data-v]")].map(i => ({variant_id: Number(i.dataset.v), qty: Number(i.value)}));
      if (items.some(i => !(i.qty >= 1))) { $("#sinErr").textContent = L("हर सामान की मात्रा डालें (1 या ज़्यादा)","Enter a quantity (1 or more) for each item"); return; }
      const r = await stockAdd(items, $("#sin-note").value.trim(), $("#sinGo")); if (r) { closeSheet(); stkSel.clear(); if (tab === "stock") drawStockList(); } };
  }
  function limitSheet(vid){
    const x = stkItem(vid); if (!x) return;
    openSheet("🔔 " + L("कम स्टॉक लिमिट","Low-stock limit"));
    $("#sheetBody").innerHTML = `<form id="lmf" class="form"><p><b>${esc(nmx(x))}</b> · ${esc(x.label)} · ${L("अभी","now")} ${x.stock}</p>
      <label for="lmN">${L("इतने या कम बचें तो फ़ोन पर अलर्ट आए","Alert me when this many or fewer are left")}</label><input id="lmN" type="number" inputmode="numeric" min="0" max="10000" value="${x.low_stock}" required>
      <button class="btn btn-primary btn-block">${L("सेव करें","Save")}</button></form>`;
    $("#lmf").onsubmit = async e => { e.preventDefault();
      try { const r = await api("/api/admin/stock/limit", {method: "POST", body: {variant_id: vid, low_stock: Number($("#lmN").value)}}); x.low_stock = r.low_stock; x.state = x.stock <= 0 ? "out" : x.stock <= x.low_stock ? "low" : "ok"; closeSheet(); drawStockList(); toast(L("✅ लिमिट सेव","✅ Limit saved")); if (r.alerted) loadNoti(); }
      catch (x2) { if (!authFail(x2)) toast(x2.message); } };
  }
  async function loadStockLog(){
    const el = $("#stLog"); if (!el) return;
    try { const r = await api("/api/admin/stock/log"); const K = {in: L("माल आया","Stock in"), restock: L("1-टैप","1-tap"), new: L("नया सामान","New item")};
      el.innerHTML = r.log.length ? `<ul class="stk-log">${r.log.map(l => `<li><span>${icI(l)} ${esc(l.name_hi || "")} <small>${esc(l.label || "")}</small></span><b>+${l.qty}</b><small>${esc(when(l.created_at))} · ${esc(K[l.kind] || l.kind)} · ${l.before_qty} → ${l.after_qty}${l.note ? " · " + esc(l.note) : ""}</small></li>`).join("")}</ul>` : `<p class="muted">${L("अभी कोई एंट्री नहीं","No entries yet")}</p>`; }
    catch (x) { el.innerHTML = `<p class="err">${esc(x.message)}</p>`; }
  }
  // one-tap restock (from the 🔔 panel, a push action, or the dashboard)
  async function restockAlert(aid, q, btn){
    if (btn) btn.disabled = true;
    try { const r = await api("/api/admin/stock/restock", {method: "POST", body: {alert_id: aid, qty: q}}); const it = r.items[0];
      toast(r.duplicate ? L(`✓ पहले ही जोड़ा था — अभी ${it ? it.stock : ""}`, `✓ Already added — now ${it ? it.stock : ""}`) : L(`✅ +${q} जोड़ा: ${it.before} → ${it.stock}`, `✅ +${q} added: ${it.before} → ${it.stock}`));
      await loadNoti(); if (STK) applyStock(r); return it;
    } catch (x) { if (!authFail(x)) toast(x.message); } finally { if (btn) btn.disabled = false; }
  }
  function stockHash(){
    let mt = /^#restock=(\d+):(\d+)$/.exec(location.hash);
    if (mt) { history.replaceState(null, "", "/admin"); restockAlert(Number(mt[1]), Number(mt[2])).then(it => { if (it) stkFocus = it.variant_id; stkFilter = "all"; go("stock"); }); return true; }
    mt = /^#stock=(\d+|low)$/.exec(location.hash);
    if (mt) { history.replaceState(null, "", "/admin"); if (mt[1] === "low") stkFilter = "low"; else { stkFocus = Number(mt[1]); stkFilter = "all"; } go("stock"); return true; }
    return false;
  }
  window.addEventListener("hashchange", () => { if (me && /^#(restock|stock)=/.test(location.hash)) stockHash(); });
  // ---------- full-screen picker shell ----------
  function overlay(title){
    const w = document.createElement("div"); w.className = "imp-wrap"; w.setAttribute("role", "dialog"); w.setAttribute("aria-modal", "true");
    w.innerHTML = `<div class="imp-top"><button type="button" class="imp-x" aria-label="${L("बंद करें","Close")}">✕</button><b>${esc(title)}</b></div><div class="imp-body"></div><div class="imp-foot"></div>`;
    document.body.appendChild(w); document.body.classList.add("noscroll");
    const close = () => { w.remove(); document.body.classList.remove("noscroll"); };
    w.querySelector(".imp-x").onclick = close;
    return {w, body: w.querySelector(".imp-body"), foot: w.querySelector(".imp-foot"), close};
  }
  const catMeta = k => { const c = (window.AKCatalog && AKCatalog.cats.find(x => x.k === k)); return c ? {category_hi: c.hi, category_en: c.en, category_icon: c.i} : {category_hi: "अन्य", category_en: "Other", category_icon: "🛍️"}; };
  // ---------- 📋 ready list (catalog) ----------
  // v10.11: the ready grocery list is for kirana shops only; other types add their own items directly
  function typeCatalog(){ return shopFam() === "food" ? {cats: FOOD_STICKERS.map(g => ({k: g.en.toLowerCase().replace(/\W+/g, "-"), i: g.items[0][0], hi: g.g, en: g.en})), items: []} : {cats: [{k: "services", i: "⭐", hi: "सेवाएँ", en: "Services"}], items: []}; }
  async function ensureCatalog(){ if (isKirana()) return loadStockScript("/kirana-catalog.js"); window.AKCatalog = typeCatalog(); }
  async function catalogPicker(){
    if (!isKirana()) { try { await loadCatalog(); } catch (x) { return toast(x.message); } return editProduct(null); }
    let C, mine; try { await loadStockScript("/kirana-catalog.js"); C = window.AKCatalog; mine = await shopKeys(); } catch (x) { return toast(x.message); }
    const o = overlay("📋 " + L("तैयार लिस्ट — टिक करें, दाम डालें","Ready list — tick, add price"));
    let cat = "all", q = "", key = ikey(); const sel = new Map();
    const icon = Object.fromEntries(C.cats.map(c => [c.k, c.i]));
    const has = it => mine.has(ikeyOf(it[2], it[3])) || mine.has(ikeyOf(it[1], it[3]));
    o.body.innerHTML = `<div class="cat-tools"><input type="search" id="cq" placeholder="${L("खोजें: आटा, Tata, साबुन…","Search: atta, Tata, soap…")}">
      <div class="seg cat-seg" id="cseg"><button type="button" data-c="all" aria-pressed="true">${L("सब","All")}</button>${C.cats.map(c => `<button type="button" data-c="${c.k}" aria-pressed="false">${c.i} ${esc(L(c.hi, c.en))}</button>`).join("")}</div></div>
      <p class="hint cat-hint">${L("दाम खाली है — अपनी दुकान का दाम भरें। MRP और स्टॉक चाहें तो।","Prices are blank — fill your own price. MRP and stock optional.")}</p><div id="clist" class="cat-list"></div>`;
    o.foot.innerHTML = `<span id="cn"></span><button type="button" class="btn btn-primary" id="cgo">✅ ${L("सब जोड़ें","Add all")}</button>`;
    const draw = () => {
      const nq = nName(q); const rows = [];
      C.items.forEach((it, i) => { if (cat !== "all" && it[0] !== cat) return; if (nq && !nName(it[1] + " " + it[2] + " " + it[3]).includes(nq)) return; rows.push([it, i]); });
      $("#clist").innerHTML = rows.length ? rows.map(([it, i]) => { const done = has(it), s = sel.get(i);
        return `<div class="ci${done ? " done" : ""}${s ? " on" : ""}" data-i="${i}"><label class="ci-l"><input type="checkbox" data-ck="${i}" ${s ? "checked" : ""} ${done ? "disabled" : ""}><span class="ci-ic" aria-hidden="true">${window.AKIcons ? AKIcons.inlineHtml({name_en: it[1], name_hi: it[2], icon: icon[it[0]], cat_en: (C.cats.find(c => c.k === it[0]) || {}).en}) : icon[it[0]]}</span>
          <span class="ci-t"><b>${esc(AK.lang === "en" ? it[1] : it[2])}</b><small>${esc(AK.lang === "en" ? it[2] : it[1])} · <em>${esc(it[3])}</em></small></span>${done ? `<span class="ci-done">✓ ${L("पहले से है","already added")}</span>` : ""}</label>
          ${s ? `<div class="ci-in"><label>₹ ${L("दाम","Price")}*<input type="number" inputmode="decimal" min="0.01" step="0.01" data-p="${i}" value="${esc(s.price)}" placeholder="0" class="${s.bad ? "bad" : ""}"></label><label>MRP<input type="number" inputmode="decimal" min="0" step="0.01" data-m="${i}" value="${esc(s.mrp)}"></label><label>${L("स्टॉक","Stock")}<input type="number" inputmode="numeric" min="0" step="1" data-s="${i}" value="${esc(s.stock)}"></label></div>` : ""}</div>`; }).join("")
        : `<p class="empty">${L("कुछ नहीं मिला","Nothing found")}</p>`;
      foot();
    };
    const foot = () => { $("#cn").textContent = L(`${sel.size} चुने`, `${sel.size} chosen`); $("#cgo").disabled = !sel.size; };
    $("#cq").oninput = e => { q = e.target.value; draw(); };
    $("#cseg").onclick = e => { const b = e.target.closest("[data-c]"); if (!b) return; cat = b.dataset.c; $("#cseg").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); };
    $("#clist").onchange = e => { const ck = e.target.closest("[data-ck]"); if (ck) { const i = Number(ck.dataset.ck); ck.checked ? sel.set(i, {price: "", mrp: "", stock: ""}) : sel.delete(i); draw(); if (ck.checked) { const p = document.querySelector(`[data-p="${i}"]`); if (p) p.focus(); } } };
    $("#clist").oninput = e => { const t = e.target; for (const [a, f] of [["p", "price"], ["m", "mrp"], ["s", "stock"]]) if (t.dataset[a] != null) { const s = sel.get(Number(t.dataset[a])); if (s) { s[f] = t.value; if (f === "price") { s.bad = false; t.classList.remove("bad"); } } } };
    $("#cgo").onclick = async () => {
      const items = []; let bad = 0;
      for (const [i, s] of sel) { const it = C.items[i]; const p = Number(s.price), m = s.mrp === "" ? null : Number(s.mrp);
        if (!(p > 0) || (m != null && m < p)) { s.bad = true; bad++; continue; }
        items.push({name_hi: it[2], name_en: it[1], label: it[3], price: s.price, mrp: s.mrp, stock: s.stock === "" ? 0 : Number(s.stock), icon: icon[it[0]], ...catMeta(it[0])}); }
      if (bad) { draw(); toast(L(`${bad} सामान का दाम डालें (MRP दाम से कम नहीं)`, `Enter a price for ${bad} item(s) (MRP not below price)`)); const f = document.querySelector("input.bad"); if (f) f.focus(); return; }
      const b = $("#cgo"); b.disabled = true; b.textContent = "⏳ " + L("जोड़ रहे हैं…","Adding…");
      try { const r = await api("/api/admin/stock/bulk", {method: "POST", body: {idempotency_key: key, source: "catalog", items}});
        key = ikey(); catalog = null; o.close();
        toast(L(`✅ ${r.added} सामान जुड़े`, `✅ ${r.added} items added`) + (r.skipped.length ? L(` · ${r.skipped.length} पहले से थे`, ` · ${r.skipped.length} already there`) : "") + (r.categories_created ? L(` · ${r.categories_created} नई कैटेगरी`, ` · ${r.categories_created} new categories`) : ""));
        stkFilter = "all"; go("stock");
      } catch (x) { b.disabled = false; b.textContent = "✅ " + L("सब जोड़ें","Add all"); if (!authFail(x)) toast(x.status === 400 && x.data && x.data.rows ? x.data.rows.map(r => `${r.name}: ${r.error}`).slice(0, 3).join(" · ") : x.message); }
    };
    draw(); setTimeout(() => { const i = $("#cq"); if (i && matchMedia("(min-width: 700px)").matches) i.focus(); }, 50);
  }
  // ---------- 📝 list / CSV / Excel / text-PDF import (parse in the phone → PREVIEW → confirm) ----------
  async function importer(){
    try { await Promise.all([ensureCatalog(), loadStockScript("/stock-import.js")]); } catch (x) { return toast(x.message); }
    const o = overlay("📝 " + L("लिस्ट से सामान जोड़ें","Add items from a list"));
    o.body.innerHTML = `<div class="imp-in"><label for="itx"><b>${L("लिस्ट लिखें या पेस्ट करें — हर लाइन में एक सामान","Type or paste a list — one item per line")}</b></label>
      <textarea id="itx" rows="7" placeholder="Chawal 1kg 60&#10;Dal 1kg - 120 - 20 pcs&#10;Parle-G ₹10 x50&#10;चीनी 1 किलो 44 स्टॉक 30"></textarea>
      <p class="hint">${L("नाम · साइज़ · दाम · स्टॉक (x50 या “20 pcs”)। हिंदी भी चलेगी।","Name · size · price · stock (x50 or “20 pcs”). Hindi works too.")}</p>
      <div class="imp-or">${L("या फ़ाइल डालें","or upload a file")}</div>
      <label class="btn btn-ghost btn-block imp-file">📎 ${L("Excel (.xlsx) / CSV / PDF चुनें","Choose Excel (.xlsx) / CSV / PDF")}<input type="file" id="ifile" accept=".csv,.xlsx,.pdf,.txt,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>
      <p class="hint">${L("PDF: सिर्फ़ कंप्यूटर/ऐप से बनी (text वाली) PDF पढ़ी जाती है। फ़ोटो/स्कैन वाली अभी नहीं।","PDF: only PDFs made on a computer/app (with text) can be read. Photo/scanned PDFs don't work yet.")}</p>
      <p class="err" id="ierr" role="alert"></p></div>`;
    o.foot.innerHTML = `<span></span><button type="button" class="btn btn-primary" id="iprev">👀 ${L("प्रीव्यू देखें","See preview")}</button>`;
    $("#iprev").onclick = () => { const t = $("#itx").value; if (!t.trim()) { $("#ierr").textContent = L("पहले लिस्ट लिखें या फ़ाइल चुनें","Type a list or choose a file first"); return; } preview(AKImport.parseText(t)); };
    $("#ifile").onchange = async e => { const f = e.target.files[0]; if (!f) return; $("#ierr").textContent = "";
      if (f.size > 5 * 1024 * 1024) { $("#ierr").textContent = L("फ़ाइल बहुत बड़ी है (5 MB तक)","File too big (max 5 MB)"); return; }
      try { if (/\.pdf$/i.test(f.name)) await loadStockScript("/pdf-text.js");
        const r = await AKImport.parseFile(f.name, await f.arrayBuffer());
        if (r.error) { $("#ierr").textContent = r.error === "scanned" ? L("यह PDF फ़ोटो/स्कैन वाली लगती है — इसमें पढ़ने लायक text नहीं है। अभी सिर्फ़ text वाली PDF चलती है। लिस्ट टाइप/पेस्ट करें या Excel/CSV डालें।","This PDF looks like a photo/scan — it has no readable text. Only text PDFs work for now. Type/paste the list or use Excel/CSV.")
          : r.error === "old_xls" ? L("पुरानी .xls फ़ाइल — Excel में “Save as .xlsx” या CSV करके डालें।","Old .xls file — save it as .xlsx or CSV in Excel and upload again.") : L("यह फ़ाइल नहीं चलती — .xlsx, .csv या PDF डालें।","This file type doesn't work — use .xlsx, .csv or PDF."); return; }
        if (!r.rows.length) { $("#ierr").textContent = L("फ़ाइल में कोई सामान नहीं मिला","No items found in the file"); return; }
        preview(r.rows);
      } catch (x) { $("#ierr").textContent = L("फ़ाइल पढ़ी नहीं गई: ","Could not read the file: ") + x.message; } };
    async function preview(rows){
      let mine; try { mine = await shopKeys(); } catch (x) { return toast(x.message); }
      const cats = window.AKCatalog.cats; let key = ikey();
      const R = rows.slice(0, 300).map(r => { const ex = mine.get(ikeyOf(r.name_hi, r.size)) || mine.get(ikeyOf(r.name_en || r.name, r.size)) || null;
        return {...r, on: r.ok, ex, mode: ex ? (r.stock ? "stock" : "skip") : "new", price: r.price ?? "", stock: r.stock ?? "", mrp: r.mrp ?? ""}; });
      const draw = () => {
        const n = R.filter(r => r.on).length;
        o.body.innerHTML = `<p class="hint imp-sum">${L(`${R.length} लाइन पढ़ी · ${R.filter(r => !r.ok).length} में दिक्कत · ${R.filter(r => r.ex).length} पहले से दुकान में`, `${R.length} lines read · ${R.filter(r => !r.ok).length} need fixing · ${R.filter(r => r.ex).length} already in shop`)}<br>${L("जाँचें, बदलें या टिक हटाएँ — “सेव” दबाने तक कुछ सेव नहीं होगा।","Check, edit or untick — nothing is saved until you tap Save.")}</p>
          <div class="imp-rows">${R.map((r, i) => `<div class="ir${r.on ? "" : " off"}${r.ok ? "" : " bad"}${r.ex ? " dup" : ""}">
            <div class="ir-h"><label><input type="checkbox" data-on="${i}" ${r.on ? "checked" : ""}> <b>${i + 1}.</b></label>
              <span class="ir-st">${!r.ok ? `⚠️ ${r.why === "price" ? L("दाम नहीं मिला","no price") : L("समझ नहीं आया","not understood")}` : r.ex ? `🔁 ${L("पहले से है","already in shop")}` : "✅"}</span><small class="ir-raw">${esc(r.raw || "")}</small></div>
            <div class="ir-f"><label class="w2">${L("नाम","Name")}<input data-f="name" data-i="${i}" value="${esc(r.name_hi || r.name)}"></label><label>${L("साइज़","Size")}<input data-f="size" data-i="${i}" value="${esc(r.size)}" placeholder="1 kg"></label>
              <label>₹ ${L("दाम","Price")}<input type="number" inputmode="decimal" step="0.01" min="0" data-f="price" data-i="${i}" value="${esc(r.price)}"></label><label>${L("स्टॉक","Stock")}<input type="number" inputmode="numeric" min="0" data-f="stock" data-i="${i}" value="${esc(r.stock)}"></label>
              ${r.ex ? `<label class="w2">${L("पहले से है","Already in shop")}: ${esc(r.ex.name)} ${esc(r.ex.label)} (${L("स्टॉक","stock")} ${r.ex.stock}, ${money(r.ex.price_paise)})<select data-f="mode" data-i="${i}">${[["stock", L("स्टॉक जोड़ो","Add stock")], ["price", L("दाम बदलो","Update price")], ["both", L("स्टॉक + दाम","Stock + price")], ["skip", L("छोड़ो","Skip")]].map(([k, t]) => `<option value="${k}" ${r.mode === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>`
              : `<label class="w2">${L("कैटेगरी","Category")}<select data-f="cat" data-i="${i}">${cats.map(c => `<option value="${c.k}" ${r.cat === c.k ? "selected" : ""}>${c.i} ${esc(L(c.hi, c.en))}</option>`).join("")}<option value="other" ${!cats.some(c => c.k === r.cat) ? "selected" : ""}>🛍️ ${L("अन्य","Other")}</option></select></label>`}</div></div>`).join("")}</div>`;
        o.foot.innerHTML = `<button type="button" class="btn btn-ghost" id="iback">← ${L("वापस","Back")}</button><button type="button" class="btn btn-primary" id="isave" ${n ? "" : "disabled"}>✅ ${L(`${n} सेव करें`, `Save ${n}`)}</button>`;
        $("#iback").onclick = () => { o.close(); importer(); };
        $("#isave").onclick = save;
      };
      o.body.onchange = e => { const t = e.target; if (t.dataset.on != null) { R[Number(t.dataset.on)].on = t.checked; draw(); return; }
        const i = t.dataset.i; if (i == null) return; const r = R[Number(i)]; const f = t.dataset.f;
        if (f === "mode") r.mode = t.value; else if (f === "cat") r.cat = t.value;
        else { if (f === "name") { r.name = t.value; r.name_hi = t.value; } else r[f] = t.value;
          r.ok = !!String(r.name_hi || r.name).trim() && Number(r.price) > 0; if (r.ok && !r.on && f === "price") r.on = true;
          const ex = mine.get(ikeyOf(r.name_hi, r.size)) || mine.get(ikeyOf(r.name_en || "", r.size)) || null; if (!!ex !== !!r.ex) { r.ex = ex; r.mode = ex ? "stock" : "new"; } }
        draw(); };
      async function save(){
        const on = R.filter(r => r.on), items = [], updates = [], bad = [];
        for (const r of on) {
          if (r.ex) { if (r.mode === "skip") continue; const u = {variant_id: r.ex.vid};
            if (r.mode === "stock" || r.mode === "both") { const s = Number(r.stock); if (!(s > 0)) { bad.push(r); continue; } u.add_stock = s; }
            if (r.mode === "price" || r.mode === "both") { if (!(Number(r.price) > 0)) { bad.push(r); continue; } u.price = r.price; }
            updates.push(u); continue; }
          if (!String(r.name_hi || r.name).trim() || !(Number(r.price) > 0)) { bad.push(r); continue; }
          const cm = catMeta(r.cat); items.push({name_hi: r.name_hi || r.name, name_en: r.name_en || "", label: r.size || "", price: r.price, mrp: r.mrp, stock: r.stock === "" ? 0 : Number(r.stock), icon: r.icon || cm.category_icon, ...(r.cat_name ? {category_hi: r.cat_name, category_en: "", category_icon: cm.category_icon} : cm)}); }
        if (bad.length) { toast(L(`${bad.length} लाइन ठीक करें (दाम/स्टॉक) या टिक हटाएँ`, `Fix ${bad.length} line(s) (price/stock) or untick them`)); return; }
        if (!items.length && !updates.length) { toast(L("सेव करने को कुछ नहीं","Nothing to save")); return; }
        const b = $("#isave"); b.disabled = true; b.textContent = "⏳ " + L("सेव हो रहा…","Saving…");
        try { const r = await api("/api/admin/stock/bulk", {method: "POST", body: {idempotency_key: key, source: "import", items, updates}});
          key = ikey(); catalog = null; o.close();
          toast(L(`✅ ${r.added} नए सामान · ${r.updated} अपडेट`, `✅ ${r.added} new · ${r.updated} updated`) + (r.skipped.length ? L(` · ${r.skipped.length} पहले से थे`, ` · ${r.skipped.length} already there`) : ""));
          stkFilter = "all"; go("stock");
        } catch (x) { b.disabled = false; b.textContent = "✅ " + L("सेव करें","Save"); if (!authFail(x)) toast(x.data && x.data.rows ? x.data.rows.map(r => `${r.name}: ${r.error}`).slice(0, 3).join(" · ") : x.message); }
      }
      draw();
    }
  }
})();
