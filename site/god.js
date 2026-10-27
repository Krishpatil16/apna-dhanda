// v10.15 👑 God Mode — the developer's control centre (only /dev, behind the dev login).
// Front = a clean dashboard (numbers, what needs attention, a tile grid). Everything else lives inside its own section.
// Reuses dev.js helpers (window.DevCore) and the older dev screens; never touches shopkeeper or customer pages.
(function(){
  const D = window.DevCore; if (!D) return;
  const {api, esc, num, ist, ago, toast, modal, ask, authFail, go} = D;
  const $ = s => document.querySelector(s);
  const app = D.app;
  const rs = p => p == null ? "—" : "₹" + (p / 100).toLocaleString("en-IN", {maximumFractionDigits: 2});
  const V = window.GodViews = {};
  const S = window.GodState = {shopId: null, shopTab: "overview"};
  const TITLE = {"g-shops": "🏪 Shops", "g-shop": "🏪 Shop", "g-orders": "🧾 Orders & bookings", "g-customers": "👥 Customers", "g-notify": "📣 Notifications", "g-website": "🌐 Website",
    "g-catalog": "✂️ Shop types & catalogue", "g-reports": "📊 Reports", "g-rules": "⚙️ Rules & settings", "g-system": "🛡️ System", "g-activity": "🔔 Activity", "g-features": "✨ Features",
    shops: "✅ Approvals & plans", notify: "📢 Notices to shop panels", payments: "💰 Payments", platform: "💸 Plan & UPI", landing: "🏠 Landing page", cloud: "☁️ Cloud usage",
    audit: "📜 Shop audit", health: "❤️ Health", errors: "⚠️ Errors", dukaan: "📊 Shop-wise report"};
  const PARENT = {"g-shop": "g-shops", landing: "g-website", platform: "g-rules", cloud: "g-rules", health: "g-system", errors: "g-system", audit: "g-system", dukaan: "g-reports", notify: "g-notify"};
  let ICON = {kirana: "🛒", restaurant: "🍽️", salon: "💇", clinic: "🩺", repair: "🔧", other: "🏪"}, TYPES = [];
  const NT = a => (a || []).map(t => ({...t, key: t.key || t.type}));
  const typeName = k => (TYPES.find(t => t.key === k) || {}).short_en || k;
  const fail = e => { if (!authFail(e)) app.innerHTML = `<div class="g-err"><span aria-hidden="true">⚠️</span><p>${esc(e.message)}</p><button class="g-btn" id="gRetry">Try again</button></div>`; const b = $("#gRetry"); if (b) b.onclick = () => go(D.tab); };
  const loading = () => { app.innerHTML = `<div class="g-skel"><i></i><i></i><i></i><i></i></div>`; };
  const here = t => D.tab === t;
  const sw = (id, on, label) => `<label class="g-sw"><input type="checkbox" id="${id}" ${on ? "checked" : ""}><span class="g-sw-t" aria-hidden="true"></span><span class="g-sw-l">${label}</span></label>`;
  const seg = (name, opts, cur) => `<div class="g-seg" role="group">${opts.map(([v, l]) => `<button type="button" data-${name}="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${l}</button>`).join("")}</div>`;
  const statusPill = st => ({pending: `<span class="g-pill amber">New</span>`, accepted: `<span class="g-pill blue">Accepted</span>`, preparing: `<span class="g-pill blue">Preparing</span>`, ready: `<span class="g-pill blue">Ready</span>`,
    out_for_delivery: `<span class="g-pill blue">On the way</span>`, delivered: `<span class="g-pill green">Done</span>`, cancelled: `<span class="g-pill gray">Cancelled</span>`, rejected: `<span class="g-pill red">Rejected</span>`})[st] || `<span class="g-pill gray">${esc(st)}</span>`;
  async function go2(t, opts = {}){ if (opts.shopId) S.shopId = opts.shopId; go(t); }
  document.body.classList.add("god");

  // ---------- top bar: back + title (every section except Home) ----------
  window.GodHooks = {
    nav(t){
      const home = t === "home"; document.body.classList.toggle("g-home", home);
      const b = $("#gBack"); if (b) { b.hidden = home; $("#gTitle").textContent = TITLE[t] || ""; }
      closeBell();
      if (t === "g-shop" && S.shopId) { try { history.replaceState(null, "", "#shop-" + S.shopId); } catch {} }
    },
    pulse(r){ setBell(r.events ? r.events.unread : 0); }
  };
  $("#gBackBtn").onclick = () => go(PARENT[D.tab] || "home");
  $("#gHomeBtn").onclick = () => go("home");
  { const m = /^#shop-(\d+)$/.exec(location.hash || ""); if (m) S.shopId = Number(m[1]); }

  // ---------- 🔔 bell: a small dropdown in the corner (last 20), mark all read, view all ----------
  const bell = $("#gBell"), drop = $("#gDrop");
  function setBell(n){ const i = $("#gBellN"); if (!i) return; i.hidden = !n; i.textContent = n > 99 ? "99+" : String(n || ""); bell.setAttribute("aria-label", n ? `Notifications, ${n} unread` : "Notifications"); }
  const EVGO = u => { const m = /#([\w-]+)/.exec(u || ""); const h = m ? m[1] : ""; if (h === "waiting") return "shops"; return ["shops", "payments", "notify", "errors"].includes(h) ? h : "g-activity"; };
  function closeBell(){ if (!drop || drop.hidden) return; drop.hidden = true; bell.setAttribute("aria-expanded", "false"); }
  async function openBell(){
    drop.hidden = false; bell.setAttribute("aria-expanded", "true");
    drop.innerHTML = `<div class="g-dh"><b>Notifications</b><button type="button" class="g-x" id="gdX" aria-label="Close">✕</button></div><div class="g-dl"><p class="g-muted g-pad">Loading…</p></div>`;
    $("#gdX").onclick = closeBell;
    let r; try { r = await api("/api/dev/events?limit=20"); } catch (e) { if (authFail(e)) return; drop.querySelector(".g-dl").innerHTML = `<p class="g-err-s">${esc(e.message)}</p>`; return; }
    if (drop.hidden) return; setBell(r.unread);
    drop.innerHTML = `<div class="g-dh"><b>Notifications ${r.unread ? `<i class="g-dn">${r.unread} new</i>` : ""}</b><button type="button" class="g-x" id="gdX" aria-label="Close">✕</button></div>
      <div class="g-dl">${r.events.map(e => `<button type="button" class="g-di ${e.read ? "" : "unread"}" data-ev="${e.id}" data-go="${esc(EVGO(e.url))}"><span class="g-dic" aria-hidden="true">${esc(e.icon)}</span><span class="g-dit"><b>${esc(String(e.title || "").replace(/^[^\w\s\u0900-\u097F]+\s*/u, ""))}</b><small>${esc(ago(e.created_at))}${e.body ? " · " + esc(e.body) : ""}</small></span></button>`).join("")
        || `<div class="g-empty-s"><span aria-hidden="true">🌙</span><p>All quiet. Nothing new.</p></div>`}</div>
      <div class="g-df"><button type="button" class="g-link" id="gdAll" ${r.unread ? "" : "disabled"}>✓ Mark all read</button><button type="button" class="g-link" id="gdView">View all activity →</button></div>`;
    $("#gdX").onclick = closeBell;
    $("#gdAll").onclick = async () => { try { await api("/api/dev/events/read", {method: "POST", body: {all: true}}); setBell(0); drop.querySelectorAll(".g-di.unread").forEach(x => x.classList.remove("unread")); $("#gdAll").disabled = true; const dn = drop.querySelector(".g-dn"); if (dn) dn.remove(); toast("All marked read"); } catch (e) { toast(e.message); } };
    $("#gdView").onclick = () => { closeBell(); go("g-activity"); };
    drop.querySelectorAll("[data-ev]").forEach(b => b.onclick = () => { api("/api/dev/events/read", {method: "POST", body: {ids: [Number(b.dataset.ev)]}}).catch(() => {}); closeBell(); go(b.dataset.go); });
  }
  bell.onclick = e => { e.stopPropagation(); drop.hidden ? openBell() : closeBell(); };
  document.addEventListener("click", e => { if (!drop.hidden && !drop.contains(e.target) && e.target !== bell) closeBell(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeBell(); });
  new MutationObserver(() => { bell.hidden = !document.body.classList.contains("god-in"); if (bell.hidden) closeBell(); }).observe(document.body, {attributes: true, attributeFilter: ["class"]});

  // ---------- 🏠 Home: a few numbers, what needs attention, and the tile grid ----------
  const TILES = [
    ["g-features", "✨", "Features", "Everything + what's next", "t0"], ["g-shops", "🏪", "Shops", "Every shop, every detail", "t1"], ["g-orders", "🧾", "Orders & bookings", "Across all shops", "t2"],
    ["g-customers", "👥", "Customers", "Who orders where", "t3"], ["g-notify", "📣", "Notifications", "Push + notices", "t4"],
    ["g-website", "🌐", "Website", "Landing, banner, directory", "t5"], ["g-catalog", "✂️", "Shop types", "Salon catalogue", "t6"],
    ["g-reports", "📊", "Reports", "Charts & top shops", "t7"], ["g-rules", "⚙️", "Rules & settings", "Plans, trial, password", "t8"],
    ["g-system", "🛡️", "System", "Health, backup, audit", "t9"], ["g-activity", "🔔", "Activity", "Full feed", "t10"],
    ["shops", "✅", "Approvals", "Plans & waiting shops", "t11"], ["payments", "💰", "Payments", "Verify UTRs", "t12"]];
  function spark(series, key){
    const w = 300, h = 54, n = series.length, max = Math.max(1, ...series.map(s => s[key])); const bw = w / n;
    return `<svg class="g-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${series.map((s, i) => { const bh = Math.max(2, Math.round((s[key] / max) * (h - 6))); return `<rect x="${(i * bw + 2).toFixed(1)}" y="${h - bh}" width="${(bw - 4).toFixed(1)}" height="${bh}" rx="3" class="${i === n - 1 ? "now" : ""}"></rect>`; }).join("")}</svg>`;
  }
  const hello = () => { const h = Number(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata", hour: "numeric", hour12: false})); return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };
  V.home = async function(){
    loading();
    let r; try { r = await api("/api/dev/god/overview"); } catch (e) { return fail(e); } if (!here("home")) return;
    TYPES = NT(r.types); NT(r.types).forEach(t => { ICON[t.key] = t.icon; }); setBell(r.unread);
    const types = Object.entries(r.shops.by_type).sort((a, b) => b[1] - a[1]);
    const tot14 = r.series.reduce((a, s) => a + s.orders, 0);
    const tileNote = {"g-shops": `${r.shops.total} shops`, "g-orders": `${r.today.orders + r.today.bookings} today`, "g-customers": `${num(r.customers)} people`, "g-activity": r.unread ? `${r.unread} unread` : "All read",
      shops: (r.attention.find(a => a.kind === "waiting") || {}).label || "Nothing waiting", payments: (r.attention.find(a => a.kind === "pay") || {}).label || "Nothing to verify"};
    app.innerHTML = `<section class="g-hero"><div><small>${esc(hello())}, Krish</small><h1>Your whole platform, <em>one place.</em></h1>
        <p><span class="g-live"><i></i>${num(r.shops.open_now)} open now</span> · ${num(r.shops.live)} live shops · v${esc(r.version)}</p></div><span class="g-crown" aria-hidden="true">👑</span></section>
      <section class="g-stats" aria-label="Today">
        <article class="g-stat s1"><small>🏪 Shops</small><b>${num(r.shops.total)}</b><div class="g-types">${types.map(([k, n]) => `<span title="${esc(typeName(k))}">${ICON[k] || "🏪"} ${n}</span>`).join("")}</div></article>
        <article class="g-stat s2"><small>🟢 Open now</small><b>${num(r.shops.open_now)}</b><span class="g-sub">of ${num(r.shops.live)} live</span></article>
        <article class="g-stat s3"><small>🧾 Today</small><b>${num(r.today.orders + r.today.bookings)}</b><span class="g-sub">${num(r.today.orders)} orders · ${num(r.today.bookings)} bookings</span></article>
        <article class="g-stat s4"><small>👀 Visits today</small><b>${num(r.today.visits)}</b><span class="g-sub">${num(r.customers)} customers in all</span></article>
      </section>
      <section class="g-attn" aria-label="Needs attention">${r.attention.length ? r.attention.map(a => `<button type="button" class="g-chip k-${esc(a.kind)}" data-go="${esc(a.go)}"><b>${num(a.n)}</b>${esc(a.label.replace(/^\d+\s/, ""))} →</button>`).join("") : `<span class="g-chip ok">✨ All clear. Nothing needs you right now.</span>`}</section>
      <section class="g-trend"><div class="g-trend-h"><b>Last 14 days</b><small>${num(tot14)} orders & bookings</small></div>${spark(r.series, "orders")}<div class="g-trend-f"><span>14 days ago</span><span>today</span></div></section>
      <section class="g-tiles" aria-label="Sections">${TILES.map(([t, ic, name, sub, cls]) => `<button type="button" class="g-tile ${cls}" data-go="${t}"><span class="g-ti" aria-hidden="true">${ic}</span><b>${esc(name)}</b><small>${esc(tileNote[t] || sub)}</small></button>`).join("")}</section>`;
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { const g = b.dataset.go; if (g === "orders") { S.ordF = {status: "pending"}; return go("g-orders"); } go(g); });
  };

  // ---------- ✨ Features: every capability in one place — live ones with a control or a deep link, coming ones as OFF switches ----------
  const COMING = [
    ["book_ahead", "📅", "Book ahead when closed", "Customers book for later even while the shop is closed"],
    ["staff_choice", "💈", "Staff / barber choice", "Pick who serves you"],
    ["reviews", "⭐", "Reviews & ratings", "Stars and short reviews on each shop"],
    ["offers", "🏷️", "Offers & coupons", "Discount codes and festival offers"],
    ["maps", "📍", "Google Maps & directions", "Shop location pin + one-tap directions"],
    ["whatsapp_share", "💬", "WhatsApp share button", "Share the shop or an order on WhatsApp"],
    ["receipt_pdf", "🧾", "Bill / receipt PDF", "A printable bill for each order"],
    ["charts", "📈", "Charts", "Busy time, top service, week / month"],
    ["timings_holidays", "🗓️", "Shop timings & holiday", "Weekly timings and a holiday day"],
    ["new_types", "🧵", "New shop types", "Tailor, gym, tuition, medical"]];
  V["g-features"] = async function(){
    loading();
    let r; try { r = await api("/api/dev/god/features"); } catch (e) { return fail(e); } if (!here("g-features")) return;
    const c = r.counts, cr = r.cron, ws = r.website, f = r.flags || {};
    const types = (r.types || []).filter(t => t.shops > 0).map(t => `${t.icon} ${t.shops}`).join(" · ") || "—";
    const LIVE = [
      ["🏪", "Shop types", `${(r.types || []).length} types · ${types}`, [["Types & catalogue", "g-catalog"]]],
      ["🔗", "Shop link & QR poster", "Every shop has its own /s/ link and an A4 QR poster", [["Pick a shop → QR", "g-shops"]]],
      ["🧾", "Customer orders & bookings", `${num(c.orders)} so far`, [["Open orders", "g-orders"]]],
      ["🎟️", "Salon token, queue & ETA", `${num(c.queued)} in a queue right now · ${num(c.salons)} salons`, [["See the queue", "g-orders"]]],
      ["✅", "Accept / reject · auto-accept · skip · open / close", "Per shop: Orders tab + the Open switch", [["Pick a shop", "g-shops"]]],
      ["🖼️", "Price, photo, stock & variants", `${num(c.variants)} variants · ${num(c.images)} photos`, [["Pick a shop → Items", "g-shops"]]],
      ["🔔", "Push notifications", `${num(c.push_devices)} phones subscribed`, [["Send one", "g-notify"]]],
      ["🇮🇳", "Hindi / English", "Every customer and shopkeeper page, both languages", [["Open the site", "@/"]]],
      ["📊", "Reports", "Orders, money and top shops", [["Open reports", "g-reports"]]],
      ["🎁", "Trial shop & message all shopkeepers", "Free trial rules + a notice to every shop panel", [["Trial & plans", "g-rules"], ["Message all", "notify"]]],
      ["⏰", "Cron reminders", (cr.last_run ? `Last ran ${ago(cr.last_run)} · ${num(cr.last_created || 0)} reminders` : "Not run yet") + ` · ${cr.ist}`, [["System", "g-system"]], cr.does],
      ["📲", "Install as an app (PWA)", "Customers, shopkeepers and this panel install from the browser", [["How", "#pwa"]]]];
    const item = ([ic, name, sub, acts, note]) => `<article class="g-feat"><span class="g-feat-i" aria-hidden="true">${ic}</span><div class="g-feat-m"><b>${esc(name)}</b><small>${esc(sub)}</small>${note ? `<em>${esc(note)}</em>` : ""}
      <div class="g-feat-a">${acts.map(([l, to]) => `<button type="button" class="g-btn sm" data-fgo="${esc(to)}">${esc(l)} ›</button>`).join("")}</div></div><span class="g-pill green">Live</span></article>`;
    app.innerHTML = `<section class="g-hero g-hero-s"><small>✨ Features</small><h1>Everything Apna Dhanda does, <em>in one place</em></h1><p>${LIVE.length} live · ${COMING.length} coming next (all OFF until you switch them on)</p><span class="g-crown" aria-hidden="true">👑</span></section>
      <h3 class="g-h3">🟢 Live now <i>· tap to control</i></h3><div class="g-list">${LIVE.map(item).join("")}</div>
      <h3 class="g-h3">🌐 Website controls</h3>
      <div class="g-list">
        <button type="button" class="g-tilebar" data-fgo="landing"><span aria-hidden="true">🎨</span><span><b>Text & colour</b><small>Main page words, colours, sections</small></span><i aria-hidden="true">›</i></button>
        <button type="button" class="g-tilebar" data-fgo="g-website" data-sub="banner"><span aria-hidden="true">📢</span><span><b>Banner</b><small>${ws.banner && ws.banner.on ? "ON · " + esc(ws.banner.text_en || ws.banner.text_hi || "") : "Off"}</small></span><i aria-hidden="true">›</i></button>
        <button type="button" class="g-tilebar" data-fgo="g-website" data-sub="maint"><span aria-hidden="true">🛠️</span><span><b>Maintenance mode</b><small>${ws.maintenance.on ? "ON · customers see “back soon”" : "Off"}</small></span><i aria-hidden="true">›</i></button>
      </div>
      <h3 class="g-h3">🛡️ System</h3>
      <article class="g-card g-zip"><h3>📦 Download full source zip</h3>
        <p class="g-muted">The live Worker can't hand out its own source: Cloudflare keeps only the built script, and putting the code on a public URL is a risk. The full source (no passwords, no backups) lives in <b>apna-dhanda-full-source.zip</b>.</p>
        <ol class="g-steps"><li>Ask Tab: “send me the full source zip”.</li><li>Unzip, then <code>npm install</code> and <code>npm test</code>.</li><li>Deploy with <code>npx wrangler deploy --config wrangler.apnadhanda.toml</code>.</li></ol></article>
      <h3 class="g-h3">🚀 Coming next <i>· switches stay OFF until each one ships</i></h3>
      <div class="g-coming">${COMING.map(([k, ic, name, sub]) => `<article class="g-soon"><span class="g-feat-i" aria-hidden="true">${ic}</span><div class="g-feat-m"><b>${esc(name)}</b><small>${esc(sub)}</small><span class="g-pill gold">Coming next</span></div>
        <label class="g-sw mini" title="Ships in a later version"><input type="checkbox" disabled ${f[k] ? "checked" : ""} aria-label="${esc(name)}: not built yet"><span class="g-sw-t" aria-hidden="true"></span></label></article>`).join("")}</div>
      <p class="g-muted g-pad">Each of these ships later as a feature that is OFF by default. Customers and shopkeepers see nothing until you flip it here.</p>`;
    app.querySelectorAll("[data-fgo]").forEach(b => b.onclick = () => { const to = b.dataset.fgo;
      if (to === "@/") return window.open("/", "_blank", "noopener");
      if (to === "#pwa") { const md = modal(`<h3>📲 Install as an app</h3><p class="g-muted">On Android Chrome: open the page → ⋮ menu → <b>Install app</b> (or “Add to Home screen”). On iPhone Safari: Share → <b>Add to Home Screen</b>. Works for the customer site (/shops), each shop page, the shopkeeper panel (/admin) and this God Mode panel.</p><button type="button" class="g-btn gold full" id="gPwaOk">OK</button>`); md.q("#gPwaOk").onclick = md.close; return; }
      if (b.dataset.sub) V["g-website"].sub = b.dataset.sub;
      go(to); });
  };

  // ---------- shared: order / booking actions (all go through the shop's own admin API, as the developer) ----------
  const asApi = (sid, path, opts) => api("/api/dev/god/as/" + sid + path, opts);
  function orderBtns(o, mode){
    const b = [];
    // v10.15.1: a booking already in the queue (token) is "Waiting": its next step is Start service, not Accept
    if (o.status === "pending" && mode === "booking" && o.token_no != null) b.push(`<button class="g-btn sm ok" data-oa="accept">✂️ Start</button>`, `<button class="g-btn sm" data-oa="skip">⏭ Skip</button>`);
    else if (o.status === "pending") { b.push(`<button class="g-btn sm ok" data-oa="accept">✓ Accept</button>`, `<button class="g-btn sm no" data-oa="reject">✕ Reject</button>`); if (o.token_no != null) b.push(`<button class="g-btn sm" data-oa="skip">⏭ Skip</button>`); }
    if (["pending", "accepted", "preparing", "ready", "out_for_delivery"].includes(o.status) && !(o.status === "pending" && o.token_no == null)) b.push(`<button class="g-btn sm ok2" data-oa="done">🏁 Done</button>`);
    return b.join("");
  }
  async function orderAct(sid, o, mode, act){
    const id = o.id; const st = (s, from, extra = {}) => asApi(sid, `/api/admin/orders/${id}/status`, {method: "POST", body: {status: s, from, ...extra}});
    if (act === "accept") { if (mode === "booking" && o.token_no == null) await asApi(sid, `/api/admin/orders/${id}/queue`, {method: "POST", body: {}}); else await st("accepted", "pending"); return mode === "booking" && o.token_no != null ? "Service started ✂️" : "Accepted ✓"; }
    if (act === "reject") { if (!await ask(`Reject ${o.code}?`, "The customer sees it was not accepted.", "✕ Reject")) return null; await st("rejected", "pending", {reason: "Not available right now"}); return "Rejected"; }
    if (act === "skip") { if (!await ask(`Skip ${o.code}?`, "Not here: the line moves on.", "⏭ Skip", "b-gray")) return null; await asApi(sid, `/api/admin/orders/${id}/skip`, {method: "POST", body: {}}); return "Skipped"; }
    if (act === "done") { let s = o.status;
      if (s === "pending") { await st("accepted", "pending"); s = "accepted"; }
      if (s === "accepted") { await st("ready", "accepted"); s = "ready"; }
      await st("delivered", s); return "Done 🏁"; }
  }
  const itemsLine = o => (o.items || []).map(i => `${esc(i.name)}${i.label && i.label !== "Regular" ? " " + esc(i.label) : ""}${i.qty > 1 ? " ×" + i.qty : ""}`).join(", ");
  function orderCard(o, mode, withShop){
    return `<article class="g-ord" data-oid="${o.id}"><div class="g-ord-h"><b>${o.token_no != null ? `<span class="g-tok">#${o.token_no}</span>` : ""}${esc(o.customer_name || "—")}</b>${mode === "booking" && o.status === "pending" && o.token_no != null ? `<span class="g-pill amber">⏳ Waiting</span>` : statusPill(o.status)}</div>
      <p class="g-ord-i">${itemsLine(o) || "<span class='g-muted'>No items</span>"}</p>
      <div class="g-ord-m"><span>${esc(o.code)}</span>${withShop ? `<span>${ICON[o.type] || "🏪"} ${esc(o.shop_name)}</span>` : ""}<span>${esc(ago(o.created_at))}</span>${mode === "order" && o.total_paise ? `<span>${rs(o.total_paise)}</span>` : ""}${o.is_test ? `<span class="g-pill gray">test</span>` : ""}</div>
      <div class="g-ord-a">${orderBtns(o, mode)}</div></article>`;
  }
  function wireOrders(root, list, reload){
    root.querySelectorAll("[data-oa]").forEach(b => b.onclick = async () => {
      const card = b.closest("[data-oid]"); const o = list.find(x => x.id === Number(card.dataset.oid)); if (!o) return;
      card.querySelectorAll("button").forEach(x => x.disabled = true);
      try { const msg = await orderAct(o.shop_id, o, o.mode, b.dataset.oa); if (msg) toast(msg); } catch (e) { if (!authFail(e)) toast(e.message); }
      reload();
    });
  }

  // ---------- 🏪 Shops: search + type filter ----------
  V["g-shops"] = async function(){
    loading();
    let r; try { r = await api("/api/dev/shops"); } catch (e) { return fail(e); } if (!here("g-shops")) return;
    TYPES = NT(r.shop_types) || TYPES; (NT(r.shop_types) || []).forEach(t => { ICON[t.key] = t.icon; });
    const f = V["g-shops"].f || (V["g-shops"].f = {q: "", type: "all"});
    const counts = {}; r.shops.forEach(s => { counts[s.type] = (counts[s.type] || 0) + 1; });
    app.innerHTML = `<div class="g-tools"><input type="search" id="gsQ" class="g-in" placeholder="🔍 Search name, link, owner…" value="${esc(f.q)}" autocomplete="off">
      <div class="g-chips" id="gsT"><button type="button" data-t="all" aria-pressed="${f.type === "all"}">All <i>${r.shops.length}</i></button>${Object.keys(counts).map(k => `<button type="button" data-t="${esc(k)}" aria-pressed="${f.type === k}">${ICON[k] || "🏪"} ${esc(typeName(k))} <i>${counts[k]}</i></button>`).join("")}</div></div>
      <div class="g-list" id="gsL"></div>`;
    const draw = () => { const q = f.q.trim().toLowerCase();
      const list = r.shops.filter(s => (f.type === "all" || s.type === f.type) && (!q || [s.name, s.slug, s.owner_name].some(x => String(x || "").toLowerCase().includes(q))));
      $("#gsL").innerHTML = list.map(s => `<button type="button" class="g-shop" data-sid="${s.id}"><span class="g-si" aria-hidden="true">${ICON[s.type] || "🏪"}</span>
        <span class="g-sm"><b>${esc(s.name)}</b><small>/s/${esc(s.slug)} · ${esc(typeName(s.type))}${s.orders_today ? ` · ${s.orders_today} today` : ""}</small></span>
        <span class="g-sr">${s.effective_status === "active" ? (s.open_now ? `<span class="g-dot on" title="Open now"></span>` : `<span class="g-dot" title="Closed"></span>`) : `<span class="g-pill ${s.status === "pending" ? "amber" : "gray"}">${esc((D.SVC[s.effective_status] || [s.effective_status])[0])}</span>`}${s.is_test ? `<span class="g-pill gray">TEST</span>` : ""}</span></button>`).join("")
        || `<div class="g-empty-s"><span aria-hidden="true">🔎</span><p>No shop matches.</p></div>`;
      $("#gsL").querySelectorAll("[data-sid]").forEach(b => b.onclick = () => go2("g-shop", {shopId: Number(b.dataset.sid)})); };
    draw();
    $("#gsQ").oninput = e => { f.q = e.target.value; draw(); };
    $("#gsT").onclick = e => { const b = e.target.closest("[data-t]"); if (!b) return; f.type = b.dataset.t; $("#gsT").querySelectorAll("[data-t]").forEach(x => x.setAttribute("aria-pressed", String(x === b))); draw(); };
  };

  // ---------- 🏪 One shop: everything about it, in tabs ----------
  const SHOP_TABS = [["overview", "Overview"], ["items", "Items"], ["orders", "Orders"], ["customers", "Customers"], ["edit", "Edit"], ["danger", "More"]];
  V["g-shop"] = async function(){
    const sid = S.shopId; if (!sid) return go("g-shops");
    loading();
    let r; try { r = await api("/api/dev/god/shop/" + sid); } catch (e) { return fail(e); } if (!here("g-shop") || S.shopId !== sid) return;
    TYPES = NT(r.types); NT(r.types).forEach(t => { ICON[t.key] = t.icon; });
    const sh = r.shop, se = r.settings; $("#gTitle").textContent = `${ICON[sh.type] || "🏪"} ${sh.name}`;
    const tab = SHOP_TABS.some(t => t[0] === S.shopTab) ? S.shopTab : "overview";
    const theme = (sh.app && sh.app.theme) || "#1f6b3a";
    app.innerHTML = `<section class="g-sh-head" style="--sh:${esc(theme)}"><div class="g-sh-top"><span class="g-sh-ic" aria-hidden="true">${ICON[sh.type] || "🏪"}</span><div><h2>${esc(sh.name)}</h2>
        <small>${esc(sh.type_info ? sh.type_info.en : sh.type)} · <a href="${esc(sh.link)}" target="_blank" rel="noopener">/s/${esc(sh.slug)}</a></small></div></div>
        <div class="g-sh-pills">${r.open_now ? `<span class="g-pill green">● Open now</span>` : `<span class="g-pill gray">Closed</span>`}<span class="g-pill ${sh.status === "active" ? "blue" : sh.status === "pending" ? "amber" : "red"}">${esc((D.SVC[sh.status] || [sh.status])[0])}</span>${D.subPill(r.sub)}${sh.is_test ? `<span class="g-pill gray">TEST</span>` : ""}</div>
        <div class="g-sh-act"><button class="g-btn gold" id="gsAs">👑 Open as shopkeeper</button><button class="g-btn" id="gsQr">▦ QR</button><button class="g-btn" id="gsCopy">🔗 Copy link</button></div></section>
      <nav class="g-tabs" id="gsTabs">${SHOP_TABS.map(([k, l]) => `<button type="button" data-st="${k}" aria-current="${k === tab ? "page" : "false"}">${l}</button>`).join("")}</nav>
      <div id="gsBody"></div>`;
    $("#gsAs").onclick = () => { location.href = "/dev/as/" + sh.id; };
    $("#gsCopy").onclick = async () => { try { await navigator.clipboard.writeText(sh.customer_url); toast("Link copied"); } catch { toast(sh.customer_url); } };
    $("#gsQr").onclick = () => qrModal(sh);
    $("#gsTabs").onclick = e => { const b = e.target.closest("[data-st]"); if (!b) return; S.shopTab = b.dataset.st; $("#gsTabs").querySelectorAll("[data-st]").forEach(x => x.setAttribute("aria-current", x === b ? "page" : "false")); drawTab(); };
    const reload = () => { if (here("g-shop")) V["g-shop"](); };
    const body = () => $("#gsBody");
    function drawTab(){ const t = S.shopTab;
      if (t === "items") return itemsTab(); if (t === "orders") return ordersTab(); if (t === "customers") return custTab(); if (t === "edit") return editTab(); if (t === "danger") return dangerTab(); return overTab(); }
    function overTab(){ const c = r.counts;
      body().innerHTML = `<div class="g-mini4"><div><b>${num(c.today)}</b><small>today</small></div><div><b>${num(c.orders)}</b><small>all ${sh.mode === "booking" ? "bookings" : "orders"}</small></div><div><b>${num(c.visits7)}</b><small>visits 7d</small></div><div><b>${num(c.admin_devices + c.customer_devices)}</b><small>push devices</small></div></div>
        <div class="g-card"><h3>Shop status</h3>
          ${sw("gsOnline", sh.online, `<b>Shop open</b><small>Customers can order / book${sh.status !== "active" ? " (needs an active shop)" : ""}</small>`)}
          ${sw("gsToday", se.force_closed, `<b>Closed today</b><small>Overrides the hours for today</small>`)}
          ${sh.mode === "booking" ? sw("gsAuto", se.auto_accept, `<b>Auto-accept bookings</b><small>Online requests go straight into the queue</small>`) : ""}
          <div class="g-row">${sh.status === "pending" ? `<button class="g-btn ok" data-sv="approve">✓ Approve</button><button class="g-btn no" data-sv="reject">✕ Reject</button>` : sh.status === "paused" ? `<button class="g-btn ok" data-sv="resume">▶ Activate</button>` : sh.status === "active" ? `<button class="g-btn no" data-sv="pause">⏸ Suspend</button>` : `<button class="g-btn ok" data-sv="approve">✓ Approve</button>`}</div></div>
        <div class="g-card"><h3>Plan</h3><p class="g-muted">${D.subLine(r.sub) || "—"} · ${sh.monthly_paise ? rs(sh.monthly_paise) + "/month" : "no price"}${sh.custom_price ? " (this shop)" : ""}</p>
          <div class="g-row"><button class="g-btn" data-pl="extend">+1 month paid</button><label class="g-inl">Trial ends <input type="date" id="gsTrial" class="g-in sm"></label><button class="g-btn" data-pl="trial_end">Set</button><button class="g-btn no" data-pl="expire_now">End now</button></div></div>
        <div class="g-card"><h3>Shopkeeper login</h3><p class="g-muted">Login: <b>${esc(sh.login || "—")}</b>. A new PIN is shown once; the shopkeeper must change it after logging in.</p><button class="g-btn" id="gsPin">🔑 Generate new PIN</button></div>`;
      const flag = async (body2, msg) => { try { await api("/api/dev/shops/flags", {method: "POST", body: {shop_id: sh.id, ...body2}}); toast(msg); } catch (e) { if (!authFail(e)) toast(e.message); } reload(); };
      $("#gsOnline").onchange = e => flag({online: e.target.checked}, e.target.checked ? "Shop opened" : "Shop closed");
      $("#gsToday").onchange = async e => { try { await asApi(sh.id, "/api/admin/settings", {method: "PUT", body: {force_closed: e.target.checked}}); toast(e.target.checked ? "Closed for today" : "Open as per hours"); } catch (x) { if (!authFail(x)) toast(x.message); } reload(); };
      const au = $("#gsAuto"); if (au) au.onchange = async e => { try { await asApi(sh.id, "/api/admin/settings", {method: "PUT", body: {auto_accept: e.target.checked}}); toast(e.target.checked ? "Auto-accept ON" : "Auto-accept OFF"); } catch (x) { if (!authFail(x)) toast(x.message); } reload(); };
      body().querySelectorAll("[data-sv]").forEach(b => b.onclick = async () => { const a = b.dataset.sv; const L = {approve: "Approve this shop?", reject: "Reject this shop?", pause: "Suspend this shop?", resume: "Activate this shop?"};
        if (!await ask(L[a], a === "pause" ? "Customers see “closed”, orders stop. Nothing is deleted." : sh.name, b.textContent, a === "pause" || a === "reject" ? "b-red" : "b-green")) return;
        try { await api("/api/dev/service", {method: "POST", body: {shop_id: sh.id, action: a}}); toast("Done"); } catch (e) { if (!authFail(e)) toast(e.message); } reload(); });
      body().querySelectorAll("[data-pl]").forEach(b => b.onclick = async () => { const a = b.dataset.pl; const bd = {action: a};
        if (a === "extend") bd.months = 1; if (a === "trial_end") { bd.date = $("#gsTrial").value; if (!bd.date) return toast("Pick a date"); }
        if (a === "expire_now" && !await ask("End the plan now?", "The shop auto-pauses until it is paid.", "End now")) return;
        try { await api(`/api/dev/shops/${sh.id}/subscription`, {method: "POST", body: bd}); toast("Plan updated"); } catch (e) { if (!authFail(e)) toast(e.message); } reload(); });
      $("#gsPin").onclick = async () => { if (!await ask("Make a new PIN?", "The old one stops working at once and the shopkeeper is logged out.", "🔑 Generate", "b-red")) return;
        try { const x = await api(`/api/dev/shops/${sh.id}/reset-password`, {method: "POST", body: {}});
          const m = modal(`<h3>🔑 New PIN (shown once)</h3><p>Login: <b>${esc(x.login)}</b></p><p class="g-pin">${esc(x.password)}</p><p class="g-muted">${esc(x.note || "")}</p><div class="dm-btns"><button class="btn b-gray" id="pinCp">📋 Copy</button><button class="btn b-blue" id="pinOk">Done</button></div>`);
          m.q("#pinCp").onclick = async () => { try { await navigator.clipboard.writeText(x.password); toast("Copied"); } catch {} }; m.q("#pinOk").onclick = m.close;
        } catch (e) { if (!authFail(e)) toast(e.message); } };
    }
    function itemsTab(){
      if (r.salon) { const c = r.salon;
        body().innerHTML = `<p class="g-muted g-pad">Fixed salon catalogue. Price is optional (shown to customers only if set); switch off to hide one for this shop.</p>` + c.groups.map(g => {
          const its = c.services.filter(s => s.group === g.key); if (!its.length) return "";
          return `<div class="g-card"><h3>${esc(g.icon)} ${esc(g.name_en)}</h3>${its.map(s => `<div class="g-item" data-key="${esc(s.key)}"><span class="g-ii" aria-hidden="true">${esc(s.icon)}</span><span class="g-in-n">${esc(s.name_en)}<small>${esc(s.name_hi)}</small></span>
            <label class="g-rs">₹<input type="number" inputmode="decimal" min="0" step="1" class="g-in sm" data-price value="${s.price_paise != null ? s.price_paise / 100 : ""}" placeholder="—" aria-label="Price for ${esc(s.name_en)}"></label>
            <label class="g-sw mini"><input type="checkbox" data-on ${s.on ? "checked" : ""} aria-label="${esc(s.name_en)} on"><span class="g-sw-t"></span></label></div>`).join("")}</div>`; }).join("");
        body().querySelectorAll(".g-item").forEach(row => { const key = row.dataset.key;
          const save = async b => { try { await asApi(sh.id, "/api/admin/salon-services", {method: "PUT", body: {key, ...b}}); toast("Saved ✓"); } catch (e) { if (!authFail(e)) toast(e.message); } };
          const pi = row.querySelector("[data-price]"); let last = pi.value;
          const sp = () => { if (pi.value === last) return; last = pi.value; save({price: pi.value}); };
          pi.onchange = sp; pi.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); sp(); } };
          row.querySelector("[data-on]").onchange = e => save({on: e.target.checked}); });
        return; }
      const items = r.items || [];
      if (!items.length) { body().innerHTML = `<div class="g-empty-s"><span aria-hidden="true">📦</span><p>No items in this shop yet.</p></div>`; return; }
      body().innerHTML = `<input type="search" class="g-in" id="giQ" placeholder="🔍 Search items…"><p class="g-muted g-pad">${items.length} lines. Edit price or stock, press Enter to save. The switch shows / hides that line.</p><div class="g-card" id="giL"></div>`;
      const draw = q => { q = (q || "").toLowerCase();
        $("#giL").innerHTML = items.filter(i => !q || (i.name_en + " " + i.name_hi).toLowerCase().includes(q)).slice(0, 200).map(i => `<div class="g-item" data-vid="${i.variant_id}"><span class="g-ii" aria-hidden="true">${esc(i.icon || "🛍️")}</span><span class="g-in-n">${esc(i.name_en || i.name_hi)}<small>${esc(i.label)}${i.p_active ? "" : " · item hidden"}</small></span>
          <label class="g-rs">₹<input type="number" inputmode="decimal" min="0" step="0.5" class="g-in sm" data-f="price" value="${i.price_paise / 100}" aria-label="Price"></label>
          <label class="g-rs">📦<input type="number" inputmode="numeric" min="0" step="1" class="g-in xs" data-f="stock" value="${i.stock}" aria-label="Stock"></label>
          <label class="g-sw mini"><input type="checkbox" data-f="active" ${i.v_active ? "checked" : ""} aria-label="Visible"><span class="g-sw-t"></span></label></div>`).join("");
        $("#giL").querySelectorAll(".g-item").forEach(row => { const vid = Number(row.dataset.vid);
          const save = async b => { try { const x = await api(`/api/dev/god/shop/${sh.id}/variant`, {method: "POST", body: {variant_id: vid, ...b}}); toast(x.changed ? "Saved ✓" : "No change"); const it = items.find(i => i.variant_id === vid); if (it && x.variant) Object.assign(it, {price_paise: x.variant.price_paise, stock: x.variant.stock, v_active: x.variant.active}); } catch (e) { if (!authFail(e)) toast(e.message); } };
          row.querySelectorAll("input[data-f]").forEach(inp => { const f = inp.dataset.f;
            if (f === "active") inp.onchange = () => save({active: inp.checked});
            else { const go3 = () => save({[f]: inp.value}); inp.onchange = go3; inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); inp.blur(); } }; } }); }); };
      draw(""); $("#giQ").oninput = e => draw(e.target.value);
    }
    function ordersTab(){
      const list = r.orders.map(o => ({...o, shop_id: sh.id, mode: sh.mode}));
      const live = list.filter(o => ["pending", "accepted", "preparing", "ready", "out_for_delivery"].includes(o.status)), past = list.filter(o => !live.includes(o));
      body().innerHTML = `${sh.mode === "booking" ? `<div class="g-card">${sw("goAuto", se.auto_accept, `<b>Auto-accept</b><small>Online requests go straight into the queue</small>`)}</div>` : ""}
        <h3 class="g-h3">Now <i>${live.length}</i></h3><div class="g-list">${live.map(o => orderCard(o, sh.mode)).join("") || `<p class="g-muted g-pad">Nothing waiting.</p>`}</div>
        <h3 class="g-h3">History <i>${past.length}</i></h3><div class="g-list">${past.map(o => orderCard(o, sh.mode)).join("") || `<p class="g-muted g-pad">No history yet.</p>`}</div>
        <p class="g-muted g-pad">Reports, bills and the full queue screen: <a href="/dev/as/${sh.id}">open as shopkeeper</a>.</p>`;
      const au = $("#goAuto"); if (au) au.onchange = async e => { try { await asApi(sh.id, "/api/admin/settings", {method: "PUT", body: {auto_accept: e.target.checked}}); toast(e.target.checked ? "Auto-accept ON" : "Auto-accept OFF"); } catch (x) { if (!authFail(x)) toast(x.message); } };
      wireOrders(body(), list, () => { S.shopTab = "orders"; reload(); });
    }
    function custTab(){
      body().innerHTML = `<p class="g-muted g-pad">${r.customers.length} customers (from orders; there are no customer logins).</p><div class="g-card">${r.customers.map(c => `<div class="g-cust"><span class="g-av" aria-hidden="true">${esc((c.name || "?").slice(0, 1).toUpperCase())}</span><span class="g-in-n">${esc(c.name || "—")}<small>${esc(c.phone_masked || "no phone")} · ${c.orders} ${c.orders > 1 ? "visits" : "visit"} · ${esc(ago(c.last_at))}</small></span>${sh.mode === "order" && c.total_paise ? `<b class="g-amt">${rs(c.total_paise)}</b>` : ""}</div>`).join("") || `<p class="g-muted">No customers yet.</p>`}</div>`;
    }
    function editTab(){
      const tt = (NT(r.types) || []).map(t => `<option value="${esc(t.key)}" ${t.key === sh.type ? "selected" : ""}>${esc(t.icon)} ${esc(t.en)}</option>`).join("");
      body().innerHTML = `<form class="g-card g-form" id="geF" novalidate>
        <label>Shop name<input class="g-in" id="geName" maxlength="80" value="${esc(sh.name)}"></label>
        <label>Link name <small>/s/…  (changing it breaks the old link & QR)</small><input class="g-in" id="geSlug" maxlength="32" value="${esc(sh.slug)}" autocapitalize="off"></label>
        <label>Shop type<select class="g-in" id="geType">${tt}</select></label>
        <label>Owner name<input class="g-in" id="geOwner" maxlength="60" value="${esc(sh.owner_name || "")}"></label>
        <div class="g-2"><label>Shop phone<input class="g-in" id="gePhone" inputmode="tel" value="${esc(se.phone || "")}"></label><label>WhatsApp<input class="g-in" id="geWa" inputmode="tel" value="${esc(se.whatsapp || "")}"></label></div>
        <label>Address<input class="g-in" id="geAddr" maxlength="200" value="${esc(sh.address || se.address || "")}"></label>
        <div class="g-2"><label>Opens<input class="g-in" type="time" id="geOpen" value="${esc(se.open_time || "00:00")}"></label><label>Closes<input class="g-in" type="time" id="geClose" value="${esc(se.close_time || "00:00")}"></label></div>
        <label>Tagline (English)<input class="g-in" id="geTagEn" maxlength="200" value="${esc(se.tagline_en || "")}"></label>
        <label>Tagline (हिंदी)<input class="g-in" id="geTagHi" maxlength="200" value="${esc(se.tagline_hi || "")}"></label>
        <label class="g-color">Theme colour <input type="color" id="geTheme" value="${esc(theme)}"></label>
        <p class="g-muted">Logo, photos and everything else: <a href="/dev/as/${sh.id}">open as shopkeeper</a>. Same open/close hours 00:00–00:00 = always open.</p>
        <p class="g-err-s" id="geErr" role="alert"></p><button class="g-btn gold full" id="geSave">💾 Save changes</button></form>`;
      $("#geF").onsubmit = async e => { e.preventDefault(); const err = $("#geErr"); err.textContent = ""; const btn = $("#geSave"); btn.disabled = true; let n = 0;
        try {
          const name = $("#geName").value.trim(), slug = $("#geSlug").value.trim().toLowerCase();
          if (name !== sh.name || slug !== sh.slug) { if (slug !== sh.slug && !await ask("Change the link?", `Old link /s/${sh.slug} and its QR will stop working.`, "Change link")) { btn.disabled = false; return; }
            await api(`/api/dev/shops/${sh.id}/identity`, {method: "POST", body: {name, slug}}); n++; }
          const want = {owner_name: $("#geOwner").value.trim(), phone: $("#gePhone").value.trim(), whatsapp: $("#geWa").value.trim(), address: $("#geAddr").value.trim(), open_time: $("#geOpen").value || "00:00", close_time: $("#geClose").value || "00:00", tagline_en: $("#geTagEn").value.trim(), tagline_hi: $("#geTagHi").value.trim()};
          const have = {owner_name: sh.owner_name || "", phone: se.phone || "", whatsapp: se.whatsapp || "", address: sh.address || se.address || "", open_time: se.open_time || "00:00", close_time: se.close_time || "00:00", tagline_en: se.tagline_en || "", tagline_hi: se.tagline_hi || ""};
          const diff = Object.fromEntries(Object.entries(want).filter(([k, v]) => v !== have[k]));
          if (Object.keys(diff).length) { await asApi(sh.id, "/api/admin/settings", {method: "PUT", body: diff}); n++; }
          const ty = $("#geType").value; if (ty !== sh.type) { if (!await ask("Change the shop type?", `${typeName(sh.type)} → ${typeName(ty)}. The customer page changes to match.`, "Change type")) { btn.disabled = false; return; }
            await asApi(sh.id, "/api/admin/shop-type", {method: "POST", body: {shop_type: ty, confirm: true}}); n++; }
          const th = $("#geTheme").value; if (th && th.toLowerCase() !== String(theme).toLowerCase()) { await api("/api/dev/shops/app", {method: "POST", body: {shop_id: sh.id, theme: th}}); n++; }
          toast(n ? "Saved ✓" : "Nothing changed"); S.shopTab = "edit"; reload();
        } catch (x) { if (!authFail(x)) err.textContent = x.message; btn.disabled = false; } };
    }
    function dangerTab(){
      body().innerHTML = `<div class="g-card"><h3>Directory</h3>${sw("gdHide", sh.dir_hidden, `<b>Hide from /shops</b><small>The shop's own link still works</small>`)}</div>
        <div class="g-card"><h3>Shop-wise report</h3><p class="g-muted">Orders, visits and logins over time.</p><button class="g-btn" id="gdRep">📊 Open report</button></div>
        <div class="g-card danger"><h3>🗑 Delete shop</h3><p class="g-muted">Deletes the shop and all its data (items, orders, logins, bills). This cannot be undone.</p><button class="g-btn no" id="gdDel">Delete this shop…</button></div>`;
      $("#gdHide").onchange = async e => { try { await api("/api/dev/shops/flags", {method: "POST", body: {shop_id: sh.id, dir_hidden: e.target.checked}}); toast(e.target.checked ? "Hidden from /shops" : "Shown in /shops"); } catch (x) { if (!authFail(x)) toast(x.message); } };
      $("#gdRep").onclick = () => { go("dukaan"); };
      $("#gdDel").onclick = () => delModal(sh);
    }
    drawTab();
  };
  function delModal(sh){
    const norm = v => String(v || "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
    const m = modal(`<h3>🗑 Delete “${esc(sh.name)}”?</h3><p>All its items, orders, customers' bookings, logins and bills go forever.</p>
      <label class="dm-lbl" for="gdIn">Type the shop name to confirm</label><input id="gdIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(sh.name)}">
      <p class="err" id="gdErr"></p><div class="dm-btns"><button type="button" class="btn b-gray" id="gdNo">Cancel</button><button type="button" class="btn b-red" id="gdYes" disabled>🗑 Delete</button></div>`);
    const inp = m.q("#gdIn"), yes = m.q("#gdYes");
    const ok = () => { const t = norm(inp.value); return !!t && (t === norm(sh.name) || t === norm(sh.slug)); };
    inp.oninput = () => { yes.disabled = !ok(); };
    m.q("#gdNo").onclick = m.close;
    yes.onclick = async () => { if (!ok()) return; yes.disabled = true; yes.textContent = "Deleting…";
      try { await api("/api/dev/shops/delete", {method: "POST", body: {shop_id: sh.id, confirm: inp.value}}); m.close(); toast(`${sh.name} deleted`); S.shopId = null; go("g-shops"); }
      catch (e) { if (authFail(e)) { m.close(); return; } m.q("#gdErr").textContent = e.message; yes.textContent = "🗑 Delete"; yes.disabled = !ok(); } };
    setTimeout(() => inp.focus(), 50);
  }
  function qrModal(sh){
    const m = modal(`<h3>▦ ${esc(sh.name)}</h3><div class="g-qr" id="gqBox"><p class="g-muted">Making QR…</p></div><p class="g-link-l">${esc(sh.customer_url)}</p><div class="dm-btns"><button class="btn b-blue" id="gqOk">Close</button></div>`);
    m.q("#gqOk").onclick = m.close;
    const draw = () => { try { const q = window.AKQR.encode(sh.customer_url); const n = q.size, M = q.modules; let d = "";
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (M[y][x]) d += `M${x + 4} ${y + 4}h1v1h-1z`;
        m.q("#gqBox").innerHTML = `<svg viewBox="0 0 ${n + 8} ${n + 8}" width="220" height="220" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
      } catch (e) { m.q("#gqBox").innerHTML = `<p class="g-err-s">${esc(e.message)}</p>`; } };
    if (window.AKQR) draw(); else { const s = document.createElement("script"); s.src = "/qr.js?v=10.15.2"; s.onload = draw; s.onerror = () => { m.q("#gqBox").innerHTML = `<p class="g-err-s">QR could not load</p>`; }; document.head.appendChild(s); }
  }

  // ---------- 🧾 Orders & bookings across all shops ----------
  V["g-orders"] = async function(){
    const f = S.ordF = Object.assign({shop: "", type: "", status: "active", from: "", to: "", q: ""}, S.ordF || {});
    loading();
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    let r; try { r = await api("/api/dev/god/orders" + (qs ? "?" + qs : "")); } catch (e) { return fail(e); } if (!here("g-orders")) return;
    TYPES = NT(r.types); NT(r.types).forEach(t => { ICON[t.key] = t.icon; });
    app.innerHTML = `<div class="g-tools">
        <div class="g-chips" id="goS">${[["active", "🔥 Live"], ["pending", "🆕 New"], ["done", "🏁 Done"], ["closed", "✕ Closed"], ["", "All"]].map(([v, l]) => `<button type="button" data-s="${v}" aria-pressed="${f.status === v}">${l}</button>`).join("")}</div>
        <div class="g-chips" id="goT"><button type="button" data-t="" aria-pressed="${!f.type}">All types</button>${NT(r.types).map(t => `<button type="button" data-t="${esc(t.key)}" aria-pressed="${f.type === t.key}">${esc(t.icon)} ${esc(t.short_en)}</button>`).join("")}</div>
        <div class="g-2"><select class="g-in" id="goShop"><option value="">All shops</option>${r.shops.map(s => `<option value="${s.id}" ${String(f.shop) === String(s.id) ? "selected" : ""}>${esc(ICON[s.type] || "🏪")} ${esc(s.name)}</option>`).join("")}</select><input type="search" class="g-in" id="goQ" placeholder="🔍 Name / code" value="${esc(f.q)}"></div>
        <div class="g-2"><label class="g-inl">From <input type="date" class="g-in sm" id="goFrom" value="${esc(f.from)}"></label><label class="g-inl">To <input type="date" class="g-in sm" id="goTo" value="${esc(f.to)}"></label></div></div>
      <p class="g-muted g-pad">${r.orders.length}${r.orders.length === 100 ? "+" : ""} shown</p>
      <div class="g-list" id="goL">${r.orders.map(o => orderCard(o, o.mode, true)).join("") || `<div class="g-empty-s"><span aria-hidden="true">🧾</span><p>Nothing here with these filters.</p></div>`}</div>`;
    const re = () => V["g-orders"]();
    $("#goS").onclick = e => { const b = e.target.closest("[data-s]"); if (b) { f.status = b.dataset.s; re(); } };
    $("#goT").onclick = e => { const b = e.target.closest("[data-t]"); if (b) { f.type = b.dataset.t; re(); } };
    $("#goShop").onchange = e => { f.shop = e.target.value; re(); };
    $("#goQ").onchange = e => { f.q = e.target.value.trim(); re(); };
    $("#goFrom").onchange = e => { f.from = e.target.value; re(); }; $("#goTo").onchange = e => { f.to = e.target.value; re(); };
    wireOrders($("#goL"), r.orders, re);
  };

  // ---------- 👥 Customers ----------
  V["g-customers"] = async function(){
    const f = S.custF = Object.assign({q: "", shop: ""}, S.custF || {});
    loading();
    let r, shops; try { [r, shops] = await Promise.all([api("/api/dev/god/customers?" + new URLSearchParams(Object.entries(f).filter(([, v]) => v))), api("/api/dev/god/orders?status=pending&shop=0").then(x => x.shops)]); } catch (e) { return fail(e); } if (!here("g-customers")) return;
    app.innerHTML = `<div class="g-tools"><div class="g-2"><input type="search" class="g-in" id="gcQ" placeholder="🔍 Name or phone" value="${esc(f.q)}"><select class="g-in" id="gcS"><option value="">All shops</option>${shops.map(s => `<option value="${s.id}" ${String(f.shop) === String(s.id) ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div></div>
      <div class="g-mini4 g-mini2"><div><b>${num(r.total)}</b><small>customers in all</small></div><div><b>${num(r.customers.length)}</b><small>shown</small></div></div>
      <div class="g-card">${r.customers.map((c, i) => `<div class="g-cust"><span class="g-av" aria-hidden="true">${esc((c.name || "?").slice(0, 1).toUpperCase())}</span><span class="g-in-n">${esc(c.name || "—")}<small>${esc(c.shop_name)} · ${c.orders} × · ${esc(ago(c.last_at))}</small></span>
        ${c.phone ? `<button type="button" class="g-btn sm" data-ph="${i}">${esc(c.phone_masked)}</button>` : `<span class="g-muted">no phone</span>`}</div>`).join("") || `<p class="g-muted">No customers match.</p>`}</div>
      <p class="g-muted g-pad">Phone numbers stay masked until you tap one. Customers have no logins; this list comes from their orders and bookings.</p>`;
    $("#gcQ").onchange = e => { f.q = e.target.value.trim(); V["g-customers"](); };
    $("#gcS").onchange = e => { f.shop = e.target.value; V["g-customers"](); };
    app.querySelectorAll("[data-ph]").forEach(b => b.onclick = () => { const c = r.customers[Number(b.dataset.ph)]; const a = document.createElement("a"); a.href = "tel:+91" + c.phone; a.className = "g-btn sm ok"; a.textContent = "📞 " + c.phone; b.replaceWith(a); });
  };

  // ---------- 📣 Notifications: reach + composer (push) + the older notices screen ----------
  const TPL = [["🛍️ Offer", "Aaj ka offer!", "Apni dukaan pe naya offer dekhiye."], ["🔔 Reminder", "Reminder", "Aaj dukaan khuli hai, order / booking kar lijiye."], ["🚀 Update", "Naya update", "App me naye features aa gaye hain."], ["🙏 Thanks", "Shukriya!", "Hamare saath bane rehne ke liye dhanyavaad."]];
  V["g-notify"] = async function(){
    loading();
    let r, shops; try { [r, shops] = await Promise.all([api("/api/dev/god/push"), api("/api/dev/god/orders?status=pending&shop=0").then(x => x.shops)]); } catch (e) { return fail(e); } if (!here("g-notify")) return;
    const st = V["g-notify"].st || (V["g-notify"].st = {target: "shopkeepers", shop: "", title: "", body: ""});
    app.innerHTML = `<div class="g-mini4"><div><b>${num(r.totals.admin)}</b><small>shopkeeper devices</small></div><div><b>${num(r.totals.customer)}</b><small>customer devices</small></div><div><b>${num(r.totals.dev)}</b><small>your devices</small></div><div><b>${num((r.attempts_7d.find(a => a.outcome === "accepted") || {}).n || 0)}</b><small>sent in 7 days</small></div></div>
      <form class="g-card g-form" id="gnF" novalidate><h3>📲 Send a push</h3>
        ${seg("tg", [["shopkeepers", "All shopkeepers"], ["shop", "One shop"], ["customers", "A shop's customers"]], st.target)}
        <label ${st.target === "shopkeepers" ? "hidden" : ""} id="gnShopL">Shop<select class="g-in" id="gnShop"><option value="">Pick a shop…</option>${shops.map(s => `<option value="${s.id}" ${String(st.shop) === String(s.id) ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
        <div class="g-chips" id="gnTpl">${TPL.map(([l], i) => `<button type="button" data-tp="${i}">${esc(l)}</button>`).join("")}</div>
        <label>Title<input class="g-in" id="gnTitle" maxlength="80" value="${esc(st.title)}" placeholder="Short and clear"></label>
        <label>Message<textarea class="g-in" id="gnBody" rows="3" maxlength="200" placeholder="One or two lines">${esc(st.body)}</textarea></label>
        <div class="g-prev" aria-label="Preview"><span class="g-prev-ic" aria-hidden="true">🛒</span><div><b id="gnPT">${esc(st.title || "Title")}</b><small id="gnPB">${esc(st.body || "Your message shows here")}</small></div><i>now</i></div>
        <p class="g-muted" id="gnReach">Tap “Check reach” to see how many phones get it. Shops named “TEST…” never get a push.</p>
        <div class="g-row"><button type="button" class="g-btn" id="gnDry">👀 Check reach</button><button class="g-btn gold" id="gnSend">📣 Send</button></div><p class="g-err-s" id="gnErr" role="alert"></p></form>
      <button type="button" class="g-tilebar" id="gnOld"><span aria-hidden="true">📢</span><span><b>Notices to shop 🔔 panels</b><small>Bills, updates, issues with fix-by, read counts, auto reminders</small></span><i aria-hidden="true">›</i></button>
      <details class="g-card"><summary>📊 Devices per shop</summary>${r.shops.map(s => `<div class="g-cust"><span class="g-in-n">${esc(s.name)}${s.is_test ? " <span class='g-pill gray'>TEST</span>" : ""}</span><small>🏪 ${s.admin} · 👥 ${s.customer}</small></div>`).join("") || `<p class="g-muted">No devices yet.</p>`}</details>`;
    const keep = () => { st.title = $("#gnTitle").value; st.body = $("#gnBody").value; st.shop = $("#gnShop").value; $("#gnPT").textContent = st.title || "Title"; $("#gnPB").textContent = st.body || "Your message shows here"; };
    ["gnTitle", "gnBody"].forEach(id => $("#" + id).oninput = keep); $("#gnShop").onchange = keep;
    app.querySelectorAll("[data-tg]").forEach(b => b.onclick = () => { keep(); st.target = b.dataset.tg; V["g-notify"](); });
    $("#gnTpl").onclick = e => { const b = e.target.closest("[data-tp]"); if (!b) return; const t = TPL[Number(b.dataset.tp)]; $("#gnTitle").value = t[1]; $("#gnBody").value = t[2]; keep(); };
    const payload = dry => ({target: st.target, shop_id: st.target === "shopkeepers" ? undefined : Number(st.shop), title: st.title.trim(), body: st.body.trim(), dry_run: dry});
    const check = () => { keep(); if (!st.title.trim()) { $("#gnErr").textContent = "Write a title"; return false; } if (st.target !== "shopkeepers" && !st.shop) { $("#gnErr").textContent = "Pick a shop"; return false; } $("#gnErr").textContent = ""; return true; };
    $("#gnDry").onclick = async () => { if (!check()) return; try { const x = await api("/api/dev/god/push", {method: "POST", body: payload(true)}); $("#gnReach").innerHTML = `Reaches <b>${x.devices}</b> phone${x.devices === 1 ? "" : "s"}${x.suppressed ? ` · ${x.suppressed} on TEST shops skipped` : ""}.`; } catch (e) { if (!authFail(e)) $("#gnErr").textContent = e.message; } };
    $("#gnF").onsubmit = async e => { e.preventDefault(); if (!check()) return;
      let x; try { x = await api("/api/dev/god/push", {method: "POST", body: payload(true)}); } catch (er) { if (!authFail(er)) $("#gnErr").textContent = er.message; return; }
      if (!x.devices) { $("#gnReach").innerHTML = `Nobody to send to${x.suppressed ? ` (${x.suppressed} on TEST shops are always skipped)` : ""}.`; return; }
      if (!await ask(`Send to ${x.devices} phone${x.devices === 1 ? "" : "s"}?`, `“${st.title}” — ${st.body}`, "📣 Send", "b-green")) return;
      try { const y = await api("/api/dev/god/push", {method: "POST", body: payload(false)}); toast(`Sent · ${y.devices} phone(s)`); st.title = ""; st.body = ""; V["g-notify"](); } catch (er) { if (!authFail(er)) $("#gnErr").textContent = er.message; } };
    $("#gnOld").onclick = () => go("notify");
  };

  // ---------- 🌐 Website: landing, announcement banner, maintenance, directory ----------
  async function saveSet(key, value, msg){ const x = await api("/api/dev/god/settings", {method: "POST", body: {key, value}}); toast(x.changed ? (msg || "Saved ✓") : "No change"); return x; }
  V["g-website"] = async function(){
    loading();
    let r; try { r = await api("/api/dev/god/settings"); } catch (e) { return fail(e); } if (!here("g-website")) return;
    TYPES = NT(r.types); const g = r.settings, b = g.banner, mt = g.maintenance, dir = g.directory;
    const sub = V["g-website"].sub || "banner";
    app.innerHTML = `<button type="button" class="g-tilebar" id="gwLand"><span aria-hidden="true">🏠</span><span><b>Main landing page (/)</b><small>Text, colours, toggles · P3 Glass defaults kept</small></span><i aria-hidden="true">›</i></button>
      <a class="g-tilebar" href="/" target="_blank" rel="noopener"><span aria-hidden="true">👁️</span><span><b>Open the live site</b><small>/ and /shops in a new tab</small></span><i aria-hidden="true">↗</i></a>
      <nav class="g-tabs" id="gwT">${[["banner", "📢 Banner"], ["maint", "🛠️ Maintenance"], ["dir", "🗂️ Directory"]].map(([k, l]) => `<button type="button" data-w="${k}" aria-current="${k === sub ? "page" : "false"}">${l}</button>`).join("")}</nav><div id="gwB"></div>`;
    $("#gwLand").onclick = () => go("landing");
    $("#gwT").onclick = e => { const x = e.target.closest("[data-w]"); if (x) { V["g-website"].sub = x.dataset.w; V["g-website"](); } };
    const B = $("#gwB");
    if (sub === "banner") {
      B.innerHTML = `<form class="g-card g-form" id="gbF" novalidate><h3>📢 Announcement banner</h3><p class="g-muted">A thin strip at the top of the pages. Off = nothing shows anywhere.</p>
        ${sw("gbOn", b.on, `<b>Show the banner</b><small>Takes up to 30 seconds to appear everywhere</small>`)}
        <label>Text (हिंदी)<input class="g-in" id="gbHi" maxlength="200" value="${esc(b.text_hi)}" placeholder="जैसे: दिवाली पर सभी दुकानें खुली हैं"></label>
        <label>Text (English)<input class="g-in" id="gbEn" maxlength="200" value="${esc(b.text_en)}" placeholder="e.g. All shops open on Diwali"></label>
        <b class="g-lbl">Show to</b>${seg("au", [["customers", "👥 Customers"], ["shopkeepers", "🏪 Shopkeepers"], ["both", "Both"]], b.audience)}
        <b class="g-lbl">Colour</b>${seg("tn", [["info", "Blue"], ["offer", "Orange"], ["alert", "Red"], ["good", "Green"]], b.tone)}
        <div class="g-bprev" id="gbP"></div><button class="g-btn gold full">💾 Save banner</button></form>`;
      const cur = {...b}; const TN = {info: ["#1e3a8a", "#dbeafe"], offer: ["#7c2d12", "#ffedd5"], alert: ["#7f1d1d", "#fee2e2"], good: ["#14532d", "#dcfce7"]};
      const prev = () => { cur.text_hi = $("#gbHi").value; cur.text_en = $("#gbEn").value; cur.on = $("#gbOn").checked; const t = TN[cur.tone] || TN.info; const txt = [cur.text_hi.trim(), cur.text_en.trim()].filter(Boolean).join(" · ");
        $("#gbP").innerHTML = `<small>Preview</small><div style="color:${t[0]};background:${t[1]}">${esc(txt || "Your text here")}</div>`; };
      prev(); ["gbHi", "gbEn"].forEach(id => $("#" + id).oninput = prev); $("#gbOn").onchange = prev;
      B.querySelectorAll("[data-au]").forEach(x => x.onclick = () => { cur.audience = x.dataset.au; B.querySelectorAll("[data-au]").forEach(y => y.setAttribute("aria-pressed", String(y === x))); });
      B.querySelectorAll("[data-tn]").forEach(x => x.onclick = () => { cur.tone = x.dataset.tn; B.querySelectorAll("[data-tn]").forEach(y => y.setAttribute("aria-pressed", String(y === x))); prev(); });
      $("#gbF").onsubmit = async e => { e.preventDefault(); prev(); if (cur.on && !cur.text_hi.trim() && !cur.text_en.trim()) return toast("Write the banner text first");
        if (cur.on && !b.on && !await ask("Show the banner?", `To ${cur.audience}: ${[cur.text_hi, cur.text_en].filter(Boolean).join(" · ")}`, "Show it", "b-green")) return;
        try { await saveSet("banner", cur, cur.on ? "Banner is ON" : "Banner saved (off)"); V["g-website"](); } catch (x) { if (!authFail(x)) toast(x.message); } };
    } else if (sub === "maint") {
      B.innerHTML = `<form class="g-card g-form" id="gmF" novalidate><h3>🛠️ Maintenance mode</h3><p class="g-muted">Customer pages (/, /shops, shop links, tracking) show “Back soon” and new orders wait. Shopkeepers and this dev panel keep working.</p>
        ${sw("gmOn", mt.on, `<b>Maintenance ON</b><small>${mt.on ? "Customers see “Back soon” right now" : "Off: the site is normal"}</small>`)}
        <label>Message (हिंदी)<input class="g-in" id="gmHi" maxlength="300" value="${esc(mt.msg_hi)}" placeholder="हम कुछ सुधार कर रहे हैं…"></label>
        <label>Message (English)<input class="g-in" id="gmEn" maxlength="300" value="${esc(mt.msg_en)}" placeholder="We're making things better…"></label>
        <p class="g-muted">This device: <b>${r.this_device_bypass ? "✅ can still see the site (bypass on)" : "no bypass yet"}</b></p>
        <div class="g-row"><button type="button" class="g-btn" id="gmBy">🔓 Let this device see the site</button><button class="g-btn gold">💾 Save</button></div></form>`;
      $("#gmBy").onclick = async () => { try { await api("/api/dev/god/bypass", {method: "POST", body: {}}); toast("This device skips maintenance ✓"); V["g-website"](); } catch (x) { if (!authFail(x)) toast(x.message); } };
      $("#gmF").onsubmit = async e => { e.preventDefault(); const v = {on: $("#gmOn").checked, msg_hi: $("#gmHi").value, msg_en: $("#gmEn").value};
        if (v.on && !mt.on && !await ask("Turn maintenance ON?", "Every customer page shows “Back soon” and new orders wait until you turn it off. This device keeps seeing the site.", "Turn ON")) return;
        try { await saveSet("maintenance", v, v.on ? "Maintenance is ON" : "Maintenance is OFF"); V["g-website"](); } catch (x) { if (!authFail(x)) toast(x.message); } };
    } else {
      const live = r.shops.filter(s => !s.is_test);
      B.innerHTML = `<div class="g-card"><h3>⭐ Featured first on /shops</h3><p class="g-muted">Tick shops to show them first, in this order.</p><div id="gdF">${dir.featured.map(id => live.find(s => s.id === id)).filter(Boolean).map((s, i) => `<div class="g-cust"><b class="g-num">${i + 1}</b><span class="g-in-n">${esc(s.name)}</span><button class="g-btn sm" data-up="${s.id}" aria-label="Move up">▲</button><button class="g-btn sm no" data-rm="${s.id}" aria-label="Remove">✕</button></div>`).join("") || `<p class="g-muted">None yet: normal order (open shops first).</p>`}</div>
          <select class="g-in" id="gdAdd"><option value="">+ Add a featured shop…</option>${live.filter(s => !dir.featured.includes(s.id)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select></div>
        <div class="g-card"><h3>🙈 Hide from /shops</h3>${live.map(s => `<div class="g-item"><span class="g-in-n">${esc(ICON[s.type] || "🏪")} ${esc(s.name)}<small>${s.live ? "live" : "not live"}</small></span><label class="g-sw mini"><input type="checkbox" data-hide="${s.id}" ${s.dir_hidden ? "checked" : ""} aria-label="Hide ${esc(s.name)}"><span class="g-sw-t"></span></label></div>`).join("")}</div>
        <div class="g-card"><h3>🗂️ Categories</h3><p class="g-muted">Switch on to hide a whole shop type from the /shops lists.</p>${NT(r.types).map(t => `<div class="g-item"><span class="g-in-n">${esc(t.icon)} ${esc(t.en)}</span><label class="g-sw mini"><input type="checkbox" data-ht="${esc(t.key)}" ${dir.hidden_types.includes(t.key) ? "checked" : ""} aria-label="Hide ${esc(t.en)}"><span class="g-sw-t"></span></label></div>`).join("")}</div>`;
      const saveDir = async v => { try { await saveSet("directory", v); V["g-website"](); } catch (x) { if (!authFail(x)) toast(x.message); } };
      $("#gdAdd").onchange = e => { const id = Number(e.target.value); if (id) saveDir({...dir, featured: [...dir.featured, id]}); };
      B.querySelectorAll("[data-rm]").forEach(x => x.onclick = () => saveDir({...dir, featured: dir.featured.filter(i => i !== Number(x.dataset.rm))}));
      B.querySelectorAll("[data-up]").forEach(x => x.onclick = () => { const f = [...dir.featured]; const i = f.indexOf(Number(x.dataset.up)); if (i > 0) { [f[i - 1], f[i]] = [f[i], f[i - 1]]; saveDir({...dir, featured: f}); } });
      B.querySelectorAll("[data-ht]").forEach(x => x.onchange = () => saveDir({...dir, hidden_types: x.checked ? [...dir.hidden_types, x.dataset.ht] : dir.hidden_types.filter(k => k !== x.dataset.ht)}));
      B.querySelectorAll("[data-hide]").forEach(x => x.onchange = async () => { try { await api("/api/dev/shops/flags", {method: "POST", body: {shop_id: Number(x.dataset.hide), dir_hidden: x.checked}}); toast(x.checked ? "Hidden from /shops" : "Shown on /shops"); } catch (e) { if (!authFail(e)) toast(e.message); } });
    }
  };

  // ---------- ✂️ Shop types & the salon master catalogue (overrides stored in the DB; code keeps the defaults) ----------
  V["g-catalog"] = async function(){
    loading();
    let r; try { r = await api("/api/dev/god/settings"); } catch (e) { return fail(e); } if (!here("g-catalog")) return;
    const ov = r.settings.salon_catalog || {}; const c = r.catalog;
    app.innerHTML = `<div class="g-card"><h3>Shop types</h3><div class="g-types big">${NT(r.types).map(t => `<span>${esc(t.icon)} ${esc(t.en)}<small>${esc(t.mode === "booking" ? "bookings" : "orders")}</small></span>`).join("")}</div></div>
      <p class="g-muted g-pad">💇 Salon catalogue: every salon shows these. Change a label, emoji or minutes, or hide one for all salons. Empty boxes = the default.</p>
      <form id="gcF">${c.groups.map(g => `<div class="g-card"><h3>${esc(g.icon)} ${esc(g.name_en)} · ${esc(g.name_hi)}</h3>${c.services.filter(s => s.group === g.key).map(s => { const o = ov[s.key] || {};
        return `<div class="g-cat" data-k="${esc(s.key)}"><input class="g-in xs" data-c="icon" value="${esc(o.icon || "")}" placeholder="${esc(s.icon)}" aria-label="Emoji" maxlength="8"><input class="g-in" data-c="name_en" value="${esc(o.name_en || "")}" placeholder="${esc(s.name_en)}" aria-label="English name" maxlength="40"><input class="g-in" data-c="name_hi" value="${esc(o.name_hi || "")}" placeholder="${esc(s.name_hi)}" aria-label="Hindi name" maxlength="40">
          <label class="g-rs">⏱<input class="g-in xs" type="number" min="5" max="240" data-c="min" value="${o.min != null ? o.min : ""}" placeholder="${s.min}" aria-label="Minutes"></label><label class="g-sw mini" title="Hide for all salons"><input type="checkbox" data-c="hidden" ${o.hidden ? "checked" : ""} aria-label="Hide ${esc(s.name_en)}"><span class="g-sw-t"></span></label></div>`; }).join("")}</div>`).join("")}
      <div class="g-row g-sticky"><button type="button" class="g-btn" id="gcReset">↺ Reset all to defaults</button><button class="g-btn gold">💾 Save catalogue</button></div></form>`;
    $("#gcF").onsubmit = async e => { e.preventDefault(); const v = {};
      app.querySelectorAll(".g-cat").forEach(row => { const o = {}; row.querySelectorAll("[data-c]").forEach(i => { const k = i.dataset.c; if (k === "hidden") { if (i.checked) o.hidden = true; } else if (i.value.trim()) o[k] = k === "min" ? Number(i.value) : i.value.trim(); }); if (Object.keys(o).length) v[row.dataset.k] = o; });
      try { await saveSet("salon_catalog", v, "Catalogue saved ✓ (salons update within 30 s)"); V["g-catalog"](); } catch (x) { if (!authFail(x)) toast(x.message); } };
    $("#gcReset").onclick = async () => { if (!await ask("Reset the catalogue?", "Every salon goes back to the built-in names, emoji and minutes.", "Reset")) return; try { await saveSet("salon_catalog", {}, "Back to defaults"); V["g-catalog"](); } catch (x) { if (!authFail(x)) toast(x.message); } };
  };

  // ---------- 📊 Reports ----------
  V["g-reports"] = async function(){
    const days = V["g-reports"].d || 14; loading();
    let r; try { r = await api("/api/dev/god/reports?days=" + days); } catch (e) { return fail(e); } if (!here("g-reports")) return;
    const max = Math.max(1, ...r.series.map(s => s.orders + s.bookings)), maxV = Math.max(1, ...r.series.map(s => s.visits));
    const W = 320, H = 140, bw = W / r.series.length;
    const tot = k => r.series.reduce((a, s) => a + s[k], 0);
    const dl = t => new Date(t + 330 * 60000).toISOString().slice(5, 10).split("-").reverse().join("/");
    app.innerHTML = `${seg("rd", [[7, "7 days"], [14, "14 days"], [30, "30 days"]], days)}
      <div class="g-mini4"><div><b>${num(tot("orders"))}</b><small>orders</small></div><div><b>${num(tot("bookings"))}</b><small>bookings</small></div><div><b>${num(tot("visits"))}</b><small>visits</small></div><div><b>${num(tot("new_shops"))}</b><small>new shops</small></div></div>
      <div class="g-card"><h3>Orders & bookings per day</h3><svg class="g-chart" viewBox="0 0 ${W} ${H + 16}" role="img" aria-label="Orders and bookings per day">${r.series.map((s, i) => { const ho = Math.round(s.orders / max * H), hb = Math.round(s.bookings / max * H); const x = (i * bw + 1.5).toFixed(1), w = Math.max(2, bw - 3).toFixed(1);
        return `<rect x="${x}" y="${H - ho}" width="${w}" height="${ho}" rx="2" class="o"/><rect x="${x}" y="${H - ho - hb}" width="${w}" height="${hb}" rx="2" class="b"/>`; }).join("")}
        <polyline class="v" fill="none" points="${r.series.map((s, i) => `${(i * bw + bw / 2).toFixed(1)},${(H - s.visits / maxV * H).toFixed(1)}`).join(" ")}"/>
        <text x="0" y="${H + 13}" class="l">${dl(r.series[0].day)}</text><text x="${W}" y="${H + 13}" text-anchor="end" class="l">${dl(r.series[r.series.length - 1].day)}</text></svg>
        <div class="g-legend"><span class="o">orders</span><span class="b">bookings</span><span class="v">visits</span></div></div>
      <div class="g-card"><h3>🏆 Top shops</h3>${r.top.map((t, i) => `<div class="g-cust"><b class="g-num">${i + 1}</b><span class="g-in-n">${esc(t.name)}</span><b>${num(t.orders)}</b></div>`).join("") || `<p class="g-muted">No orders in this period.</p>`}</div>
      <div class="g-card"><h3>By shop type</h3><div class="g-types big">${Object.entries(r.by_type).map(([k, n]) => `<span>${esc(ICON[k] || "🏪")} ${esc(typeName(k))}<small>${num(n)}</small></span>`).join("") || `<p class="g-muted">—</p>`}</div></div>
      <button type="button" class="g-tilebar" id="grShop"><span aria-hidden="true">📊</span><span><b>Shop-wise report</b><small>Per-shop orders, visits, logins</small></span><i aria-hidden="true">›</i></button>`;
    app.querySelectorAll("[data-rd]").forEach(b => b.onclick = () => { V["g-reports"].d = Number(b.dataset.rd); V["g-reports"](); });
    $("#grShop").onclick = () => go("dukaan");
  };

  // ---------- ⚙️ Rules & settings ----------
  V["g-rules"] = function(){
    app.innerHTML = `<button type="button" class="g-tilebar" data-go="platform"><span aria-hidden="true">💸</span><span><b>Plan, price, trial & UPI</b><small>Trial length, monthly price, auto-approve, signups, rules</small></span><i aria-hidden="true">›</i></button>
      <button type="button" class="g-tilebar" data-go="cloud"><span aria-hidden="true">☁️</span><span><b>Cloud usage</b><small>Free-tier limits</small></span><i aria-hidden="true">›</i></button>
      <button type="button" class="g-tilebar" data-go="shops"><span aria-hidden="true">✅</span><span><b>Approvals & plans per shop</b><small>Waiting shops, bills, app icons</small></span><i aria-hidden="true">›</i></button>
      <div class="g-card"><h3>⏰ Daily cron</h3><p class="g-muted">Runs every day at 09:00 IST (03:30 UTC): plan reminders, auto-pause on expiry, clean-ups. Free on Cloudflare.</p></div>
      <div class="g-card"><h3>🧾 Auto-accept</h3><p class="g-muted">Each salon / service shop decides: Shops → shop → Orders → Auto-accept. QR walk-ins always join the queue.</p></div>
      <form class="g-card g-form" id="gpF" novalidate><h3>🔒 Change dev password</h3>
        <label>Current password<input class="g-in" type="password" id="gpCur" autocomplete="current-password"></label>
        <label>New password (12+ characters)<input class="g-in" type="password" id="gpNew" autocomplete="new-password" minlength="12"></label>
        <p class="g-err-s" id="gpErr" role="alert"></p><button class="g-btn gold">Change password</button></form>`;
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
    $("#gpF").onsubmit = async e => { e.preventDefault(); const err = $("#gpErr"); err.textContent = "";
      if ($("#gpNew").value.length < 12) { err.textContent = "New password: 12 or more characters"; return; }
      try { await api("/api/dev/password", {method: "POST", body: {current: $("#gpCur").value, password: $("#gpNew").value}}); $("#gpCur").value = ""; $("#gpNew").value = ""; toast("Password changed ✓ (other devices logged out)"); } catch (x) { if (!authFail(x)) err.textContent = x.message; } };
  };

  // ---------- 🛡️ System: health, tables, backup, audit + undo ----------
  const auditLine = a => { const what = {settings: "⚙️ Setting", undo: "↺ Undo", as_shop: "👑 As shop", item: "📦 Item", push: "📣 Push", bypass: "🔓 Bypass", dev_api: "🛠️ Dev"}[a.action] || a.action;
    return `<details class="g-aud"><summary><span>${esc(what)}</span><b>${esc(a.target)}</b>${a.shop_name ? `<small>${esc(a.shop_name)}</small>` : ""}<i>${esc(ago(a.at))}</i>${a.undone_at ? `<em>undone</em>` : ""}</summary>
      <p class="g-muted">${esc(a.actor)} · ${esc(ist(a.at))}</p>${a.before != null ? `<pre class="g-pre b">${esc(a.before)}</pre>` : ""}${a.after != null ? `<pre class="g-pre a">${esc(a.after)}</pre>` : ""}</details>`; };
  V["g-system"] = async function(){
    loading();
    let t, au; try { [t, au] = await Promise.all([api("/api/dev/god/tables"), api("/api/dev/god/audit?limit=40")]); } catch (e) { return fail(e); } if (!here("g-system")) return;
    const total = t.tables.reduce((a, x) => a + (x.rows || 0), 0);
    app.innerHTML = `<div class="g-mini4"><div><b>v${esc(t.version)}</b><small>running</small></div><div><b>${esc(t.schema)}</b><small>schema</small></div><div><b>${num(t.tables.length)}</b><small>tables</small></div><div><b>${num(total)}</b><small>rows</small></div></div>
      <div class="g-row"><a class="g-btn gold" href="/api/dev/backup" download>⬇️ Download backup (JSON)</a><button type="button" class="g-btn" data-go="health">❤️ Health</button><button type="button" class="g-btn" data-go="errors">⚠️ Errors</button></div>
      <div class="g-card"><h3>📜 God Mode audit</h3><div class="g-row">${au.undo ? `<button type="button" class="g-btn" id="gsUndo">↺ Undo last setting change (${esc(au.undo.target)}, ${esc(ago(au.undo.at))})</button>` : `<span class="g-muted">Nothing to undo.</span>`}<button type="button" class="g-btn" data-go="audit">Shop audit →</button></div>
        <div class="g-auds">${au.audit.map(auditLine).join("") || `<p class="g-muted">No God Mode actions yet.</p>`}</div></div>
      <details class="g-card"><summary>🗄️ Tables (read-only row counts)</summary><div class="g-tbls">${t.tables.map(x => `<span><b>${esc(x.name)}</b><i>${x.rows == null ? "—" : num(x.rows)}</i></span>`).join("")}</div><p class="g-muted">Build ${esc(t.build || "")}</p></details>`;
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
    const u = $("#gsUndo"); if (u) u.onclick = async () => { if (!await ask("Undo the last setting change?", `${au.undo.target} goes back to what it was before.`, "↺ Undo", "b-gray")) return; try { const x = await api("/api/dev/god/undo", {method: "POST", body: {}}); toast(`Undone: ${x.undone}`); V["g-system"](); } catch (e) { if (!authFail(e)) toast(e.message); } };
  };

  // ---------- 🔔 Activity: the full feed with filters ----------
  V["g-activity"] = async function(){
    const f = V["g-activity"].f || "all"; loading();
    let r; try { r = await api("/api/dev/events?limit=50"); } catch (e) { return fail(e); } if (!here("g-activity")) return;
    setBell(r.unread);
    const kinds = [...new Set(r.events.map(e => e.kind))];
    const KN = {signup: "🆕 New shops", utr: "💰 Payments", expiring: "⏰ Ending", expired: "⛔ Paused", first_order: "🎉 First orders", test: "🔔 Tests"};
    const list = r.events.filter(e => f === "all" || (f === "unread" ? !e.read : e.kind === f));
    app.innerHTML = `<div class="g-chips" id="gaF"><button type="button" data-f="all" aria-pressed="${f === "all"}">All <i>${r.events.length}</i></button><button type="button" data-f="unread" aria-pressed="${f === "unread"}">Unread <i>${r.unread}</i></button>${kinds.map(k => `<button type="button" data-f="${esc(k)}" aria-pressed="${f === k}">${esc(KN[k] || k)}</button>`).join("")}</div>
      <div class="g-row"><button type="button" class="g-btn" id="gaAll" ${r.unread ? "" : "disabled"}>✓ Mark all read</button></div>
      <div class="g-card g-feed">${list.map(e => `<div class="g-fe ${e.read ? "" : "unread"}"><span class="g-dic" aria-hidden="true">${esc(e.icon)}</span><span class="g-in-n">${esc(String(e.title || "").replace(/^[^\w\s\u0900-\u097F]+\s*/u, ""))}<small>${e.body ? esc(e.body) + " · " : ""}${esc(ist(e.created_at))}</small></span></div>`).join("") || `<p class="g-muted">Nothing here.</p>`}</div>`;
    $("#gaF").onclick = e => { const b = e.target.closest("[data-f]"); if (b) { V["g-activity"].f = b.dataset.f; V["g-activity"](); } };
    $("#gaAll").onclick = async () => { try { await api("/api/dev/events/read", {method: "POST", body: {all: true}}); setBell(0); V["g-activity"](); } catch (e) { if (!authFail(e)) toast(e.message); } };
  };
})();
