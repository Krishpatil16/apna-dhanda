(function(){
  const {t, esc, money, api, applyT} = AK; const page = document.getElementById("page");
  const FLOW = ["pending","accepted","preparing","ready","out_for_delivery","delivered"]; // v10.8: + ready (तैयार); the shop may skip it
  const L = (hi, en) => AK.lang === "en" ? en : hi;
  const icI = p => window.AKIcons ? AKIcons.inlineHtml(p) : esc((p && p.icon) || ""); // v10.10: AI product icons
  let timer;
  // v10.14: a salon is a booking app — no cart, no money, no payment line on its screens (Krish 26 Oct 11:30 PM)
  const SALON = AK.shopType === "salon";
  if (SALON) { document.body.classList.add("salon-track");
    const nav = document.querySelector(".bnav"); if (nav) { nav.querySelectorAll('a[href="/#cart"]').forEach(a => a.remove()); const s = nav.querySelector('a[href="/"] .bn-i'); if (s) s.textContent = "✂️"; const b = nav.querySelector(".bn-orders .bn-i"); if (b && b.firstChild) b.firstChild.textContent = "📅"; }
    const mh = document.querySelector('.mini-head a[href="/"] span'); if (mh) { mh.removeAttribute("data-t"); mh.dataset.salonBack = "1"; } }
  const when = ms => new Date(ms).toLocaleString(AK.lang==="en"?"en-IN":"hi-IN", {day:"numeric", month:"short", hour:"numeric", minute:"2-digit", timeZone:"Asia/Kolkata"});
  const cartCount = () => { try { return Object.values(JSON.parse(localStorage.getItem(AK.SK("ak_cart"))) || {}).reduce((a,c)=>a+(c.qty||0),0); } catch { return 0; } };
  function remember(code, token, o){
    try { const list = JSON.parse(localStorage.getItem(AK.SK("ak_orders"))) || [];
      if (!list.some(x => x.code === code)) { list.unshift({code, token, at: o.created_at, total: o.total_paise}); localStorage.setItem(AK.SK("ak_orders"), JSON.stringify(list.slice(0, 30))); } } catch {}
  }
  // v4: reorder at today's prices — the server answers which items are still available and their CURRENT price
  async function reorder(code, token, btn){
    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    try {
      const r = await api("/api/orders/reorder", {method:"POST", body:{code, token}});
      let cart = {}; try { cart = JSON.parse(localStorage.getItem(AK.SK("ak_cart"))) || {}; } catch {}
      const ok = r.items.filter(i => i.available), bad = r.items.filter(i => !i.available);
      for (const i of ok) { const prev = cart[i.variant_id]?.qty || 0; cart[i.variant_id] = {qty: Math.min(prev + i.qty, 50), price: i.price_paise}; }
      localStorage.setItem(AK.SK("ak_cart"), JSON.stringify(cart)); AK.setBadge("cart", cartCount());
      const nmI = i => `${icI(i)} ${esc(AK.lang==="en" && i.name_en ? i.name_en : i.name)} (${esc(i.label)})`;
      const box = document.getElementById("roBox") || Object.assign(document.createElement("div"), {id: "roBox"});
      box.className = "notice ro-box"; box.setAttribute("role", "status");
      box.innerHTML = `<b>🔁 ${ok.length ? L(`${ok.length} सामान कार्ट में डाले — आज के रेट पर`, `${ok.length} item(s) added to cart — at today's prices`) : L("कोई सामान अभी उपलब्ध नहीं","None of these items are available now")}</b>
        <ul class="ro-list">${ok.map(i => `<li>✅ ${nmI(i)} × ${i.qty} · ${money(i.price_paise)}${i.price_paise !== i.was_paise ? ` <small>(${L("पिछली बार","last time")} ${money(i.was_paise)})</small>` : ""}${i.problem === "less_stock" ? ` <small>${L("— स्टॉक कम, कम मात्रा डाली","— less in stock, fewer added")}</small>` : ""}</li>`).join("")}
        ${bad.map(i => `<li class="no">❌ ${nmI(i)} — ${i.problem === "out_of_stock" ? L("अभी स्टॉक में नहीं","out of stock now") : L("अब नहीं मिलता","no longer sold")}</li>`).join("")}</ul>
        ${ok.length ? `<a class="btn btn-primary btn-block" href="/#cart">🛒 ${L("कार्ट देखें और ऑर्डर करें →","View cart & order →")}</a>` : ""}`;
      page.prepend(box); box.scrollIntoView({block: "start", behavior: AK.reduced() ? "auto" : "smooth"});
    } catch (e) { AK.toast(e.message); }
    if (btn) { btn.disabled = false; btn.textContent = "🔁 " + L("फिर से मंगाएं","Reorder"); }
  }
  page.addEventListener("click", e => { const b = e.target.closest("[data-reorder]"); if (!b) return; e.preventDefault(); const [c, tk] = b.dataset.reorder.split("."); reorder(c, tk, b); });
  function steps(status){
    const idx = FLOW.indexOf(status);
    return `<div class="mini-steps" aria-hidden="true">${FLOW.map((s,i) => `<i class="${i<=idx?"on":""}"></i>`).join("")}</div>`;
  }
  async function list(){
    const local = AK.myOrders();
    page.innerHTML = `<h1 class="mo-h">${SALON ? "📅" : "📦"} ${esc(t("my_orders"))}</h1><p class="hint">${SALON ? L("इस फ़ोन से की गई आपकी बुकिंग। लॉगिन की ज़रूरत नहीं।","Bookings made from this phone. No login needed.") : L("इस फ़ोन से किए गए आपके ऑर्डर। लॉगिन की ज़रूरत नहीं।","Orders placed from this phone. No login needed.")}</p><div id="mo"><p class="loading">…</p></div>`;
    if (!local.length) { document.getElementById("mo").innerHTML = `<div class="empty-box"><span aria-hidden="true">${SALON ? "✂️" : "🧺"}</span><p>${SALON ? L("इस फ़ोन से अभी कोई बुकिंग नहीं।","No bookings from this phone yet.") : L("इस फ़ोन से अभी कोई ऑर्डर नहीं।","No orders from this phone yet.")}</p><a class="btn btn-primary" href="/">${esc(t("shop_more"))}</a></div>`; return; }
    let mine; try { mine = await AK.fetchMine(); } catch (e) { document.getElementById("mo").innerHTML = `<p class="notice">${esc(e.message)}</p>`; return; }
    const act = mine.filter(o => AK.ACTIVE.includes(o.status)), past = mine.filter(o => !AK.ACTIVE.includes(o.status));
    AK.setBadge("orders", act.length);
    const row = o => `<div class="mo-wrap"><a class="mo-card st-${o.status}" href="#${esc(o.code)}.${esc(o.token)}">
        <span class="mo-top"><b class="code">${esc(o.code)}</b><span class="status-chip st-${o.status}">${AK.ST_ICON[o.status]} ${esc(SALON && o.status === "pending" ? L("स्वीकार बाकी","Waiting to accept") : t("st_" + o.status))}</span></span>
        ${AK.ACTIVE.includes(o.status) ? steps(o.status) : ""}
        <span class="mo-items">${o.preview.map(i => `${icI(i)} ${esc(AK.lang==="en" && i.name_en ? i.name_en : i.name)}`).join(", ")}${o.item_count > o.preview.length ? " …" : ""}</span>
        <span class="mo-foot"><span>${when(o.created_at)} · ${o.item_count} ${SALON ? L("सेवा", o.item_count === 1 ? "service" : "services") : L("सामान", o.item_count === 1 ? "item" : "items")}</span>${SALON ? "" : `<b>${money(o.total_paise)}</b>`}</span>
        ${o.reason && (o.status==="rejected"||o.status==="cancelled") ? `<span class="mo-reason">❕ ${esc(o.reason)}</span>` : ""}
        ${AK.ACTIVE.includes(o.status) ? `<span class="mo-push">${o.push_on ? "🔔 " + L("अपडेट चालू","Updates on") : "🔕 " + L("नोटिफिकेशन बंद — खोलकर चालू करें","Notifications off — open to turn on")}</span>` : ""}
      </a>${!SALON && !AK.ACTIVE.includes(o.status) ? `<button class="btn btn-ghost reorder-btn" type="button" data-reorder="${esc(o.code)}.${esc(o.token)}">🔁 ${L("फिर से मंगाएं","Reorder")}</button>` : ""}</div>`;
    document.getElementById("mo").innerHTML =
      (act.length ? `<h2 class="mo-sec">${SALON ? L("चालू बुकिंग","Active bookings") : L("चालू ऑर्डर","Active orders")} (${act.length})</h2>${act.map(row).join("")}` : "") +
      (past.length ? `<h2 class="mo-sec">${SALON ? L("पुरानी बुकिंग","Past bookings") : L("पुराने ऑर्डर","Past orders")}</h2>${past.map(row).join("")}` : "") +
      (!mine.length ? `<p class="empty">${L("ऑर्डर नहीं मिले।","No orders found.")}</p>` : "") +
      `<p class="hint">${L("यह पेज अपने आप अपडेट होता है।","This page updates by itself.")}</p>`;
    clearTimeout(timer); if (act.length) timer = setTimeout(show, 20000);
  }
  async function detail(code, token){
    try {
      const {order: o, shop} = await api(`/api/orders/${code}`, {headers: {"x-order-token": token}});
      const sh = shop || {}; const waMsg = encodeURIComponent(L(`नमस्ते, मेरा ऑर्डर ${o.code} के बारे में: `, `Hello, about my order ${o.code}: `));
      const shopBtns = (sh.phone || sh.whatsapp) ? `<div class="shop-actions">${sh.phone ? `<a class="btn btn-ghost" href="tel:+91${esc(sh.phone)}">📞 ${L("दुकान को कॉल करें","Call the shop")}</a>` : ""}${sh.whatsapp ? `<a class="btn btn-wa" href="https://wa.me/91${esc(sh.whatsapp)}?text=${waMsg}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ""}</div>` : "";
      const stars = n => "★".repeat(n) + "☆".repeat(5 - n);
      const cancelBox = o.can_cancel ? `<div class="cancel-box"><p class="hint">${SALON ? L("सैलून ने अभी बुकिंग नहीं ली है — आप इसे रद्द कर सकते हैं।","The salon hasn't started yet — you can still cancel.") : L("दुकान ने अभी ऑर्डर नहीं लिया है — आप इसे रद्द कर सकते हैं।","The shop hasn't accepted yet — you can still cancel.")}</p><button class="btn btn-danger btn-block" type="button" id="cancelBtn">✖ ${SALON ? L("बुकिंग रद्द करें","Cancel booking") : L("ऑर्डर रद्द करें","Cancel order")}</button></div>`
        : ["accepted","preparing","ready","out_for_delivery"].includes(o.status) ? `<div class="cancel-box"><p>${SALON ? L("बुकिंग रद्द करनी है? सैलून इसे शुरू कर चुका है, इसलिए सैलून को कॉल करें।","Need to cancel? The salon has already started it — please call the salon.") : L("ऑर्डर रद्द करना है? दुकान ऑर्डर ले चुकी है, इसलिए दुकान को कॉल करें।","Need to cancel? The shop has already accepted it — please call the shop.")}</p>${sh.phone ? `<a class="btn btn-ghost btn-block" href="tel:+91${esc(sh.phone)}">📞 ${L("कॉल करके रद्द करवाएँ","Call to cancel")}</a>` : ""}</div>` : "";
      const rateBox = o.status !== "delivered" ? "" : o.rating ? `<div class="rate-box"><b>${L("आपकी रेटिंग","Your rating")}:</b> <span class="stars">${stars(o.rating.stars)}</span>${o.rating.comment ? `<p>“${esc(o.rating.comment)}”</p>` : ""}<p class="hint">${L("धन्यवाद! 🙏","Thank you! 🙏")}</p></div>`
        : `<form class="rate-box" id="rateF"><b>⭐ ${L("ऑर्डर कैसा रहा?","How was your order?")}</b> <small class="hint">${L("(ज़रूरी नहीं)","(optional)")}</small>
          <div class="star-pick" role="radiogroup" aria-label="${L("स्टार","Stars")}">${[1,2,3,4,5].map(n => `<button type="button" role="radio" aria-checked="false" data-star="${n}" aria-label="${n}">★</button>`).join("")}</div>
          <label for="rc" class="sr-only">${L("कुछ लिखें","Comment")}</label><textarea id="rc" maxlength="300" placeholder="${L("कुछ लिखना चाहें तो (ज़रूरी नहीं)","Anything to add? (optional)")}"></textarea>
          <p class="err" id="rerr" role="alert"></p><button class="btn btn-primary btn-block" type="submit">${L("रेटिंग भेजें","Send rating")}</button></form>`;
      remember(code, token, o);
      if (o.token) return tokenView(code, token, o, sh, shopBtns, cancelBox, rateBox);
      // v10.8: the shop's suggestion to swap an unavailable item (Accept / Decline) + what the shop changed and why
      const nmS = x => `${icI(x)} ${esc(AK.lang === "en" && x.name_en ? x.name_en : x.name)} ${esc(x.label || "")}`;
      const diffTxt = d => d === 0 ? L("दाम वही", "same price") : (d > 0 ? "+ " : "− ") + money(Math.abs(d));
      const subBox = (o.subs || []).filter(s => s.status === "pending").map(s => `<div class="notice sub-box" role="status"><b>🔁 ${L("दुकान ने बदलने का सुझाव दिया", "The shop suggested a change")}</b>
          <p>${nmS(s.from)} → <b>${nmS(s.to)}</b> × ${s.qty} <span class="sub-diff">(${esc(diffTxt(s.diff_paise))})</span></p>
          <div class="sub-acts"><button class="btn btn-primary" type="button" data-sub="${s.id}" data-ans="accept">✅ ${L("हाँ, बदल दो", "Accept")}</button><button class="btn btn-ghost" type="button" data-sub="${s.id}" data-ans="decline">✖ ${L("नहीं, हटा दो", "Decline")}</button></div></div>`).join("");
      const chBox = (o.changes || []).length ? `<div class="notice change-box"><b>✏️ ${L("दुकान ने ऑर्डर में बदलाव किया", "The shop changed your order")}</b><ul>${o.changes.map(c => `<li>${esc(c.note)} <small>${when(c.at)}</small></li>`).join("")}</ul><small>${L("बिल नीचे नए हिसाब से है।", "The bill below is updated.")}</small></div>` : "";
      const ended = o.status === "rejected" || o.status === "cancelled"; const idx = FLOW.indexOf(o.status);
      const at = s => { const e = o.events.find(x => x.to_status === s); return e ? when(e.at) : ""; };
      page.innerHTML = `<p class="back-row"><a href="/track${esc(location.search)}">← ${esc(t("my_orders"))}</a></p>
        <h1>${esc(t("order_no"))} <span class="code">${esc(o.code)}</span></h1>
        <p class="hint">${when(o.created_at)} · ${esc(o.customer_name)} · ${esc(o.phone_masked)}</p>
        ${ended ? `<div class="notice"><b>${AK.ST_ICON[o.status]} ${esc(t("status_"+o.status))}</b>${o.reason ? ` — ${esc(o.reason)}` : ""}</div>` :
        `<ol class="timeline">${FLOW.map((s,i) => `<li class="${i<idx?"past":i===idx?"now":""}"><span class="dot">${i<idx?"✓":i+1}</span><div><b>${esc(s==="pending" ? L("ऑर्डर भेजा","Order placed") : t("status_"+s))}</b><small>${at(s)}</small></div></li>`).join("")}</ol>`}
        ${subBox}${chBox}${shopBtns}${cancelBox}${rateBox}
        ${!ended && o.status !== "delivered" ? `<div id="notifBox"></div>` : ""}
        <div class="bill">${o.items.map(i => `<div><span>${icI(i)} ${esc(AK.lang==="en" && i.product_name_en ? i.product_name_en : i.product_name)} (${esc(i.variant_label)}) × ${i.qty}${i.base_price_paise ? ` <span class="offer-tag inline">🏷️ ${esc(t("offer_tag"))}</span>` : ""}</span><span>${money(i.line_total_paise)}</span></div>`).join("")}
          ${o.discount_paise ? `<div class="disc"><span>🏷️ ${esc(o.discount_title || L("छूट","Discount"))}</span><span>− ${money(o.discount_paise)}</span></div>` : ""}
          <div><span>${esc(t("delivery"))}</span><span>${o.delivery_paise ? money(o.delivery_paise) : esc(t("free"))}</span></div>
          <div class="tot"><span>${esc(t("total"))}</span><span>${money(o.total_paise)}</span></div></div>
        <p class="hint">💵 ${o.payment_method === "cod" ? "Cash on Delivery" : "UPI on delivery"} · ${L("यह पेज अपने आप अपडेट होता है।","This page refreshes on its own.")}</p>
        <button class="btn btn-ghost btn-block" type="button" data-reorder="${esc(code)}.${esc(token)}">🔁 ${L("फिर से मंगाएं","Reorder")}</button>`;
      page.querySelectorAll("[data-sub]").forEach(b => b.onclick = async () => { page.querySelectorAll("[data-sub]").forEach(x => x.disabled = true);
        try { await api(`/api/orders/${code}/substitute`, {method:"POST", headers:{"x-order-token": token}, body:{sub_id: Number(b.dataset.sub), answer: b.dataset.ans}}); AK.toast(b.dataset.ans === "accept" ? L("✅ बदल दिया — बिल अपडेट हुआ", "✅ Swapped — bill updated") : L("सामान हटा दिया — बिल अपडेट हुआ", "Item removed — bill updated")); }
        catch (x) { AK.toast(x.message); } detail(code, token); });
      const cb = document.getElementById("cancelBtn");
      if (cb) cb.onclick = async () => { if (!confirm(L("क्या आप यह ऑर्डर रद्द करना चाहते हैं?","Cancel this order?"))) return; cb.disabled = true;
        try { await api(`/api/orders/${code}/cancel`, {method:"POST", headers:{"x-order-token": token}, body:{}}); AK.toast(L("ऑर्डर रद्द हो गया","Order cancelled")); detail(code, token); }
        catch (x) { AK.toast(x.message); detail(code, token); } };
      const rf = document.getElementById("rateF");
      if (rf) { let stars = 0; rf.querySelector(".star-pick").onclick = e => { const b = e.target.closest("[data-star]"); if (!b) return; stars = Number(b.dataset.star); rf.querySelectorAll("[data-star]").forEach(x => { const on = Number(x.dataset.star) <= stars; x.classList.toggle("on", on); x.setAttribute("aria-checked", String(Number(x.dataset.star) === stars)); }); };
        rf.onsubmit = async e => { e.preventDefault(); if (!stars) { document.getElementById("rerr").textContent = L("स्टार चुनें","Pick the stars"); return; }
          try { await api(`/api/orders/${code}/rating`, {method:"POST", headers:{"x-order-token": token}, body:{stars, comment: document.getElementById("rc").value}}); AK.toast(L("धन्यवाद! 🙏","Thank you! 🙏")); detail(code, token); }
          catch (x) { document.getElementById("rerr").textContent = x.message; } }; }
      if (!ended && o.status !== "delivered") AK.notifyBox(document.getElementById("notifBox"), {code, token});
      clearTimeout(timer); if (!ended && o.status !== "delivered") timer = setTimeout(show, 30000);
    } catch (e) { page.innerHTML = `<p class="back-row"><a href="/track${esc(location.search)}">← ${esc(t("my_orders"))}</a></p><p class="notice">${esc(e.status === 404 ? L("ऑर्डर नहीं मिला। लिंक जाँच लें।","Order not found. Check the link.") : e.message)}</p>`; }
  }
  // v10.13: salon / service walk-in token — big number, people ahead, live every ~15 s
  function tokenView(code, token, o, sh, shopBtns, cancelBox, rateBox){
    const tk = o.token, ended = o.status === "rejected" || o.status === "cancelled", done = o.status === "delivered";
    const shopName = (AK.lang === "en" ? (sh.name_en || sh.name) : (sh.name_hi || sh.name)) || sh.name || "";
    const svcs = o.items.map(i => `${icI(i)} ${esc(AK.lang === "en" && i.product_name_en ? i.product_name_en : i.product_name)}${i.qty > 1 ? " × " + i.qty : ""}`).join(", ");
    const dayTxt = new Date(tk.day + "T12:00:00+05:30").toLocaleDateString(AK.lang === "en" ? "en-IN" : "hi-IN", {day: "numeric", month: "short", timeZone: "Asia/Kolkata"});
    let pos;
    const req = tk.no == null;
    if (req && (tk.not_accepted || o.status === "rejected")) pos = `<p class="tok-pos tok-end">😔 ${L("सैलून अभी आपकी बुकिंग नहीं ले पाया, कृपया थोड़ी देर बाद फिर कोशिश करें।", "Salon couldn't accept, please try later.")}</p>`;
    else if (req && o.status === "pending" && SALON) pos = `<p class="tok-pos tok-wait tok-sent">📨 ${L("रिक्वेस्ट भेज दी गई ✓", "Request sent ✓")}</p><p class="tok-pos tok-wait">⏳ ${L("सैलून के स्वीकार करने का इंतज़ार…", "Waiting for the salon to accept…")}</p><p class="hint">${L("स्वीकार होते ही आपका नंबर यहाँ दिखेगा।", "Your number shows here as soon as they accept.")}</p>`;
    else if (req && o.status === "pending") pos = `<p class="tok-pos tok-wait">⏳ ${L("सैलून के स्वीकार करने का इंतज़ार…", "Waiting for salon to accept…")}</p><p class="hint">${L("स्वीकार होते ही आपका नंबर यहाँ दिखेगा।", "Your number shows here as soon as they accept.")}</p>`;
    else if (o.skipped) pos = `<p class="tok-pos tok-end">⏭ ${L("नंबर आने पर आप नहीं मिले, इसलिए बारी छोड़ दी गई। दोबारा बुक करें।", "You weren't there when your number came, so your turn was skipped. Please book again.")}</p>`;
    else if (ended) pos = `<p class="tok-pos tok-end">${AK.ST_ICON[o.status] || "✖"} ${esc(t("status_" + o.status))}${o.reason ? ` — ${esc(o.reason)}` : ""}</p>`;
    else if (done) pos = `<p class="tok-pos tok-done">✅ ${L("सेवा पूरी हुई। धन्यवाद! 🙏", "Service completed. Thank you! 🙏")}</p>`;
    else if (!tk.today) pos = `<p class="tok-pos">${L(`यह टोकन ${dayTxt} का था`, `This token was for ${dayTxt}`)}</p>`;
    else if (o.status !== "pending") pos = `<p class="tok-pos tok-now">✂️ ${L("आपकी बारी — सेवा चल रही है", "Your turn — service in progress")}</p>`;
    else if (tk.ahead === 0) pos = `<p class="tok-pos tok-next">🔔 ${L("अगला नंबर आपका है!", "You're next!")}</p>`;
    else pos = `<p class="tok-pos"><b class="tok-ahead-n">${tk.ahead}</b> ${tk.ahead === 1 ? L("व्यक्ति आपसे आगे", "person ahead of you") : L("लोग आपसे आगे", "people ahead of you")}</p>`;
    const live = !ended && !done && tk.today; // a request still waiting for Accept keeps polling too
    page.innerHTML = `<p class="back-row"><a href="/track${esc(location.search)}">← ${esc(L("मेरी बुकिंग", "My bookings"))}</a></p>
      <section class="tok-card" aria-live="polite">
        <p class="tok-shop">${esc(AK.TYPES[AK.shopType]?.icon || "💇")} ${esc(shopName)}</p>
        <p class="tok-lbl">${L("आपका नंबर", "Your number")}</p>
        <p class="tok-no${tk.no == null ? " tok-no-wait" : ""}" id="tokNo">${tk.no == null ? "…" : tk.no}</p>
        ${pos}
        ${!req && live && o.status === "pending" && tk.eta_min > 0 ? `<p class="tok-eta" id="tokEta">⏱️ ${L(`लगभग ${tk.eta_min} मिनट`, `~${tk.eta_min} min wait`)}</p>` : ""}
        ${!req && live && tk.source === "online" && o.status === "pending" ? `<p class="tok-acc">✅ ${L(`सैलून ने आपकी बुकिंग स्वीकार की — टोकन #${tk.no}${tk.eta_min > 0 ? `, लगभग ${tk.eta_min} मिनट` : ""}`, `Your booking is accepted. Token #${tk.no}${tk.eta_min > 0 ? `, about ${tk.eta_min} min` : ""}.`)}</p>` : ""}
        ${tk.source === "online" && live && o.status === "pending" ? `<p class="tok-ontime">🕒 ${L("कृपया समय पर पहुँचें; नंबर आने पर आप नहीं मिले तो आपकी बारी छोड़ी जा सकती है।", "Please reach on time; if you're not there when your number comes, your turn may be skipped.")}</p>` : ""}
        <p class="tok-svc">${svcs}</p>
        <p class="tok-meta">${SALON ? `👤 ${esc(o.customer_name)}${o.phone_masked ? ` · ${esc(o.phone_masked)}` : ""}` : `${esc(o.customer_name)} · ${esc(o.phone_masked)} · ${money(o.total_paise)}`}<br><span class="code">${esc(o.code)}</span> · 📅 ${dayTxt}</p>
        ${live ? `<p class="tok-live"><i aria-hidden="true"></i> ${L("हर 15 सेकंड में अपने आप अपडेट होता है", "Updates on its own every 15 seconds")}</p>` : ""}
      </section>
      ${live ? `<div id="notifBox"></div>` : ""}
      ${shopBtns}${cancelBox}${rateBox}
      <p class="hint">${SALON ? "" : `💵 ${L("पैसे दुकान पर दें", "Pay at the shop")} · `}${L("यह लिंक सेव रहता है — \"मेरी बुकिंग\" से फिर खोलें।", "This link is saved — reopen it from \"My bookings\".")}</p>`;
    const cb = document.getElementById("cancelBtn");
    if (cb) cb.onclick = async () => { if (!confirm(L("क्या आप यह बुकिंग रद्द करना चाहते हैं?","Cancel this booking?"))) return; cb.disabled = true;
      try { await api(`/api/orders/${code}/cancel`, {method:"POST", headers:{"x-order-token": token}, body:{}}); AK.toast(L("बुकिंग रद्द हो गई","Booking cancelled")); detail(code, token); }
      catch (x) { AK.toast(x.message); detail(code, token); } };
    const rf = document.getElementById("rateF");
    if (rf) { let stars = 0; rf.querySelector(".star-pick").onclick = e => { const b = e.target.closest("[data-star]"); if (!b) return; stars = Number(b.dataset.star); rf.querySelectorAll("[data-star]").forEach(x => { const on = Number(x.dataset.star) <= stars; x.classList.toggle("on", on); x.setAttribute("aria-checked", String(Number(x.dataset.star) === stars)); }); };
      rf.onsubmit = async e => { e.preventDefault(); if (!stars) { document.getElementById("rerr").textContent = L("स्टार चुनें","Pick the stars"); return; }
        try { await api(`/api/orders/${code}/rating`, {method:"POST", headers:{"x-order-token": token}, body:{stars, comment: document.getElementById("rc").value}}); AK.toast(L("धन्यवाद! 🙏","Thank you! 🙏")); detail(code, token); }
        catch (x) { document.getElementById("rerr").textContent = x.message; } }; }
    if (live) AK.notifyBox(document.getElementById("notifBox"), {code, token}, {token: true});
    clearTimeout(timer); if (live) timer = setTimeout(show, 15000);
  }
  async function show(){
    applyT(); AK.paintLang();
    if (SALON) { const mh = document.querySelector("[data-salon-back]"); if (mh) mh.textContent = L("और सेवाएँ बुक करें", "Book more services"); }
    AK.setBadge("cart", cartCount()); AK.setBadge("orders", AK.cachedActiveCount());
    const op = /^#open=(AK-[A-Z0-9]{6})$/.exec(location.hash);   // from a notification tap
    if (op) { const f = AK.myOrders().find(x => x.code === op[1]); if (f) { history.replaceState(null, "", `#${f.code}.${f.token}`); return detail(f.code, f.token); } }
    const m = /^#(AK-[A-Z0-9]{6})\.([a-f0-9]{48})$/.exec(location.hash);
    if (m) return detail(m[1], m[2]);
    return list();
  }
  window.addEventListener("hashchange", show);
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.type === "ak-push") show(); });
  document.getElementById("langBtn").onclick = () => { AK.setLang(AK.lang === "en" ? "hi" : "en"); show(); };
  show();
})();
