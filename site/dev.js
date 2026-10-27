// Developer (owner) console: health + service control. Separate login from the shopkeeper's panel.
(function(){
  const $ = s => document.querySelector(s);
  const app = $("#app");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const money = p => "₹" + (p/100).toLocaleString("en-IN", {maximumFractionDigits: 2});
  const num = n => n == null ? "—" : Number(n).toLocaleString("en-IN");
  const ist = t => t ? new Date(t).toLocaleString("en-IN", {timeZone:"Asia/Kolkata", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit", hour12:true}) : "—";
  const istDate = t => t ? new Date(t).toLocaleDateString("en-IN", {timeZone:"Asia/Kolkata", day:"numeric", month:"short", year:"numeric"}) : "—";
  const ymd = t => t ? new Date(t + 330*60000).toISOString().slice(0,10) : "";
  const ago = t => { if (!t) return "never"; const s = Math.max(0, (Date.now() - t)/1000); if (s < 60) return "just now"; if (s < 3600) return Math.floor(s/60) + " min ago"; if (s < 86400) return Math.floor(s/3600) + " h ago"; return Math.floor(s/86400) + " d ago"; };
  const bytes = b => b == null ? "—" : b < 1024*1024 ? (b/1024).toFixed(0) + " KB" : (b/1048576).toFixed(2) + " MB";
  const SVC = {pending:["Pending","Waiting for your approval."], rejected:["Rejected","Not approved. The shopkeeper cannot log in; the storefront link shows “shop not found”."], active:["Active","Site and orders work normally."], grace:["Active",""], paused:["Paused","Paused by you. Customers see “The shop is closed right now”, orders are blocked. No data is deleted."]};
  const SUB = {TRIAL:["Trial","sub-trial"], ACTIVE:["Paid","sub-active"], DUE:["Due soon","sub-due"], EXPIRED:["Expired · auto-paused","sub-expired"], PAYMENT_PENDING_VERIFY:["Paid? verify","sub-verify"]};
  const subPill = sub => sub ? `<span class="pill ${SUB[sub.state][1]}">${SUB[sub.state][0]}</span>` : "";
  const subLine = sub => !sub ? "" : sub.state === "TRIAL" ? `Free trial till <b>${istDate(sub.trial_end)}</b>` : sub.state === "ACTIVE" ? `Paid till <b>${istDate(sub.paid_until)}</b>`
    : sub.state === "DUE" ? `${sub.in_trial ? "Trial" : "Plan"} ends <b>${istDate(sub.ends_at)}</b> (${sub.days_left} day${sub.days_left > 1 ? "s" : ""})` : sub.state === "PAYMENT_PENDING_VERIFY" ? `UTR sent · open till <b>${ist(sub.provisional_until)}</b> unless verified`
    : `Expired ${sub.ends_at ? "on <b>" + istDate(sub.ends_at) + "</b>" : ""} · shop auto-paused`;
  function toast(m){ const el = $("#toast"); el.textContent = m; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2600); }
  // v10.12: the dev panel is English — server messages "हिंदी · English" show only the English part
  function enMsg(m){ m = String(m == null ? "" : m); const DV = /[\u0900-\u097F]/; if (!DV.test(m) || m.indexOf(" · ") < 0) return m;
    const parts = m.split(" · "); let k = 0; while (k < parts.length && DV.test(parts[k])) k++;
    return k > 0 && k < parts.length && !parts.slice(k).some(x => DV.test(x)) ? parts.slice(k).join(" · ") : m; }
  async function api(path, opts = {}){
    const o = {method: opts.method || "GET", headers: {}, credentials: "same-origin"};
    if (opts.body !== undefined) { o.headers["content-type"] = "application/json"; o.body = JSON.stringify(opts.body); }
    if (o.method !== "GET") o.headers["x-requested-with"] = "kirana-dev";
    let r; try { r = await fetch(path, o); } catch { throw Object.assign(new Error("Network problem — check the connection."), {code:"network"}); }
    const data = (r.headers.get("content-type")||"").includes("json") ? await r.json() : await r.text();
    if (!r.ok) throw Object.assign(new Error(enMsg((data && data.error) || ("HTTP " + r.status))), {status: r.status, code: data && data.code});
    return data;
  }
  let tab = ["home","shops","notify","payments","cloud","audit","landing","platform","health","errors","dukaan","g-shops","g-shop","g-orders","g-customers","g-notify","g-website","g-catalog","g-reports","g-rules","g-system","g-activity","g-features"].includes((location.hash || "").slice(1).replace(/^shop-\d+$/, "g-shop")) ? location.hash.slice(1).replace(/^shop-\d+$/, "g-shop") : "home", timer = null, staleMin = Number(localStorage.getItem("dev.stale") || localStorage.getItem("dev_stale")) || 15, me = null;
  // v9.1: in-page modals (no window.prompt — it was hard to use on phones and some in-app browsers block it).
  const normConfirm = v => String(v ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  function modal(html){
    const back = document.createElement("div"); back.className = "once-back dmodal"; back.innerHTML = `<div class="card once" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(back); const close = () => back.remove();
    back.addEventListener("click", e => { if (e.target === back) close(); });
    return {back, close, q: s => back.querySelector(s)};
  }
  function deleteModal(sh){
    if (!sh) return;
    const m = modal(`<h3>🗑 Delete this shop?</h3>
      <p><b>${esc(sh.name)}</b> and all its data (products, orders, logins, bills) will be deleted forever. This cannot be undone.</p>
      <div class="dm-link"><span class="muted">Link name</span><code id="dmSlug" class="mono">${esc(sh.slug)}</code><button type="button" class="btn b-gray dm-copy" id="dmCopy">📋 Copy</button></div>
      <label class="dm-lbl" for="dmIn">To confirm, type the shop name or the link name</label>
      <input id="dmIn" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(sh.name)} / ${esc(sh.slug)}">
      <p class="err" id="dmErr"></p>
      <div class="dm-btns"><button type="button" class="btn b-gray" id="dmNo">Cancel</button><button type="button" class="btn b-red" id="dmYes" disabled>🗑 Delete</button></div>`);
    const inp = m.q("#dmIn"), yes = m.q("#dmYes"), err = m.q("#dmErr");
    const ok = () => { const t = normConfirm(inp.value); return !!t && (t === normConfirm(sh.slug) || t === normConfirm(sh.name)); };
    inp.oninput = () => { yes.disabled = !ok(); err.textContent = ""; };
    m.q("#dmNo").onclick = m.close;
    m.q("#dmCopy").onclick = async () => { try { await navigator.clipboard.writeText(sh.slug); toast("Link name copied"); } catch { const r = document.createRange(); r.selectNodeContents(m.q("#dmSlug")); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); toast("Selected — now copy it"); } };
    const go = async () => {
      if (!ok()) { err.textContent = `The name doesn't match. Type “${sh.name}” or “${sh.slug}”.`; return; }
      yes.disabled = true; yes.textContent = "Deleting…";
      try { await api("/api/dev/shops/delete", {method:"POST", body:{shop_id: sh.id, confirm: inp.value}}); m.close(); toast(`${sh.name} deleted`); shopsView(); }
      catch (e) { if (authFail(e)) { m.close(); return; } err.textContent = e.message || "Couldn't delete. Please try again."; yes.textContent = "🗑 Delete"; yes.disabled = !ok(); }
    };
    yes.onclick = go; inp.onkeydown = e => { if (e.key === "Enter") go(); };
    setTimeout(() => inp.focus(), 50);
  }
  function rejectModal(card){
    return new Promise(res => {
      const who = card ? (card.querySelector("b") || {}).textContent || "" : "";
      const m = modal(`<h3>❌ Reject this payment?</h3>
        <p>${who ? `<b>${esc(who)}</b>: ` : ""}The shop will be paused again. The shopkeeper will see the reason.</p>
        <label class="dm-lbl" for="rmIn">Reason</label>
        <input id="rmIn" value="Payment not received" autocomplete="off">
        <p class="err" id="rmErr"></p>
        <div class="dm-btns"><button type="button" class="btn b-gray" id="rmNo">Cancel</button><button type="button" class="btn b-red" id="rmYes">❌ Reject</button></div>`);
      const inp = m.q("#rmIn"); let done = false;
      const finish = v => { if (done) return; done = true; m.close(); res(v); };
      m.q("#rmNo").onclick = () => finish(null);
      m.back.addEventListener("click", e => { if (e.target === m.back) finish(null); });
      const go = () => { const v = inp.value.trim(); if (!v) { m.q("#rmErr").textContent = "Enter a reason"; return; } finish(v); };
      m.q("#rmYes").onclick = go; inp.onkeydown = e => { if (e.key === "Enter") go(); };
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
    });
  }
  const authFail = e => { if (e.status === 401) { stop(); loginView(); return true; } return false; };
  const stop = () => { clearInterval(timer); timer = null; };

  async function start(){
    let s; try { s = await api("/api/dev/state"); } catch (e) { app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    if (!s.dev) return loginView();
    me = s.dev; $("#tabs").hidden = false; $("#logout").hidden = false; document.body.classList.add("god-in"); // v10.15 👑
    if ((location.hash || "").slice(1) === "waiting") { shopsView.t = "all"; shopsView.f = "pending"; tab = "shops"; } // v10.6: a "new shop" alert opens Dukaanein → Waiting
    go(tab); startLive();
  }
  function loginView(){
    me = null; stopLive(); document.body.classList.remove("god-in"); // v10.15 👑
    $("#tabs").hidden = true; $("#logout").hidden = true; $("#svcPill").hidden = true;
    app.innerHTML = `<form class="card auth form" id="f"><h1>Developer login</h1><p class="muted">Owner / maintenance console. Separate from the shopkeeper’s panel.</p>
      <label for="u">Username</label><input id="u" autocomplete="username" autocapitalize="none" required>
      <label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required>
      <p class="err" id="err" role="alert"></p><button class="btn b-blue full">Log in</button>
      <p class="hint center"><a href="#" id="rec" style="color:var(--blue)">Forgot password? Use the recovery key</a></p></form>`;
    $("#f").onsubmit = async e => { e.preventDefault();
      try { await api("/api/dev/login", {method:"POST", body:{username: $("#u").value.trim(), password: $("#p").value}}); start(); } catch (x) { $("#err").textContent = x.message; } };
    $("#rec").onclick = e => { e.preventDefault(); recoverView(); };
  }
  function recoverView(){
    app.innerHTML = `<form class="card auth form" id="f"><h1>Reset developer password</h1>
      <label for="k">Recovery key</label><input id="k" autocomplete="off" required>
      <label for="p">New password (12+ characters)</label><input id="p" type="password" autocomplete="new-password" minlength="12" required>
      <p class="err" id="err" role="alert"></p><button class="btn b-blue full">Reset password</button>
      <p class="hint center"><a href="#" id="back" style="color:var(--blue)">← Back to login</a></p></form>`;
    $("#f").onsubmit = async e => { e.preventDefault();
      try { await api("/api/dev/recover", {method:"POST", body:{recovery_key: $("#k").value.trim(), password: $("#p").value}}); toast("Password reset — log in now"); loginView(); } catch (x) { $("#err").textContent = x.message; } };
    $("#back").onclick = e => { e.preventDefault(); loginView(); };
  }
  $("#logout").onclick = async () => { try { await api("/api/dev/logout", {method:"POST", body:{}}); } catch {} stop(); loginView(); };
  function go(t){
    tab = t; stop(); window.scrollTo(0, 0); dirty = false;
    setNav(t);
    // v10.15 👑 God Mode: Home + the new sections live in god.js (window.GodViews); the older screens below open from its tiles.
    const GV = window.GodViews || {}; if (window.GodHooks && GodHooks.nav) GodHooks.nav(t);
    if (GV[t]) return GV[t]();
    const v = ({dukaan: dukaanView, home: homeView, health: healthView, shops: shopsView, notify: notifyView, payments: paymentsView, cloud: cloudView, audit: auditView, platform: platformView, landing: landingView, errors: errorsView})[t]();
    if (t === "platform") Promise.resolve(v).then(() => { if (tab === "platform" && $("#alHost")) alertCard($("#alHost")); }); // v10.6: 🔔 alert toggle in Settings too
  }
  // v10.3: 5 simple sections (v10.12.5: 6 — 📢 Notify has its own bottom tab). Settings + Logs carry sub-tabs; the old tab names still work (#landing, #health…).
  const SEC = {home:"home", shops:"shops", notify:"notify", payments:"payments", platform:"settings", landing:"settings", cloud:"settings", audit:"logs", health:"logs", errors:"logs", dukaan:"logs"};
  const lastSub = {settings: "platform", logs: "dukaan"};
  function setNav(t){
    const sec = SEC[t] || "home"; if (sec === "settings" || sec === "logs") lastSub[sec] = t;
    document.querySelectorAll("#tabs [data-sec]").forEach(b => b.setAttribute("aria-current", b.dataset.sec === sec ? "page" : "false"));
    document.querySelectorAll(".subnav").forEach(n => { n.hidden = n.dataset.for !== sec; });
    document.querySelectorAll(".subnav [data-tab]").forEach(b => b.setAttribute("aria-current", b.dataset.tab === t ? "page" : "false"));
    document.body.dataset.sec = sec;
    try { history.replaceState(null, "", "#" + t); } catch {}
  }
  $("#tabs").onclick = e => { const b = e.target.closest("[data-sec]"); if (!b) return; const s = b.dataset.sec; go(s === "settings" || s === "logs" ? lastSub[s] : s); };
  document.querySelectorAll(".subnav").forEach(n => n.onclick = e => { const b = e.target.closest("[data-tab]"); if (b) go(b.dataset.tab); });

  // v10.4: 📢 Notify — notices into the shopkeepers' 🔔 panel (+ free push). Target one / chosen / ALL shops; read counts; resolve an issue; delete.
  const NTY = [["message","💬","Message"],["update","🚀","Update"],["feature","✨","New feature"],["issue","⚠️","Issue"],["bill","🧾","Bill"],["due","⏰","Due reminder"]];
  const NTL = Object.fromEntries(NTY.map(([k, ic, l]) => [k, [ic, l]]));
  async function notifyView(){
    let r; try { r = await api("/api/dev/notices"); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    if (tab !== "notify") return;
    const st = notifyView.st || (notifyView.st = {type: "message", target: "shops", ids: []});
    st.ids = st.ids.filter(id => r.shops.some(s => s.id === id));
    const PH = {message: ["Hello! An important note…", "Write your message here"], update: ["App update: a new version is out", "What changed, in 1–2 lines"], feature: ["New feature: …", "What's new and how to use it"],
      issue: ["Problem showing orders", "What the problem is and what we're doing about it"], bill: ["Subscription bill", "Amount, due date, UPI…  (for a real bill: Shops → 🧾 Send bill)"], due: ["Recharge reminder", "When to recharge by"]};
    app.innerHTML = `<div class="ph"><h2>📢 Notify <span class="muted">→ shop 🔔 panel</span></h2></div>
      <form class="card nf" id="nf" novalidate>
        <div class="nf-types" role="group" aria-label="Type">${NTY.map(([k, ic, l]) => `<button type="button" class="nt nt-${k}" data-t="${k}" aria-pressed="${st.type === k}"><span aria-hidden="true">${ic}</span>${l}</button>`).join("")}</div>
        <label for="nTitle">Title</label><input id="nTitle" maxlength="120" placeholder="${esc(PH[st.type][0])}" value="${esc(st.title || "")}">
        <label for="nBody">Message</label><textarea id="nBody" rows="4" maxlength="1500" placeholder="${esc(PH[st.type][1])}">${esc(st.body || "")}</textarea>
        <div id="nIssue" class="nf-issue" ${st.type === "issue" ? "" : "hidden"}><label for="nFix">🛠️ When will it be fixed? <small class="muted">(expected fix, IST)</small></label><input id="nFix" type="datetime-local" value="${esc(st.fix || "")}">
          <small class="muted">A banner shows at the top of the shop panel until you tap “✅ Resolve”.</small></div>
        <label class="sw-row"><span><b>📌 Pin on top</b><br><small class="muted">Important notice stays at the top.</small></span><input type="checkbox" id="nPin" ${st.pin || st.type === "issue" ? "checked" : ""}></label>
        <div class="nf-to"><b>Send to</b>
          <div class="fseg" role="group" aria-label="Send to"><button type="button" data-tg="shops" aria-pressed="${st.target === "shops"}">🏪 Selected shops <i>${st.ids.length}</i></button><button type="button" data-tg="all" aria-pressed="${st.target === "all"}">🌐 ALL shops <i>${r.shops.length}</i></button></div>
          <div class="nf-shops" id="nShops" ${st.target === "all" ? "hidden" : ""}>${r.shops.map(s => `<label class="nf-shop"><input type="checkbox" value="${s.id}" ${st.ids.includes(s.id) ? "checked" : ""}><span>${esc(s.name)}</span><small class="pill ${esc(s.status)}">${esc((SVC[s.status] || [s.status])[0])}</small></label>`).join("") || `<p class="muted">No shops yet.</p>`}</div></div>
        <p class="err" id="nErr" role="alert"></p>
        <button class="btn b-green full nf-send" id="nSend">📢 Send</button>
      </form>
      <h2>📬 Sent <span class="muted">${r.notices.length}</span></h2>
      <div class="nlist">${r.notices.map(n => { const t = NTL[n.type] || ["🔔", n.type], pct = n.recipients ? Math.round(100 * n.reads / n.recipients) : 0;
        return `<div class="card ncard nt-${esc(n.type)}" data-id="${n.id}"><div class="nc-top"><span class="nc-ic" aria-hidden="true">${t[0]}</span><div class="nc-main"><b>${esc(n.title)}</b>
          <small class="muted">${esc(t[1])} · ${esc(ist(n.created_at))} · ${n.target === "all" ? "🌐 ALL" : "🏪 " + esc(n.shop_names || "—")}${n.created_by.startsWith("auto") ? " · 🤖 auto" : ""}</small></div>${n.pinned ? `<span class="pill sub-due">📌</span>` : ""}</div>
          ${n.body ? `<p class="nc-body">${esc(n.body)}</p>` : ""}
          ${n.type === "issue" ? `<p class="nc-fix ${n.resolved_at ? "ok" : ""}">${n.resolved_at ? "✅ Resolved " + esc(ist(n.resolved_at)) : "🛠️ Fix by: <b>" + (n.fix_by ? esc(ist(n.fix_by)) : "—") + "</b> · banner ON"}</p>` : ""}
          <div class="nc-read"><span class="nc-bar"><i style="width:${pct}%"></i></span><span>👁 <b>${n.reads}/${n.recipients}</b> read</span></div>
          <div class="actions">${n.type === "issue" && !n.resolved_at ? `<button class="btn b-green" data-nr="${n.id}">✅ Resolve</button>` : ""}<button class="btn b-gray danger" data-nd="${n.id}">🗑 Delete</button></div></div>`; }).join("")
        || `<div class="empty"><span aria-hidden="true">📭</span><b>Nothing sent yet</b><p class="muted">Send your first notice above: a bill, update, issue or message.</p></div>`}</div>
      <details class="more"><summary>⏰ Auto reminders (free cron)</summary><div class="more-in">
        <p class="muted">Daily at ${esc(r.reminders.cron)}: each shop gets a ⏰ reminder ~3 days before its plan/trial ends, on the last day, and when it ends (once per stage). Last run: <b>${r.reminders.last_run ? esc(ist(r.reminders.last_run)) : "not yet"}</b>${r.reminders.last_run ? ` · ${num(r.reminders.last_created)} new` : ""}</p>
        <button class="btn b-gray" type="button" id="nRun">⏰ Check now</button></div></details>`;
    const keep = () => { st.title = $("#nTitle").value; st.body = $("#nBody").value; st.fix = $("#nFix").value; st.pin = $("#nPin").checked; };
    app.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { keep(); st.type = b.dataset.t; if (st.type === "issue") st.pin = true; notifyView(); });
    app.querySelectorAll("[data-tg]").forEach(b => b.onclick = () => { keep(); st.target = b.dataset.tg; notifyView(); });
    app.querySelectorAll("#nShops input").forEach(c => c.onchange = () => { st.ids = [...app.querySelectorAll("#nShops input:checked")].map(x => Number(x.value)); const i = app.querySelector('[data-tg="shops"] i'); if (i) i.textContent = st.ids.length; });
    $("#nf").onsubmit = async e => { e.preventDefault(); keep(); const err = $("#nErr"); err.textContent = "";
      if (!st.title.trim()) { err.textContent = "Enter a title"; return; }
      if (st.target !== "all" && !st.ids.length) { err.textContent = "Pick at least one shop (or ALL shops)"; return; }
      const n = st.target === "all" ? r.shops.length : st.ids.length;
      if (!await ask(`${NTL[st.type][0]} Send to ${n} shop(s)?`, st.target === "all" ? "🌐 ALL shops — goes to every shop's 🔔 panel (+ push)." : r.shops.filter(s => st.ids.includes(s.id)).map(s => s.name).join(", "), "📢 Send", "b-green")) return;
      const btn = $("#nSend"); btn.disabled = true;
      try { const x = await api("/api/dev/notices", {method: "POST", body: {type: st.type, title: st.title.trim(), body: st.body.trim(), fix_by: st.type === "issue" ? st.fix : undefined, pinned: st.pin, target: st.target, shop_ids: st.ids}});
        toast(`✅ Sent to ${x.recipients} shop panel(s) · 📲 push ${x.push.accepted}`); notifyView.st = {type: st.type, target: st.target, ids: st.ids}; notifyView(); }
      catch (x) { btn.disabled = false; if (!authFail(x)) err.textContent = x.message; } };
    app.querySelectorAll("[data-nr]").forEach(b => b.onclick = async () => { if (!await ask("✅ Is the issue fixed?", "The banner will be removed from shop panels.", "✅ Resolve", "b-green")) return;
      try { await api(`/api/dev/notices/${b.dataset.nr}/resolve`, {method: "POST", body: {}}); toast("Resolved — banner removed"); notifyView(); } catch (e) { fail(e); } });
    app.querySelectorAll("[data-nd]").forEach(b => b.onclick = async () => { if (!await ask("🗑 Delete this notice?", "It will be removed from every shop panel.", "🗑 Delete")) return;
      try { await api(`/api/dev/notices/${b.dataset.nd}`, {method: "DELETE"}); toast("Deleted"); notifyView(); } catch (e) { fail(e); } });
    $("#nRun").onclick = async e => { e.target.disabled = true; try { const x = await api("/api/dev/notices/reminders", {method: "POST", body: {}}); toast(`⏰ ${x.checked} shops checked · ${x.created.length} new reminders`); notifyView(); } catch (er) { e.target.disabled = false; fail(er); } };
  }
  // v10.3: in-page yes/no modal; the browser's own dialog is not used anywhere in dev
  function ask(title, text, okLabel = "Yes, do it", kind = "b-red"){
    return new Promise(res => {
      const m = modal(`<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ""}<div class="dm-btns"><button type="button" class="btn b-gray" id="akNo">Cancel</button><button type="button" class="btn ${kind}" id="akYes">${esc(okLabel)}</button></div>`);
      let done = false; const fin = v => { if (done) return; done = true; m.close(); res(v); };
      m.q("#akNo").onclick = () => fin(false); m.q("#akYes").onclick = () => fin(true);
      m.back.addEventListener("click", e => { if (e.target === m.back) fin(false); });
      const k = e => { if (e.key === "Escape") { document.removeEventListener("keydown", k); fin(false); } }; document.addEventListener("keydown", k);
      setTimeout(() => m.q("#akYes").focus(), 30);
    });
  }
  function pill(svc){ const p = $("#svcPill"); p.hidden = false; p.className = "pill " + svc.status; p.textContent = SVC[svc.status][0]; }

  // ---------- v10.9: 📊 Dukaan wise — har dukaan ka hisaab (orders, kamai, shopkeeper login/logout, customers + visits) ----------
  const DW_RANGES = [["today","Today"],["7d","7 days"],["30d","30 days"],["all","All"]];
  const dev2 = d => d === "mobile" ? "📱 Mobile" : d === "desktop" ? "💻 Desktop" : "";
  async function dukaanView(){
    const st = dukaanView.st || (dukaanView.st = {range: "7d", open: new Set()});
    if (!app.querySelector("#dw")) app.innerHTML = `<p class="muted center">Loading…</p>`;
    let r; try { r = await api("/api/dev/dukaan?range=" + st.range); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    if (tab !== "dukaan") return;
    const card = s => `<article class="card dw-shop${st.open.has(s.id) ? " open" : ""}" data-dw="${s.id}">
      <button type="button" class="dw-head" aria-expanded="${st.open.has(s.id)}"><b>${esc(s.name)}</b>${s.status !== "active" ? ` <small class="pill">${esc(s.status)}</small>` : ""}<span class="dw-car" aria-hidden="true">▾</span></button>
      <div class="dw-stats">
        <div><span>🛒 Orders</span><b>${num(s.orders)}</b>${s.delivered ? `<small>${num(s.delivered)} delivered</small>` : ""}</div>
        <div><span>💰 Earnings</span><b>${money(s.kamai_paise)}</b></div>
        <div><span>🔑 Shopkeeper</span><b>${num(s.logins)} in · ${num(s.logouts)} out</b><small>Last login: ${s.last_login ? ist(s.last_login) : "—"}</small></div>
        <div><span>👥 Customers</span><b>${num(s.customers)}</b><small>${num(s.visits)} visit</small></div>
      </div><div class="dw-detail" ${st.open.has(s.id) ? "" : "hidden"}></div></article>`;
    const t = r.totals;
    app.innerHTML = `<div id="dw"><h2>📊 Shop-wise</h2>
      <div class="dw-chips" role="group" aria-label="Range">${DW_RANGES.map(([k, l]) => `<button type="button" class="chip${st.range === k ? " on" : ""}" data-range="${k}" aria-pressed="${st.range === k}">${l}</button>`).join("")}</div>
      <p class="hint">⏱️ Login/visit counts start 25 Oct · 💰 Earnings = total of delivered orders · test orders not counted</p>
      <p class="dw-tot muted">All shops: 🛒 ${num(t.orders)} · 💰 ${money(t.kamai_paise)} · 👥 ${num(t.customers)} · ${num(t.visits)} visit</p>
      <div class="dw-list">${r.shops.map(card).join("") || `<p class="muted center">No shops yet.</p>`}</div></div>`;
    app.querySelectorAll("[data-range]").forEach(b => b.onclick = () => { st.range = b.dataset.range; dukaanView(); });
    app.querySelectorAll(".dw-shop").forEach(el => { const id = Number(el.dataset.dw); if (st.open.has(id)) dwDetail(el, id, st.range);
      el.querySelector(".dw-head").onclick = () => { const open = !st.open.has(id); if (open) st.open.add(id); else st.open.delete(id);
        el.classList.toggle("open", open); el.querySelector(".dw-head").setAttribute("aria-expanded", open); el.querySelector(".dw-detail").hidden = !open; if (open) dwDetail(el, id, st.range); }; });
  }
  async function dwDetail(el, id, range){
    const box = el.querySelector(".dw-detail"); box.innerHTML = `<p class="muted">Loading…</p>`;
    let d; try { d = await api(`/api/dev/dukaan/${id}?range=${range}`); } catch (e) { if (!authFail(e)) box.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    const c = d.customers, a = d.anonymous;
    box.innerHTML = `<h4>👥 Customers${d.customers_total > c.length ? ` <small>(top ${c.length} of ${d.customers_total})</small>` : ""}</h4>
      ${c.length || a.devices ? `<ul class="dw-rows">${c.map(x => `<li><b>${esc(x.name)}</b><span>${x.orders} order${x.visits ? ` · ${x.visits} visit` : ""}</span><small>${x.last_seen ? ist(x.last_seen) : "—"}</small></li>`).join("")}
        ${a.devices ? `<li class="muted"><b>No name</b><span>${a.devices} phone · ${a.visits} visit</span><small>${a.last_visit ? ist(a.last_visit) : "—"}</small></li>` : ""}</ul>` : `<p class="muted">No customers in this range.</p>`}
      <h4>🔑 Login / Logout</h4>
      ${d.logins.length ? `<ul class="dw-rows">${d.logins.map(x => `<li><b>${x.kind === "login" ? "🟢 Login" : "🔴 Logout"}</b><span>${x.how === "expired" ? "⏳ session expired" : esc(dev2(x.device))}</span><small>${ist(x.ts)}</small></li>`).join("")}</ul>` : `<p class="muted">No logins/logouts in this range.</p>`}`;
  }
  // ---------- health ----------
  async function healthView(){
    if (!app.querySelector("#hv")) app.innerHTML = `<p class="muted center">Loading…</p>`;
    let h; try { h = await api("/api/dev/health?stale=" + staleMin); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    if (tab !== "health") return;
    pill(h.service); 
    document.querySelector(".brand .dot").classList.toggle("bad", !h.server.ok);
    $("#errBadge").hidden = !h.errors.last_24h;
    const o = h.orders, pr = h.products, pu = h.push, tr = h.traffic, bs = o.by_status;
    const maxBar = Math.max(1, ...tr.hours.map(x => x.api + x.page));
    const statusChips = ["pending","accepted","preparing","ready","out_for_delivery","delivered","rejected","cancelled"].map(k => `<span class="chip">${k.replace(/_/g," ")} <b>${bs[k]||0}</b></span>`).join("");
    const shopAlert = pu.shop_alerts_enabled ? `On · ${pu.shop_alert_devices} device${pu.shop_alert_devices>1?"s":""}` : "Off";
    app.innerHTML = `<div id="hv">
      <h2>❤️ Server</h2>
      <div class="card"><div class="status-line"><span class="big-dot ${h.server.ok?"ok":"bad"}"></span><div><b>${h.server.ok ? "Server & database OK" : "Database not answering"}</b>
        <small>DB answered in ${h.server.db_ms} ms${h.server.colo ? " · edge " + esc(h.server.colo) : ""} · checked ${ist(h.now)}</small></div></div>
        <div class="sep"></div><div class="rows">
        <div class="row"><span>App version</span><span class="mono">v${esc(h.server.version)}</span></div>
        <div class="row"><span>Build</span><span class="mono">${esc(h.server.build_time)}</span></div>
        <div class="row"><span>This build first served</span><span>${ist(h.server.first_served_at)}</span></div>
        <div class="row"><span>Shop open now</span><span>${h.store.open.open ? "Yes" : "No (" + esc(h.store.open.reason||"") + ")"}</span></div>
        <div class="row"><span>Shop phone / WhatsApp</span><span>${h.store.phone_set?"set":"not set"} / ${h.store.whatsapp_set?"set":"not set"}</span></div>
        </div></div>
      <h2>🧾 Orders</h2>
      <div class="grid">
        <div class="kpi"><b>${num(o.today)}</b><small>Today</small></div>
        <div class="kpi"><b>${num(o.last_7_days)}</b><small>Last 7 days</small></div>
        <div class="kpi"><b>${num(o.total)}</b><small>All time</small></div>
        <div class="kpi ${o.stale_pending_count ? "bad" : "ok"}"><b>${num(o.stale_pending_count)}</b><small>Pending &gt; ${staleMin} min</small></div></div>
      <div class="card" style="margin-top:10px"><div class="rows">
        <div class="row"><span>Last order</span><span>${o.last_order_at ? ist(o.last_order_at) + " · " + ago(o.last_order_at) : "none yet"}</span></div>
        <div class="row"><span>Order value, 7 days</span><span>${money(o.value_7_days_paise)}</span></div></div>
        <div class="sep"></div><div class="chips">${statusChips}</div>
        ${o.stale_pending.length ? `<div class="sep"></div><b>Shop not responding</b><ul class="list">${o.stale_pending.map(x => `<li><span class="mono">${esc(x.code)}</span><span>${x.minutes} min · ${money(x.total_paise)}</span></li>`).join("")}</ul>` : ""}
        <form class="form" id="staleF" style="margin-top:10px"><label for="stale">Flag pending orders older than (minutes)</label><div class="row2"><input id="stale" type="number" min="1" max="1440" value="${staleMin}" inputmode="numeric"><button class="ghost">Apply</button></div></form></div>
      <details class="more" id="hvMore" ${healthView.open ? "open" : ""}><summary>More: products, notifications, traffic</summary><div class="more-in">
      <h2>Products</h2>
      <div class="grid">
        <div class="kpi"><b>${num(pr.active)}</b><small>Active items (${num(pr.total)} total)</small></div>
        <div class="kpi ${pr.out_of_stock ? "warn" : "ok"}"><b>${num(pr.out_of_stock)}</b><small>Items out of stock</small></div>
        <div class="kpi"><b>${num(pr.variants_low)}</b><small>Pack sizes low on stock</small></div>
        </div>
      <h2>Notifications (last 24 h)</h2>
      <div class="grid">
        <div class="kpi ok"><b>${num(pu.last_24h.sent)}</b><small>Sent (push service took it)</small></div>
        <div class="kpi ${pu.last_24h.failed ? "bad" : ""}"><b>${num(pu.last_24h.failed)}</b><small>Failed</small></div>
        <div class="kpi"><b>${num(pu.last_24h.expired)}</b><small>Expired (removed)</small></div>
        <div class="kpi ${pu.shop_alerts_enabled ? "ok" : "warn"}"><b style="font-size:19px">${shopAlert}</b><small>Shopkeeper’s order alerts</small></div></div>
      <div class="card" style="margin-top:10px"><div class="rows">
        <div class="row"><span>Shop alert last reached push service</span><span>${pu.shop_last_delivered_to_push_service_at ? ago(pu.shop_last_delivered_to_push_service_at) : "never"}</span></div>
        <div class="row"><span>Customers with updates on</span><span>${num(pu.customer_subscriptions)}</span></div></div>
        <p class="hint">“Sent” means Google/Apple’s push service accepted it, not that the phone showed it.</p></div>
      <h2>Traffic (last 24 h)</h2>
      <div class="grid">
        <div class="kpi"><b>${num(tr.last_24h.api + tr.last_24h.page)}</b><small>Requests (API + pages)</small></div>
        <div class="kpi ${tr.last_24h.rate_limited ? "warn" : ""}"><b>${num(tr.last_24h.rate_limited)}</b><small>Rate-limit hits</small></div>
        <div class="kpi ${tr.last_24h.e5xx ? "bad" : "ok"}"><b>${num(tr.last_24h.e5xx)}</b><small>5xx responses</small></div>
        <div class="kpi ${h.errors.last_24h ? "bad" : "ok"}"><b>${num(h.errors.last_24h)}</b><small>Server errors logged</small></div></div>
      <div class="card" style="margin-top:10px"><b>Requests per hour</b>
        <div class="bars" aria-label="Requests per hour, last 24 hours">${tr.hours.map(x => `<div style="height:${Math.round((x.api + x.page)/maxBar*100)}%" title="${x.api + x.page} requests"></div>`).join("")}</div>
        <div class="bars-x"><span>24 h ago</span><span>now</span></div>
        ${tr.last_24h.blocked ? `<p class="hint">${num(tr.last_24h.blocked)} order attempts blocked while paused.</p>` : ""}</div>
      </div></details>
      ${h.errors.recent.length ? `<h2>Latest errors</h2><div class="card">${h.errors.recent.slice(0,3).map(errItem).join("")}<button class="ghost sm" type="button" id="allErr" style="margin-top:8px">See all errors →</button></div>` : ""}
      <h2>Backup</h2>
      <div class="card"><div class="rows"><div class="row"><span>Last full backup</span><span>${h.backup && h.backup.last_at ? esc(new Date(h.backup.last_at).toLocaleString("en-IN", {timeZone:"Asia/Kolkata", day:"numeric", month:"short", hour:"numeric", minute:"2-digit"})) + (h.backup.last_by ? " · by " + esc(h.backup.last_by === "admin" ? "shop" : h.backup.last_by) : "") : "never"}</span></div></div>
        <p style="margin:10px 0 0"><a class="btn" href="/api/dev/backup" download>⬇️ Download full backup (JSON)</a></p>
        <p class="muted" style="font-size:13px">All shop data except passwords, sessions, server keys and push endpoints. Restore steps are in the README.</p></div>
      <h2>Database</h2>
      <div class="card"><div class="rows"><div class="row"><span>Size</span><span>${bytes(h.db.size_bytes)}</span></div>
        ${Object.entries(h.db.rows).map(([k,v]) => `<div class="row"><span class="mono">${esc(k)}</span><span>${num(v)}</span></div>`).join("")}</div></div>
      <p class="hint center">Aggregates only — no customer names, phones or addresses here. Auto-refreshes every 30 s.</p></div>`;
    $("#staleF").onsubmit = e => { e.preventDefault(); const v = Math.max(1, Math.min(1440, Number($("#stale").value) || 15)); staleMin = v; localStorage.setItem("dev.stale", v); healthView(); };
    const ae = $("#allErr"); if (ae) ae.onclick = () => go("errors");
    const hm = $("#hvMore"); if (hm) hm.ontoggle = () => { healthView.open = hm.open; };
    if (!timer) timer = setInterval(() => { if (tab === "health" && !document.hidden) healthView(); }, 30000);
  }
  const errItem = x => `<div class="err-item"><div class="err-meta"><span class="tag">${x.status ?? x.kind}</span><span class="mono">${esc(x.method)} ${esc(x.route)}</span><span>${ist(x.at)}</span></div><div class="mono">${esc(x.message)}</div></div>`;

  // ---------- service ----------

  // ---------- v5: all shops (approve / reject / pause / billing per shop) ----------
  async function shopsView(){
    let r; try { r = await api("/api/dev/shops"); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    const due = r.shops.filter(s => s.status === "active" && (s.sub.state === "DUE" || s.sub.state === "EXPIRED")).length;
    const AV = ["#16a34a","#f97316","#2563eb","#9333ea","#db2777","#0d9488","#ca8a04"];
    const av = s => `<span class="sc-av" style="background:${AV[s.id % AV.length]}" aria-hidden="true">${esc((String(s.name || "?").trim()[0] || "?").toUpperCase())}</span>`;
    const TY = Object.fromEntries((r.shop_types || []).map(t => [t.type, t])), ty = s => TY[s.type] || {icon: "🛒", short_en: "Kirana", type: "kirana"};
    // v10.12.3 (Krish 8:56 PM: "sabke buttons de do, uske andar sabko differentiate karo"): step 1 = one grid of big category buttons
    // (all 6 types + All, always shown, with counts); step 2 = that category's shops with ONE row of status pills.
    const CATS = [["kirana", "🛒", "Grocery / Kirana", "grocery"], ["restaurant", "🍽️", "Restaurant", "food"], ["salon", "💇", "Salon", "salon"], ["clinic", "🩺", "Clinic", "clinic"], ["repair", "🔧", "Repair", "repair"], ["other", "🏪", "Other", "other"], ["all", "📋", "All shops", "all"]];
    const cat = shopsView.t || null;
    const head = `<div class="ph"><h2>🏪 Shops <span class="muted">${r.shops.length}</span></h2><span class="ph-btns">${due ? `<button class="btn b-amber sm-btn" id="sendDue">📨 Bill to all due (${due})</button>` : ""}</span></div>`;
    const settingsBox = `<details class="more"><summary>⚙️ New shop settings</summary><div class="more-in"><label class="sw-row"><span><b>Auto-approve new shops</b><br><small class="muted">Off = every new sign-up waits for your approval (safer).</small></span><input type="checkbox" id="auto" ${r.auto_approve ? "checked" : ""}></label></div></details>`;
    if (!cat) {
      app.innerHTML = head + `<div class="dv-cats" role="group" aria-label="Shop categories">${CATS.map(([k, ic, nm, st]) => { const list = r.shops.filter(s => k === "all" || s.type === k), w = list.filter(s => s.status === "pending").length;
        return `<button type="button" class="dv-cat dc-${st}" data-cat="${k}"><span class="dc-ic" aria-hidden="true">${ic}</span><b>${esc(nm)}</b><span class="dc-n">${list.length} shop${list.length === 1 ? "" : "s"}</span>${w ? `<span class="dc-w">🕒 ${w} waiting</span>` : ""}</button>`; }).join("")}</div>` + settingsBox;
      app.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { shopsView.t = b.dataset.cat; shopsView.f = "all"; shopsView(); });
    } else {
      const C = CATS.find(c => c[0] === cat) || CATS[6], inCat = r.shops.filter(s => cat === "all" || s.type === cat);
      const filt = shopsView.f || "all";
      const sOk = (s, k) => k === "all" || (k === "closed" ? (s.status === "active" && !s.open_now) : s.status === k);
      const shown = inCat.filter(s => sOk(s, filt));
      const seg = `<div class="fseg" role="group" aria-label="Status">${[["all", "All"], ["active", "✅ Active"], ["pending", "🕒 Waiting"], ["paused", "⏸ Paused"], ["closed", "🔴 Closed"]].map(([k, l]) => `<button type="button" data-f="${k}" aria-pressed="${filt === k}">${l} <i>${inCat.filter(s => sOk(s, k)).length}</i></button>`).join("")}</div>`;
      app.innerHTML = head + `<div class="dv-cathead dc-${C[3]}"><button type="button" class="dv-back" id="catBack">‹ Categories</button><b><span aria-hidden="true">${C[1]}</span> ${esc(C[2])} <span class="muted">${inCat.length}</span></b></div>
      ${seg}
      <div class="shop-list">${shown.map(s => `<div class="card shop-card st-${esc(s.status)}" data-id="${s.id}">
        <div class="shop-top">${av(s)}<div class="sc-main"><b class="sc-name">${esc(s.name)}</b>
          <div class="sc-pills"><span class="pill type-pill" title="${esc(ty(s).en || "")}">${esc(ty(s).icon)} ${esc(ty(s).short_en)}</span><span class="pill ${esc(s.status)}">${esc((SVC[s.status] || [s.status])[0])}</span>${s.status === "active" || s.status === "paused" ? subPill(s.sub) : ""}${s.status === "active" || s.status === "paused" ? `<span class="pill b2p ${s.open_now ? "on" : "off"}">${s.open_now ? "🟢 Open" : "🔴 Closed"}</span>` : ""}${s.payments_pending ? `<span class="pill sub-verify">💰 verify</span>` : ""}</div>
          <small class="muted sc-owner">${esc(s.owner_name || "—")} · ${s.mobile ? `<a href="tel:+91${esc(s.mobile)}">${esc(s.mobile)}</a>` : esc(s.login || "")}</small></div>
          <a class="ghost sm" href="${esc(s.customer_url || s.link)}" target="_blank" rel="noopener" aria-label="Open ${esc(s.name)}">↗</a></div>
        <div class="actions">${s.status === "pending" ? `<button class="btn b-green" data-a="approve">✓ Approve</button><button class="btn b-red" data-a="reject">✕ Reject</button>`
          : s.status === "rejected" ? `<button class="btn b-green" data-a="approve">✓ Approve</button>`
          : `<button class="btn b-blue" data-a="sub">💳 Plan</button>${s.status === "paused" ? `<button class="btn b-green" data-a="resume">▶ Resume</button>` : `<button class="btn b-amber" data-a="pause">⏸ Pause</button>`}<button class="btn ${s.online ? "b-red" : "b-green"}" data-a="b2open">${s.online ? "🔴 Close shop" : "🟢 Open shop"}</button><button class="btn b-gray" data-a="b2qr">🖨️ QR poster</button>`}</div>
        <details class="more"><summary>More</summary><div class="more-in">
          ${s.status === "active" || s.status === "paused" ? `<p class="sub-line">${subLine(s.sub)}</p>` : ""}
          <div class="chips"><span class="chip">#${s.id}</span><span class="chip">Joined <b>${istDate(s.created_at)}</b></span><span class="chip">${money(s.monthly_paise)}/month${s.custom_price ? " (custom)" : ""}</span>${s.open_invoice ? `<span class="chip">Bill <b>${esc(s.open_invoice)}</b></span>` : ""}<span class="chip">🛒 ${s.orders_today} today</span><span class="chip">${s.location ? "📍 Location set" : "📍 No location"}</span><span class="chip">${s.listed ? "👁 In directory" : s.dir_hidden ? "🙈 Hidden by you" : s.is_test ? "🧪 TEST, not listed" : "Not listed"}</span></div>
          <div class="actions">${s.status === "active" || s.status === "paused" ? `<button class="btn b-gray" data-a="b2dir">${s.dir_hidden ? "👁 Show in directory" : "🙈 Hide from directory"}</button>${s.location ? `<button class="btn b-gray" data-a="b2loc" title="${esc(s.location.lat.toFixed(5) + ", " + s.location.lng.toFixed(5))}">📍 Clear location</button>` : ""}<button class="btn b-gray" data-a="bill">🧾 Send bill</button>` : ""}<button class="btn b-gray" data-a="app">📱 Logo / name</button><button class="btn b-gray danger" data-a="delete">🗑 Delete</button></div>
          <div class="muted sm-link">${esc(s.customer_url || s.link)}</div></div></details></div>`).join("") || `<div class="empty"><span aria-hidden="true">${C[1]}</span><b>${inCat.length ? "No shops in this filter" : "No shops in this category yet"}</b><p class="muted">${inCat.length ? "Tap “All” above." : "New sign-ups of this type will show up here."}</p></div>`}</div>` + settingsBox;
      app.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { shopsView.f = b.dataset.f; shopsView(); });
      $("#catBack").onclick = () => { shopsView.t = null; shopsView(); };
    }
    window.__shops = r.shops;
    $("#auto").onchange = async e => { try { const x = await api("/api/dev/settings", {method:"POST", body:{auto_approve: e.target.checked}}); toast(x.auto_approve ? "Auto-approve ON" : "Auto-approve OFF"); } catch (x) { e.target.checked = !e.target.checked; toast(x.message); } };
    if ($("#sendDue")) $("#sendDue").onclick = async () => { if (!await ask(`📨 Send bills to ${due} shop(s)?`, "Bills will be created for all due / expired shops.", "📨 Send bills", "b-amber")) return;
      try { const x = await api("/api/dev/bills/send-due", {method:"POST", body:{}}); billsSent(x.bills); } catch (e) { fail(e); } };
    app.querySelectorAll(".shop-card [data-a]").forEach(b => b.onclick = async () => {
      const card = b.closest(".shop-card"), id = Number(card.dataset.id), a = b.dataset.a, nm = card.querySelector(".sc-name").textContent;
      if (a === "sub") return shopDetail(id);
      if (a === "bill") { b.disabled = true; try { const x = await api(`/api/dev/shops/${id}/bill`, {method:"POST", body:{}}); billsSent([x]); } catch (e) { b.disabled = false; fail(e); } return; }
      if (a === "app") return appEditor(r.shops.find(x => x.id === id));
      if (a === "delete") return deleteModal(r.shops.find(x => x.id === id));
      // v10.12: open / close, directory show / hide, clear location, QR poster — one shop at a time, logged on the server
      if (a === "b2qr") return devPoster(r.shops.find(x => x.id === id), b);
      if (a === "b2open" || a === "b2dir" || a === "b2loc") { const s = r.shops.find(x => x.id === id);
        const body = a === "b2open" ? {online: !s.online} : a === "b2dir" ? {dir_hidden: !s.dir_hidden} : {clear_location: true};
        const q = a === "b2open" ? (s.online ? [`🔴 Close “${nm}”?`, "Customers will see “Closed” and can't order until it is opened again.", "🔴 Close", "b-red"] : [`🟢 Open “${nm}”?`, "Customers can order again.", "🟢 Open", "b-green"])
          : a === "b2dir" ? (s.dir_hidden ? [`👁 Show “${nm}” in the customer directory?`, "It will be listed on /shops again (if it is open and in plan).", "👁 Show", "b-green"] : [`🙈 Hide “${nm}” from the customer directory?`, "Its own link and QR keep working. It just won't be listed on /shops.", "🙈 Hide", "b-amber"])
          : [`📍 Clear the location of “${nm}”?`, "“Near me” won't show a distance for this shop until the shopkeeper sets it again.", "📍 Clear", "b-red"];
        if (!await ask(q[0], q[1], q[2], q[3])) return;
        b.disabled = true;
        try { await api("/api/dev/shops/flags", {method: "POST", body: {shop_id: id, ...body}}); toast(`${nm}: saved`); shopsView(); } catch (e) { b.disabled = false; if (!authFail(e)) toast(e.message); }
        return; }
      if ((a === "reject" || a === "pause") && !await ask(`${a === "reject" ? "✕ Reject" : "⏸ Pause"} “${nm}”?`, a === "pause" ? "The shop will close and customers won't be able to order." : "The shopkeeper won't be able to log in.", a === "reject" ? "✕ Reject" : "⏸ Pause")) return;
      b.disabled = true;
      try { await api("/api/dev/service", {method:"POST", body:{shop_id: id, action: a}}); toast(`${nm}: ${a === "approve" ? "approved" : a === "reject" ? "rejected" : a === "pause" ? "paused" : "resumed"}`); shopsView(); }
      catch (e) { b.disabled = false; if (!authFail(e)) toast(e.message); }
    });
  }
  // v10.12: A4 QR poster for any shop (same poster the shopkeeper downloads), made in the browser
  async function devPoster(s, b){ if (!s) return; if (b) b.disabled = true;
    try { if (!window.AKQR) await new Promise((ok, no) => { const sc = document.createElement("script"); sc.src = "/qr.js?v=" + (document.querySelector('meta[name="ak-ver"]') || {}).content; sc.onload = ok; sc.onerror = () => no(new Error("Could not load the QR maker")); document.head.appendChild(sc); });
      const blob = await AKQR.poster({url: s.customer_url, name: s.name, nameEn: "", phone: "", lang: "en"});
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `QR-poster-${s.slug}.png`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      toast("Poster downloaded"); } catch (e) { toast(e.message); } if (b) b.disabled = false; }
  // v10.4: bills go straight into each shop's 🔔 notification panel (+ push). WhatsApp is only an optional small share link.
  function billsSent(bills, back){
    const ok = bills.filter(b => !b.error);
    const d = document.createElement("div"); d.className = "once-back";
    d.innerHTML = `<div class="card once"><h3>🧾 ${ok.length} bill${ok.length === 1 ? "" : "s"} sent to the 🔔 notification panel</h3>
      ${bills.map(b => b.error ? `<p class="err">${esc(b.shop_name)}: ${esc(b.error)}</p>` : `<div class="bill-row"><p><b>${esc(b.shop_name)}</b><br><span class="muted">${esc(b.invoice.number)} · ${money(b.invoice.amount_paise)} · ${b.invoice.months} month${b.invoice.months > 1 ? "s" : ""} · due ${istDate(b.invoice.due_at)}</span><br>
        <small class="muted">✅ Delivered to the shop panel · ${b.push && b.push.accepted ? `📲 push to ${b.push.accepted} device(s)` : "🔕 push off — they'll see it when they open the app"}</small></p>
        ${b.wa_url ? `<a class="wa-mini" href="${esc(b.wa_url)}" target="_blank" rel="noopener">📤 also share on WhatsApp (optional)</a>` : ""}</div>`).join("")}
      <button class="btn b-green full" type="button" id="onceOk">👍 Done</button></div>`;
    document.body.appendChild(d); d.querySelector("#onceOk").onclick = () => { d.remove(); (back || shopsView)(); };
  }
  // ---------- v6: per-shop home-screen app (override + lock) and platform brand ----------
  const loadS = src => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("load failed")); document.head.appendChild(s); });
  const devUp = sid => data_url => api("/api/dev/image", {method:"POST", body:{shop_id: sid, data_url}}).then(r => r.image_id);
  function iconEditor(host, {title, name, color, preview, maxLen, lockable, lock, onSave}){
    let pending = null, col = color || "#1f6b3a", prev = preview || null;
    host.innerHTML = `<h3>${esc(title)}</h3><div class="ie"><div class="ie-prev"><div class="ie-ic" id="ieIc"></div><span id="ieNm"></span></div>
      <div class="ie-f"><label>Name <small class="muted" id="ieCnt"></small><input id="ieName" value="${esc(name || "")}" maxlength="40"></label>
      <div class="ie-row"><label class="btn b-gray">🖼️ Logo<input type="file" accept="image/*" id="ieFile" hidden></label><button type="button" class="btn b-gray" id="ieIni">🔤 Letters</button><input type="color" id="ieCol" value="${esc(col)}" aria-label="Colour"></div>
      ${lockable ? `<label class="sw-row"><span><b>🔒 Lock</b><br><small class="muted">Shopkeeper can't change logo/name</small></span><input type="checkbox" id="ieLock" ${lock ? "checked" : ""}></label>` : ""}
      <button type="button" class="btn b-green" id="ieSave">Save</button></div></div>`;
    const q = s => host.querySelector(s);
    const paint = () => { const nm = q("#ieName").value.trim(); q("#ieNm").textContent = nm; const ic = q("#ieIc"); ic.style.background = col; ic.innerHTML = prev ? `<img src="${esc(prev)}" alt="">` : esc(AppIcon.initials(nm));
      const n = AppIcon.count(nm); q("#ieCnt").textContent = `${n}/${maxLen}`; q("#ieCnt").style.color = n > maxLen ? "#ef4444" : ""; };
    paint(); q("#ieName").oninput = paint;
    q("#ieCol").oninput = e => { col = e.target.value; if (pending && pending.ini) { pending = {...AppIcon.fromInitials(q("#ieName").value.trim(), col), ini: true}; prev = pending.i192; } paint(); };
    q("#ieFile").onchange = async e => { const f = e.target.files[0]; if (!f) return; try { pending = await AppIcon.fromFile(f, col); prev = pending.i192; paint(); } catch (x) { toast(x.message); } };
    q("#ieIni").onclick = () => { pending = {...AppIcon.fromInitials(q("#ieName").value.trim(), col), ini: true}; prev = pending.i192; paint(); };
    q("#ieSave").onclick = async e => { const nm = q("#ieName").value.trim(); if (AppIcon.count(nm) > maxLen) return toast(`Name: max ${maxLen} characters`); e.target.disabled = true;
      try { await onSave({name: nm, color: col, pending, lock: q("#ieLock") ? q("#ieLock").checked : undefined}); toast("Saved"); } catch (x) { if (!authFail(x)) toast(x.message); } e.target.disabled = false; };
  }
  async function drawBrand(){
    const host = $("#brandCard"); if (!host) return; await loadS("/appicon.js");
    let b; try { b = (await api("/api/dev/brand")).brand; } catch (e) { host.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
    iconEditor(host, {title: "Platform brand (landing page, shopkeeper & dev app)", name: b.name, color: "#1f6b3a", preview: b.icon_urls.i192, maxLen: 30,
      onSave: async ({name, pending}) => { const body = {name}; if (pending) body.icons = await AppIcon.uploadAll(pending, devUp("brand")); await api("/api/dev/brand", {method:"POST", body}); $("#shopName").textContent = name; }});
  }
  async function appEditor(s){
    if (!s) return; await loadS("/appicon.js");
    app.innerHTML = `<p><button type="button" class="ghost sm" id="back">← Shops</button></p><div class="card" id="appCard"></div>
      <div class="card"><p class="muted">Customer link: <b>${esc(s.customer_url)}</b><br>Manifest: <a href="/s/${esc(s.slug)}/manifest.webmanifest" target="_blank" rel="noopener">/s/${esc(s.slug)}/manifest.webmanifest</a></p></div>`;
    $("#back").onclick = () => shopsView();
    iconEditor($("#appCard"), {title: `📱 ${s.name} — home-screen logo & name`, name: s.app.name || s.app.home_name, color: s.app.color, preview: s.app.icon_urls.i192, maxLen: 12, lockable: true, lock: s.app.lock,
      onSave: async ({name, color, pending, lock}) => { const body = {shop_id: s.id, name, theme: color, lock}; if (pending) body.icons = await AppIcon.uploadAll(pending, devUp(s.id)); const r = await api("/api/dev/shops/app", {method:"POST", body}); s.app = r.app; }});
  }
  // ---------- errors ----------
  async function errorsView(){
    let r; try { r = await api("/api/dev/errors"); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    app.innerHTML = `<h2>⚠️ Server errors <span class="muted">${r.errors.length}</span></h2>
      ${r.errors.length ? `<div class="card">${r.errors.map(errItem).join("")}</div>` : `<div class="empty"><span aria-hidden="true">🎉</span><b>No errors</b><p class="muted">The server is running fine.</p></div>`}
      <div class="row2"><button class="ghost" type="button" id="testErr">Send a test error</button><button class="ghost" type="button" id="clrErr" ${r.errors.length?"":"disabled"}>Clear log</button></div>
      <p class="hint">Uncaught exceptions and 5xx responses: route, time and message only (numbers, emails and tokens are masked). Keeps the latest 500.</p>`;
    $("#testErr").onclick = async () => { try { await api("/api/dev/test-error", {method:"POST", body:{}}); } catch {} errorsView(); };
    $("#clrErr").onclick = async () => { if (!await ask("🧹 Clear the error log?", "", "🧹 Clear")) return; try { await api("/api/dev/errors/clear", {method:"POST", body:{}}); } catch (e) { toast(e.message); } errorsView(); };
  }

  // ================= v10.6: LIVE panel — no manual refresh + 🔔 dev alerts =================
  // One tiny poll (/api/dev/pulse, ~every 15 s) ONLY while this page is open and visible; stops when hidden. When the counts change,
  // the open list (Home / Dukaanein / Payments / Notify / Errors) redraws in place — never while you are typing, never under an open popup.
  const PULSE_MS = 15000;
  let pulseT = null, pulsing = false, lastSig = null, dirty = false, live = null;
  let lastEv = (() => { try { const v = localStorage.getItem("dev.lastEv"); return v == null || v === "" ? null : Number(v) || 0; } catch { return null; } })(); // null = first visit on this device: no toast for old events
  const LIVE_VIEW = {home: [".hello", () => homeView()], shops: [".shop-list", () => shopsView()], payments: ["#tg", () => paymentsView()], notify: ["#nf", () => notifyView()], errors: ["#testErr", () => errorsView()]};
  app.addEventListener("input", e => { const t = e.target; if (!t || !t.matches) return;
    if (t.matches("textarea, select, input:not([type=checkbox]):not([type=radio])") || tab === "notify") dirty = true; });
  const setBadge = (el, n) => { if (!el) return; el.hidden = !n; el.textContent = n > 99 ? "99+" : String(n || ""); };
  function applyPulse(r){
    live = r; if (window.GodHooks && GodHooks.pulse) { try { GodHooks.pulse(r); } catch {} }
    setBadge($("#nbShops"), r.shops.waiting); setBadge($("#nbPay"), r.pay_verify);
    const h = $("#nbHome"); if (h) h.hidden = !r.events.unread;
    const todo = (r.shops.waiting || 0) + (r.pay_verify || 0);
    document.title = (todo ? "(" + todo + ") " : "") + document.title.replace(/^\(\d+\+?\)\s*/, "");
  }
  const EVT = {signup: "🆕 New shop", utr: "💰 Payment received", expiring: "⏰ Plan ending soon", expired: "⛔ Auto-pause", first_order: "🎉 First order", test: "🔔 Test"};
  const evHash = u => { const m = /#([\w-]+)/.exec(u || ""); return m ? m[1] : "home"; };
  function liveToast(evs){
    const el = $("#ltoast"); if (!el || !evs.length) return;
    const e = evs[0];
    el.innerHTML = `<span class="lt-tx"><b>${esc(EVT[e.kind] || "🔔 New update")}: ${esc(e.label || "")}</b>${evs.length > 1 ? `<small>+${evs.length - 1} more</small>` : `<small>${esc(String(e.title || "").replace(/^\S+\s+/, ""))}</small>`}</span><span class="lt-go" aria-hidden="true">→</span>`;
    el.dataset.go = evHash(e.url); el.dataset.ids = evs.map(x => x.id).join(","); el.hidden = false; el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    clearTimeout(liveToast.t); liveToast.t = setTimeout(() => { el.classList.remove("show"); setTimeout(() => { el.hidden = true; }, 300); }, 9000);
  }
  function openHash(h){
    if (h === "waiting") { shopsView.t = "all"; shopsView.f = "pending"; return go("shops"); }
    const ok = ["home","shops","notify","payments","cloud","audit","landing","platform","health","errors","dukaan","g-shops","g-shop","g-orders","g-customers","g-notify","g-website","g-catalog","g-reports","g-rules","g-system","g-activity","g-features"]; go(ok.includes(h) ? h : "home");
  }
  $("#ltoast").onclick = () => { const el = $("#ltoast"); el.classList.remove("show"); el.hidden = true;
    const ids = (el.dataset.ids || "").split(",").map(Number).filter(Boolean); if (ids.length) api("/api/dev/events/read", {method: "POST", body: {ids}}).catch(() => {});
    openHash(el.dataset.go || "home"); };
  async function softRefresh(){
    const v = LIVE_VIEW[tab]; if (!v || !app.querySelector(v[0])) return;            // a sub-screen (shop detail, editor…) is open: leave it alone
    if (document.querySelector(".once-back, .dmodal")) return;                        // a popup is open
    const ae = document.activeElement; if (dirty || (ae && app.contains(ae) && ae.matches("input, textarea, select"))) return;
    const y = window.scrollY, t0 = tab;
    const openIds = [...app.querySelectorAll("[data-id] details[open]")].map(d => d.closest("[data-id]").dataset.id);
    const openIdx = [...app.querySelectorAll("details")].map(d => d.open);
    await v[1]();
    if (tab !== t0) return;
    const all = [...app.querySelectorAll("details")];
    if (all.length === openIdx.length) all.forEach((d, i) => { if (openIdx[i]) d.open = true; });
    openIds.forEach(id => { const d = app.querySelector(`[data-id="${CSS.escape(id)}"] details`); if (d) d.open = true; });
    window.scrollTo(0, y);
  }
  async function pulse(){
    if (!me || document.hidden || pulsing) return; pulsing = true;
    try {
      const r = await api("/api/dev/pulse" + (lastEv == null ? "" : "?since=" + lastEv));
      applyPulse(r);
      const fresh = lastEv != null && r.new && r.new.length ? r.new : [];
      if (r.events.last_id !== lastEv) { lastEv = r.events.last_id; try { localStorage.setItem("dev.lastEv", String(lastEv)); } catch {} }
      const changed = lastSig !== null && r.sig !== lastSig; lastSig = r.sig;
      if (changed) await softRefresh();      // redraw first, so the list already shows what the toast says
      if (fresh.length) liveToast(fresh);
    } catch (e) { if (e.status === 401) { stopLive(); authFail(e); } }
    finally { pulsing = false; }
  }
  function schedule(){ clearTimeout(pulseT); pulseT = null; if (!me || document.hidden) return; pulseT = setTimeout(async () => { await pulse(); schedule(); }, PULSE_MS); }
  function startLive(){ pulse().then(schedule); }
  function stopLive(){ clearTimeout(pulseT); pulseT = null; lastSig = null; }
  document.addEventListener("visibilitychange", () => { if (document.hidden) { clearTimeout(pulseT); pulseT = null; } else if (me) startLive(); });
  addEventListener("focus", () => { if (me && !document.hidden && !pulsing) { clearTimeout(pulseT); startLive(); } });
  addEventListener("hashchange", () => { if (!me) return; const h = (location.hash || "").slice(1); if (h === "waiting" || (h && h !== tab)) openHash(h); });
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.type === "ak-push" && me) { clearTimeout(pulseT); startLive(); } });

  // ---------- 🔔 Mujhe alert bhejo (free Web Push to this device through the Dev app's own worker, scope /dev) ----------
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const b64u2u8 = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); s += "=".repeat((4 - s.length % 4) % 4); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  const keyOf = sub => { const k = sub && sub.options && sub.options.applicationServerKey; return k ? btoa(String.fromCharCode(...new Uint8Array(k))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : ""; };
  async function devReg(){ if (!window.AKPWA) return null; try { return await window.AKPWA.register(); } catch { return null; } }
  async function myEndpoint(){ if (!pushOK()) return null; try { const reg = await devReg(); const s = reg && await reg.pushManager.getSubscription(); return s ? s.endpoint : null; } catch { return null; } }
  async function alertOn(){
    if (!pushOK()) throw Object.assign(new Error(isIOS() && !isStandalone() ? "iPhone: first Share ⬆️ → Add to Home Screen, then turn it ON from that app" : "Alerts don't work in this browser — open it in Chrome"), {code: "unsupported"});
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") throw Object.assign(new Error(perm === "denied" ? "Notifications are blocked — allow them in Chrome ⋮ → Settings → Site settings → Notifications" : "You didn't tap Allow — try again"), {code: perm});
    const reg = await devReg(); if (!reg) throw new Error("Service worker didn't start — reload the page and try again");
    const {public_key} = await api("/api/dev/push");
    let sub = await reg.pushManager.getSubscription(); let replaces = null;
    if (sub && keyOf(sub) && keyOf(sub) !== public_key) { replaces = sub.endpoint; await sub.unsubscribe(); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64u2u8(public_key)});
    return api("/api/dev/push/subscribe", {method: "POST", body: {subscription: sub.toJSON(), replaces}});
  }
  async function alertOff(){
    const reg = await devReg(); const sub = reg && await reg.pushManager.getSubscription();
    if (sub) { try { await api("/api/dev/push/unsubscribe", {method: "POST", body: {endpoint: sub.endpoint}}); } catch {} try { await sub.unsubscribe(); } catch {} }
  }
  // Renders the toggle card into host (Home + Settings). The switch shows THIS device's state; the line under it counts all dev devices.
  async function alertCard(host){
    if (!host) return;
    let info = {devices: []}; try { info = await api("/api/dev/push"); } catch {}
    const mine = await myEndpoint(); const on = !!mine && info.devices.some(d => d.endpoint === mine) && (!("Notification" in window) || Notification.permission === "granted");
    const n = info.devices.length;
    const why = !pushOK() ? (isIOS() && !isStandalone() ? "📱 iPhone: in Safari tap Share ⬆️ → “Add to Home Screen”, then turn this ON from that Dev app." : "Alerts don't work in this browser. Open /dev in Chrome on your phone.")
      : (window.Notification && Notification.permission === "denied") ? "🚫 Notifications are blocked: Chrome ⋮ → Settings → Site settings → Notifications → Allow this site." : "";
    if (!host.isConnected) return;
    host.innerHTML = `<div class="card alert-card ${on ? "on" : ""}">
      <label class="al-row"><span class="al-tx"><b>🔔 Send me alerts</b><small>${on ? "Alerts ON on this device ✅" : "New shop, payment / UTR, plan ending — phone notifications"}</small></span>
        <input type="checkbox" role="switch" class="al-sw" id="alSw" ${on ? "checked" : ""} ${pushOK() ? "" : "disabled"} aria-label="Send me alerts"></label>
      ${why ? `<p class="al-why">${why}</p>` : ""}
      <p class="al-meta muted">${n ? `📲 ON on ${n} device${n > 1 ? "s" : ""} (phone and laptop can both be on)` : "Not ON on any device yet"}${on ? ` · <button type="button" class="linkbtn" id="alTest">Send test</button>` : ""}</p></div>`;
    alertCard.last = host.innerHTML.replace(/ id="al(Sw|Test)"/g, ""); // shown instantly on the next redraw (no flicker), then refreshed
    const sw = host.querySelector("#alSw");
    sw.onchange = async () => { sw.disabled = true;
      try { if (sw.checked) { await alertOn(); toast("🔔 Alerts ON — this device will get notifications"); } else { await alertOff(); toast("🔕 Alerts off on this device"); } }
      catch (e) { sw.checked = !sw.checked; if (!authFail(e)) toast(e.message); }
      alertCard(host); };
    const tb = host.querySelector("#alTest");
    if (tb) tb.onclick = async () => { tb.disabled = true; try { const r = await api("/api/dev/push/test", {method: "POST", body: {endpoint: mine}}); toast(r.results.some(x => x.outcome === "accepted") ? "📲 Test sent — a notification should arrive in 2–3 seconds" : "The push service refused — turn it OFF and ON again"); } catch (e) { fail(e); } tb.disabled = false; };
  }
  // ---------- 🔔 Activity feed (Home) ----------
  function feedHtml(ev){
    if (!ev.events.length) return `<div class="empty feed-empty"><span aria-hidden="true">🔔</span><b>No activity yet</b><p class="muted">New shops, payments and plan endings will show up here.</p></div>`;
    return `<div class="card feed">${ev.events.map(e => `<button type="button" class="fe ${e.read ? "" : "unread"}" data-ev="${e.id}" data-go="${esc(evHash(e.url))}">
      <span class="fe-ic" aria-hidden="true">${e.icon}</span><span class="fe-tx"><b>${esc(String(e.title).startsWith(e.icon) ? String(e.title).slice(e.icon.length).trim() : e.title)}</b><small>${esc(e.body || "")}</small></span><span class="fe-t">${ago(e.created_at)}</span>${e.read ? "" : `<i class="fe-dot" aria-label="unread"></i>`}</button>`).join("")}</div>`;
  }
  function wireFeed(){
    app.querySelectorAll(".fe[data-ev]").forEach(b => b.onclick = () => { const id = Number(b.dataset.ev); if (b.classList.contains("unread")) api("/api/dev/events/read", {method: "POST", body: {ids: [id]}}).catch(() => {}); openHash(b.dataset.go); });
    const all = $("#feAll"); if (all) all.onclick = async () => { try { await api("/api/dev/events/read", {method: "POST", body: {all: true}}); } catch (e) { return fail(e); } app.querySelectorAll(".fe.unread").forEach(b => { b.classList.remove("unread"); const d = b.querySelector(".fe-dot"); if (d) d.remove(); }); all.remove(); const h = $("#nbHome"); if (h) h.hidden = true; };
  }

  // v10.15 👑 God Mode bridge: god.js reuses these functions and the older screens (no copy of the logic).
  window.DevCore = {api, esc, money, num, ist, istDate, ago, bytes, toast, modal, ask, deleteModal, authFail, go, app, SVC, subPill, subLine,
    get tab(){ return tab; }, setDirty(v){ dirty = !!v; }, views: {shops: shopsView, notify: notifyView, payments: paymentsView, platform: platformView, landing: landingView, cloud: cloudView, audit: auditView, health: healthView, errors: errorsView, dukaan: dukaanView, home: homeView}};
  start();

  // ================= v7: super-admin control room =================

  // ================= v8: subscription control room =================
  const rupee = p => p == null ? "" : (p/100).toFixed(2).replace(/\.00$/, "");
  const fail = e => { if (!authFail(e)) toast(e.message); };
  function shownOnce(title, rows){
    const d = document.createElement("div"); d.className = "once-back";
    d.innerHTML = `<div class="card once"><h3>${esc(title)}</h3>${rows.map(([k,v]) => `<p class="muted">${esc(k)}</p><p class="mono big">${esc(v)}</p>`).join("")}<p class="err">Shown only once. Copy it now and send it to the shopkeeper.</p><button class="btn b-blue full" type="button">I've copied it</button></div>`;
    document.body.appendChild(d); d.querySelector("button").onclick = () => d.remove();
  }
  const firstName = () => { const u = String((me && me.username) || "").replace(/[-_.]?dev$/i, "").split(/[-_.\s]/)[0]; return u ? u[0].toUpperCase() + u.slice(1) : "Boss"; };
  const greet = () => { const h = Number(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata", hour: "numeric", hour12: false})) % 24; return h < 12 ? "Good morning ☀️" : h < 17 ? "Good afternoon 🌤️" : "Good evening 🌙"; };
  const stat = (go, ic, color, val, label, state = "") => `<button class="stat ${color} ${state}" data-go="${go}"><span class="st-ic" aria-hidden="true">${ic}</span><span class="st-tx"><b>${val}</b><small>${label}</small></span></button>`;
  async function homeView(){
    let r, ev; try { [r, ev] = await Promise.all([api("/api/dev/overview"), api("/api/dev/events?limit=8").catch(() => ({events: [], unread: 0}))]); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    if (tab !== "home") return;
    const s = r.subs, todo = [];
    if (r.shops.pending) todo.push(`<button class="todo t-purple" data-go="shops"><span>🕒</span><b>${num(r.shops.pending)} ${r.shops.pending > 1 ? "shops are" : "shop is"} waiting for approval</b><i>→</i></button>`);
    if (r.payments_to_verify) todo.push(`<button class="todo t-orange" data-go="payments"><span>💰</span><b>${num(r.payments_to_verify)} ${r.payments_to_verify > 1 ? "payments" : "payment"} to check</b><i>→</i></button>`);
    if (s.DUE) todo.push(`<button class="todo t-amber" data-go="shops"><span>⏰</span><b>${num(s.DUE)} ${s.DUE > 1 ? "shops' plans are" : "shop's plan is"} ending soon</b><i>→</i></button>`);
    if (!r.plan.upi_id) todo.push(`<button class="todo t-red" data-go="platform"><span>⚠️</span><b>Set your UPI ID so shopkeepers can pay</b><i>→</i></button>`);
    app.innerHTML = `<section class="hello">
        <div class="hello-tx"><small>${greet()}</small><h1>Hi ${esc(firstName())} 👋</h1>
        <p>${todo.length ? "Today's tasks are below." : "All good ✅ Nothing pending."}</p></div>
        <div class="hello-num"><b>${num(r.shops.total)}</b><small>shops</small></div>
        <span class="fl f1" aria-hidden="true">🛒</span><span class="fl f2" aria-hidden="true">🍎</span><span class="fl f3" aria-hidden="true">🪙</span><span class="fl f4" aria-hidden="true">🥛</span>
      </section>
      ${todo.length ? `<div class="todos">${todo.join("")}</div>` : ""}
      <div id="alHost" class="al-host">${alertCard.last || ""}</div>
      <div class="ph feed-h"><h2>🔔 Activity ${ev.unread ? `<span class="pill new-pill">${ev.unread} new</span>` : ""}</h2>${ev.unread ? `<button class="ghost sm" type="button" id="feAll">✓ Mark all read</button>` : ""}</div>
      ${feedHtml(ev)}
      <h2>📊 Subscriptions</h2>
      <div class="stats">
        ${stat("shops", "🧪", "c-blue", num(s.TRIAL), "Free trial")}
        ${stat("shops", "✅", "c-green", num(s.ACTIVE), "Paid / active")}
        ${stat("shops", "⏰", "c-amber", num(s.DUE), "Due (≤ 3 days)", s.DUE ? "hot" : "")}
        ${stat("shops", "⛔", "c-red", num(s.EXPIRED), "Expired · paused", s.EXPIRED ? "hot" : "")}
      </div>
      <h2>💵 This month</h2>
      <div class="stats">
        ${stat("payments", "💵", "c-green", money(r.revenue.received_month_paise), `Received (${num(r.revenue.received_month_count)})`)}
        ${stat("shops", "📈", "c-teal", money(r.revenue.expected_month_paise), "Expected")}
        ${stat("payments", "💰", "c-orange", num(r.payments_to_verify), "Payment verify", r.payments_to_verify ? "hot" : "")}
        ${stat("shops", "🕒", "c-purple", num(r.shops.pending), "Awaiting approval", r.shops.pending ? "hot" : "")}
      </div>
      <h2>⚡ Quick links</h2>
      <div class="quick">
        <button class="qbtn q-green" data-go="shops"><span>🏪</span>Shops</button>
        <button class="qbtn q-orange" data-go="payments"><span>💰</span>Payments</button>
        <button class="qbtn q-blue" data-go="landing"><span>🏠</span>Landing page</button>
        <button class="qbtn q-purple" data-go="platform"><span>⚙️</span>Plan & UPI</button>
        <button class="qbtn q-notify" data-go="notify"><span>📢</span>Notify shops <small>bill · update · issue · message</small></button>
      </div>
      <details class="more"><summary>Plan details & backup</summary><div class="more-in">
        <div class="rows">
          <div class="row"><span>Price</span><span>${money(r.plan.price_paise)}/month</span></div>
          <div class="row"><span>Bill every</span><span>${r.plan.months} month${r.plan.months > 1 ? "s" : ""} (${money(r.plan.price_paise * r.plan.months)})</span></div>
          <div class="row"><span>Free trial</span><span>${r.plan.trial_days} days</span></div>
          <div class="row"><span>UPI</span><span>${esc(r.plan.upi_id || "not set")}</span></div></div>
        <p style="margin:12px 0 0"><a class="btn b-gray" href="/api/dev/backup">⬇ Backup everything</a></p></div></details>`;
    app.querySelectorAll("[data-go]:not([data-ev])").forEach(b => b.onclick = () => go(b.dataset.go));
    wireFeed(); alertCard($("#alHost"));
  }

  // ---------- v9: Cloudflare usage ----------
  const LBL = {requests: ["Workers requests", "both Workers combined (today)"], rows_read: ["D1 rows read", "rows read from the database (today)"], rows_written: ["D1 rows written", "rows written to the database (today)"], storage: ["D1 storage", "database size (total)"]};
  const fmtM = (k, v) => k === "storage" ? (v >= 1e9 ? (v/1e9).toFixed(2) + " GB" : (v/1e6).toFixed(1) + " MB") : num(v);
  const STEPS = `<ol class="steps">
    <li>Open <b>dash.cloudflare.com</b> in a laptop/phone browser and log in.</li>
    <li>Top right, profile icon → <b>My Profile</b> → <b>API Tokens</b> on the left.</li>
    <li>Tap <b>Create Token</b> → below, <b>Custom token → Get started</b>.</li>
    <li>Token name: <b>Apna Dhanda usage</b></li>
    <li>Permissions me: <b>Account</b> → <b>Account Analytics</b> → <b>Read</b>. (That's all it needs. Don't give any Edit/Write permission.)</li>
    <li>Account Resources: <b>Include</b> → <b>Krish patil</b> (only your account).</li>
    <li>Leave everything else empty → <b>Continue to summary</b> → <b>Create Token</b>.</li>
    <li><b>Copy</b> the token it shows, paste it straight into the box below and tap Save. ⚠️ Never send the token to anyone on chat/WhatsApp.</li></ol>`;
  async function cloudView(){
    let r; try { r = await api("/api/dev/cloudflare" + (cloudView.force ? "?refresh=1" : "")); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; } cloudView.force = false;
    const u = r.usage;
    const bars = u ? Object.keys(LBL).map(k => { const m = u.metrics[k]; return `<div class="cfm"><div class="cfm-top"><b>${LBL[k][0]}</b><span class="lv-${m.level}">${m.pct}%</span></div>
      <div class="cfbar"><i class="lv-${m.level}" style="width:${Math.min(100, Math.max(m.pct, m.used ? 1 : 0))}%"></i></div>
      <small class="muted">${fmtM(k, m.used)} / ${fmtM(k, m.limit)} · ${LBL[k][1]}</small></div>`; }).join("") : "";
    const form = `<form class="card form" id="cff"><h3 style="margin:0 0 4px">${r.configured ? "Change token" : "Paste token"}</h3>
      ${r.configured ? `<p class="muted sm">Saved now: <span class="mono">${esc(r.token_masked)}</span> · ${ist(r.token_set_at)}</p>` : ""}
      <label for="cft">Cloudflare API token (read-only)</label><input id="cft" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="paste here">
      <label for="cfa">Account ID <small>(leave empty, found automatically)</small></label><input id="cfa" autocomplete="off" autocapitalize="none" value="${esc(r.account_id)}">
      <label for="cfd">D1 database ID</label><input id="cfd" autocomplete="off" autocapitalize="none" value="${esc(r.database_id)}">
      <p class="err" id="cferr" role="alert"></p>
      <div class="actions" style="grid-template-columns:1fr ${r.configured ? "1fr" : ""}"><button class="btn b-blue">Save</button>${r.configured ? `<button type="button" class="btn b-red" id="cfx">Remove token</button>` : ""}</div></form>`;
    app.innerHTML = `<h2>☁️ Cloudflare · today's usage</h2>
      ${!r.configured ? `<div class="card"><p style="margin:0 0 6px"><b>Connecting Cloudflare needs a read-only token.</b> It can only read usage and cannot change anything.</p>${STEPS}</div>` : ""}
      ${r.error ? `<div class="card warn-box">⚠️ ${esc(r.error)}</div>` : ""}
      ${u ? `${u.any_red ? `<div class="card cf-red">🔴 <b>Almost at the limit!</b> Get Cloudflare → Workers &amp; Pages → Plans → <b>Workers Paid</b> (~$5/month), or the site will stop once today's limit is crossed.</div>` : ""}
        <div class="card cfm-wrap">${bars}</div>
        <div class="card"><p class="muted sm" style="margin:0">⏰ Limits reset daily at <b>00:00 UTC = 5:30 AM IST</b> · yellow = 60%+, red = 80%+<br>Data: ${u.fetched_at ? ago(u.fetched_at) : "—"}${r.cached ? " (5 min cache)" : ""} · Cloudflare analytics run a few minutes behind</p>
        ${u.scripts.length ? `<div class="chips" style="margin-top:8px">${u.scripts.map(x => `<span class="chip">${esc(x.name)}: <b>${num(x.requests)}</b></span>`).join("")}</div>` : ""}
        <p style="margin:10px 0 0"><button class="ghost sm" id="cfr">↻ Refresh</button></p></div>`
      : `<div class="card"><p class="muted sm" style="margin:0">Database size (without a token): <b>${bytes(r.local_db_bytes)}</b> / 5 GB</p></div>`}
      ${form}`;
    const cfr = $("#cfr"); if (cfr) cfr.onclick = () => { cloudView.force = true; cloudView(); };
    const cfx = $("#cfx"); if (cfx) cfx.onclick = async () => { if (!await ask("Remove the Cloudflare token?", "", "Remove")) return; try { await api("/api/dev/cloudflare", {method:"POST", body:{clear:true}}); toast("Token removed"); cloudView(); } catch (e) { fail(e); } };
    $("#cff").onsubmit = async e => { e.preventDefault(); const b = {account_id: $("#cfa").value.trim(), database_id: $("#cfd").value.trim()}; const t = $("#cft").value.trim(); if (t) b.token = t;
      const btn = e.target.querySelector("button.b-blue"); btn.disabled = true; $("#cferr").textContent = "";
      try { await api("/api/dev/cloudflare", {method:"POST", body:b}); toast("Saved ✅"); cloudView(); } catch (x) { btn.disabled = false; $("#cferr").textContent = x.message; } };
  }

  async function paymentsView(){
    let r, all = paymentsView.all; try { r = await api("/api/dev/payments" + (all ? "?status=all" : "")); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    app.innerHTML = `<div class="ph"><h2>💰 ${all ? "All payments" : "Payments to verify"} <span class="muted">${r.payments.length}</span></h2><button class="ghost sm" id="tg">${all ? "Only to verify" : "Show all"}</button></div>
      <details class="more mini"><summary>How to check?</summary><p class="hint">Open your UPI app / bank statement and look for this UTR and amount. ✅ Verify = bill paid + plan extended. ❌ Reject = shop is paused again. Not verified in 48 h → the shop pauses by itself.</p></details>
      ${r.payments.map(p => `<div class="card pay-card" data-id="${p.id}">
        <div class="shop-top"><div class="sc-main"><b>${esc(p.shop_name || "Deleted shop")}</b> <span class="pill ${p.status === "pending" ? "sub-verify" : p.status === "verified" ? "sub-active" : "sub-expired"}">${esc(p.status)}</span><br>
          <small class="muted">${esc(p.owner_name || "")} · ${esc(p.mobile || "")} · bill ${esc(p.invoice_number || "")}</small></div><b class="amt">${money(p.amount_paise)}</b></div>
        <p class="utr">UTR <b class="mono">${esc(p.utr)}</b></p>
        <p class="muted sm">Sent ${ist(p.submitted_at)}${p.status === "pending" ? (p.provisional_until > r.now ? ` · shop open till ${ist(p.provisional_until)}` : p.provisional_until ? " · 48 h passed — shop paused again" : " · no provisional access") : ` · ${esc(p.status)} ${ist(p.decided_at)}${p.reason ? " · " + esc(p.reason) : ""}`}</p>
        ${p.has_screenshot ? `<p><a class="ghost sm" href="/api/dev/payments/${p.id}/screenshot" target="_blank" rel="noopener">🖼 Screenshot</a></p>` : ""}
        ${p.status === "pending" ? `<div class="actions"><button class="btn b-green" data-a="verify">✅ Verify</button><button class="btn b-red" data-a="reject">❌ Reject</button></div>` : ""}</div>`).join("") || `<div class="empty"><span aria-hidden="true">🎉</span><b>${all ? "No payments yet" : "All payments checked"}</b><p class="muted">${all ? "Payments will show here when shopkeepers pay." : "Nothing left to verify."}</p></div>`}`;
    $("#tg").onclick = () => { paymentsView.all = !all; paymentsView(); };
    app.querySelectorAll(".pay-card [data-a]").forEach(b => b.onclick = async () => {
      const id = b.closest(".pay-card").dataset.id, a = b.dataset.a; let reason = "";
      if (a === "reject") { reason = await rejectModal(b.closest(".pay-card")); if (reason == null) return; }
      b.disabled = true;
      try { const x = await api(`/api/dev/payments/${id}/${a}`, {method:"POST", body:{reason}}); toast(a === "verify" ? "Verified — paid till " + istDate(x.sub.paid_until) : "Rejected — shop paused"); paymentsView(); } catch (e) { b.disabled = false; fail(e); }
    });
  }
  async function auditView(){
    const sel = auditView.shop || "";
    let r, shops = []; try { r = await api("/api/dev/audit" + (sel ? "?shop=" + sel : "")); shops = (await api("/api/dev/shops")).shops; } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    app.innerHTML = `<h2>📜 Audit log</h2><p class="hint">Subscription and shop-status events only.</p>
      <div class="card"><select id="as"><option value="">All shops</option>${shops.map(s => `<option value="${s.id}" ${String(s.id) === String(sel) ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></div>
      <div class="card"><ul class="list log">${r.audit.length ? r.audit.map(l => `<li><div class="what"><b>${esc(l.action)}</b>${l.shop_name ? " · " + esc(l.shop_name) : l.shop_id ? " · shop #" + l.shop_id : " · platform"}</div>
        <div class="when">${ist(l.at)} · ${esc(l.actor)}${l.detail ? " · " + esc(l.detail) : ""}${l.src === "shop" && (l.before || l.after) ? ` · ${esc(l.before || "")} → ${esc(l.after || "")}` : ""}</div></li>`).join("") : `<li class="muted">Nothing yet.</li>`}</ul></div>`;
    $("#as").onchange = e => { auditView.shop = e.target.value; auditView(); };
  }

  // ---------- v10.1: 🏠 Landing page editor — every text on "/" in हिं + EN, feature cards, section on/off, colours ----------
  const LSEC = [
    {id: "bar", t: "🔝 Top bar", f: [["bar_name", "Name (empty = brand name)"], ["bar_sub", "Subtitle under the name"]]},
    {id: "hero", t: "⭐ Hero (top of page)", show: [["trial", "Show free-trial badge"]], f: [["kicker", "Small line above the headline"], ["title", "Headline", 2], ["lead", "Sub-text", 4], ["trial_badge", "Trial badge"], ["trial_then", "Badge price line"], ["closed", "Shown when new sign-ups are closed", 2]], ic: [["trial", "Badge icon"]]},
    {id: "phone", t: "📱 Phone + QR picture", show: [["scene", "Show phone + QR picture"]], f: [["phone_title", "Phone top title"], ["phone_items", "Items (one per line: emoji + name)", 4], ["phone_add", "“Add” label"], ["phone_btn", "Phone button"], ["phone_bell", "Bell bubble"]]},
    {id: "steps", t: "🪜 How it works", show: [["steps", "Show this section"]], f: [["steps_h", "Heading"], ["s1_t", "Step 1 title"], ["s1_d", "Step 1 text", 2], ["s2_t", "Step 2 title"], ["s2_d", "Step 2 text (auto-approve ON)", 2], ["s2_pending", "Step 2 text (auto-approve OFF)", 2], ["s3_t", "Step 3 title"], ["s3_d", "Step 3 text", 2]], ic: [["s1", "Step 1 icon"], ["s2", "Step 2 icon"], ["s3", "Step 3 icon"]]},
    {id: "features", t: "🧩 What you get (feature cards)", show: [["features", "Show this section"]], f: [["feat_h", "Heading"]], cards: true},
    {id: "plan", t: "💚 Plan card", show: [["plan", "Show plan card"]], f: [["plan_label", "Label"], ["plan_days", "Words after the big number"], ["plan_then", "Price line"], ["plan_note", "Small line (Pay by UPI…)", 2]]},
    {id: "cta", t: "🔘 Buttons", show: [["end_cta", "Show buttons again at the bottom"]], f: [["cta_reg", "Register button"], ["cta_login", "Login button"]], ic: [["reg", "Register icon"], ["login", "Login icon"]]},
    {id: "footer", t: "🔚 Footer", f: [["footer", "Footer text"]]},
    {id: "theme", t: "🎨 Colours", theme: true},
  ];
  const LEMOJI = ["🛒","🔗","📱","✨","🔔","🟢","📦","🚚","💰","🧾","📍","⏰","⭐","❤️","🎁","🔒","📊","💬","🏪","🥛","🍚","👍","⚡","🌙"];
  let LS = null; // {landing, defaults, limits, plan, lang, dirty, open}
  async function landingView(){
    let r; try { r = await api("/api/dev/landing"); } catch (e) { return fail(e); }
    if (tab !== "landing") return;
    LS = {landing: r.landing, defaults: r.defaults, limits: r.limits, plan: r.plan, lang: (LS && LS.lang) || "hi", dirty: false, open: (LS && LS.open) || {hero: true}};
    drawLanding();
  }
  function drawLanding(){
    const L = LS.landing, D = LS.defaults, lg = LS.lang, LIM = LS.limits;
    const fld = (k, label, rows) => { const v = (L.text[k] || {})[lg] || "", ph = D.text[k][lg] || (k === "bar_name" ? "(brand name)" : ""), mx = LIM.text[k];
      return `<label class="lf-l" for="lf_${k}">${esc(label)} <i>${lg === "hi" ? "HI" : "EN"}</i></label>` + (rows ? `<textarea id="lf_${k}" data-t="${k}" rows="${rows}" maxlength="${mx}" placeholder="${esc(ph)}">${esc(v)}</textarea>` : `<input id="lf_${k}" data-t="${k}" maxlength="${mx}" placeholder="${esc(ph)}" value="${esc(v)}">`); };
    const icn = (k, label) => `<div class="lf-ic"><label for="li_${k}">${esc(label)}</label><div class="ic-in"><input id="li_${k}" data-i="${k}" maxlength="${LIM.icon}" placeholder="${esc(D.icons[k])}" value="${esc(L.icons[k] || "")}"><button type="button" class="ghost sm" data-pick="li_${k}" aria-label="Pick emoji">😀</button></div></div>`;
    const sw = (k, label) => `<label class="sw-row lf-sw"><span><b>${esc(label)}</b></span><input type="checkbox" data-s="${k}" ${L.show[k] ? "checked" : ""}></label>`;
    const cardsHtml = () => `<div id="lcards">${L.cards.map((c, i) => { const dc = (D.cards.find(x => x.id === c.id)) || {};
        return `<div class="lcard${c.show ? "" : " off"}" data-ci="${i}">
          <div class="lc-top"><span class="lc-n">${i + 1}</span><div class="ic-in"><input class="lc-icon" data-c="icon" maxlength="${LIM.icon}" placeholder="${esc(dc.icon || "⭐")}" value="${esc(c.icon)}" aria-label="Card ${i + 1} icon"><button type="button" class="ghost sm" data-pick="card:${i}" aria-label="Pick emoji">😀</button></div>
            <div class="lc-btns"><button type="button" class="ghost sm" data-cm="up" ${i ? "" : "disabled"} aria-label="Move up">↑</button><button type="button" class="ghost sm" data-cm="down" ${i < L.cards.length - 1 ? "" : "disabled"} aria-label="Move down">↓</button><button type="button" class="ghost sm" data-cm="vis" aria-label="Show or hide">${c.show ? "👁" : "🚫"}</button><button type="button" class="ghost sm lc-del" data-cm="del" aria-label="Delete card">🗑</button></div></div>
          <label class="lf-l">Title <i>${lg === "hi" ? "HI" : "EN"}</i></label><input data-c="t_${lg}" maxlength="${LIM.card_title}" placeholder="${esc(dc["t_" + lg] || (lg === "en" ? (c.t_hi || "Card title") : (c.t_en || "कार्ड का नाम")))}" value="${esc(c["t_" + lg])}">
          <label class="lf-l">Description <i>${lg === "hi" ? "HI" : "EN"}</i></label><textarea data-c="d_${lg}" rows="2" maxlength="${LIM.card_text}" placeholder="${esc(dc["d_" + lg] || "")}">${esc(c["d_" + lg])}</textarea>
          ${c.show ? "" : `<p class="hint">Hidden on the page</p>`}</div>`; }).join("")}</div>
        <button type="button" class="btn b-blue full" id="lcAdd" ${L.cards.length >= LIM.cards ? "disabled" : ""}>＋ Add card (${L.cards.length}/${LIM.cards})</button>`;
    const themeHtml = () => ["primary", "accent"].map(k => `<div class="lf-col"><label for="lt_${k}">${k === "primary" ? "Primary (green)" : "Accent (orange)"}</label><div class="ie-row"><input type="color" id="lt_${k}" data-th="${k}" value="${esc(L.theme[k] || D.theme[k])}"><code class="mono">${esc(L.theme[k] || D.theme[k])}</code>${L.theme[k] && L.theme[k] !== D.theme[k] ? "" : `<small class="muted">default</small>`}</div></div>`).join("");
    app.innerHTML = `<h2>🏠 Landing page (main page “/”)</h2>
      <div class="card lhead"><p class="muted" style="margin:0 0 10px">Change any text on the main page. <b>Empty box = default text</b> (shown in grey). Use <code>{trial_days}</code> (${esc(LS.plan.trial_days)}) and <code>{price}</code> (${esc(LS.plan.price)}) — they come from Platform → pricing. <code>{brand}</code> = brand name.</p>
        <div class="seg" role="tablist"><button type="button" data-lg="hi" aria-current="${lg === "hi"}">हिंदी</button><button type="button" data-lg="en" aria-current="${lg === "en"}">English</button></div>
        <div class="lh-btns"><a class="btn b-gray" href="/?splash=0" target="_blank" rel="noopener">👁 Preview</a><button type="button" class="btn b-gray" data-reset="all">↺ Reset all</button></div></div>
      ${LSEC.map(s => `<details class="card lsec" data-sec="${s.id}" ${LS.open[s.id] ? "open" : ""}><summary><b>${s.t}</b>${s.show ? s.show.map(([k]) => L.show[k] ? "" : ` <span class="pill paused">hidden</span>`).join("") : ""}</summary>
        <div class="lsec-in form">${(s.show || []).map(([k, l]) => sw(k, l)).join("")}${(s.f || []).map(([k, l, rows]) => fld(k, l, rows)).join("")}
        ${s.ic ? `<div class="lf-ics">${s.ic.map(([k, l]) => icn(k, l)).join("")}</div>` : ""}${s.cards ? cardsHtml() : ""}${s.theme ? `<div class="row2">${themeHtml()}</div>` : ""}
        <button type="button" class="ghost sm lreset" data-reset="${s.id}">↺ Reset “${esc(s.t.replace(/^\S+\s/, ""))}” to default</button></div></details>`).join("")}
      <div class="lsave"><span id="ldirty" class="muted">${LS.dirty ? "● Unsaved changes" : "All saved"}</span><a class="btn b-gray" href="/?splash=0" target="_blank" rel="noopener">👁</a><button type="button" class="btn b-green" id="lSave">💾 Save</button></div>
      <p class="err" id="lerr" role="alert"></p>`;
    const dirty = () => { LS.dirty = true; const d = $("#ldirty"); if (d) { d.textContent = "● Unsaved changes"; d.className = "warn-t"; } };
    app.querySelectorAll("details.lsec").forEach(d => d.ontoggle = () => { LS.open[d.dataset.sec] = d.open; });
    app.querySelectorAll("[data-t]").forEach(el => el.oninput = () => { L.text[el.dataset.t][lg] = el.value; dirty(); });
    app.querySelectorAll("[data-i]").forEach(el => el.oninput = () => { L.icons[el.dataset.i] = el.value.trim(); dirty(); });
    app.querySelectorAll("[data-s]").forEach(el => el.onchange = () => { L.show[el.dataset.s] = el.checked; dirty(); drawLanding(); });
    app.querySelectorAll("[data-th]").forEach(el => el.oninput = () => { const v = el.value.toLowerCase(); L.theme[el.dataset.th] = v === D.theme[el.dataset.th] ? "" : v; el.nextElementSibling.textContent = v; dirty(); });
    app.querySelectorAll("[data-lg]").forEach(b => b.onclick = () => { LS.lang = b.dataset.lg; drawLanding(); });
    app.querySelectorAll(".lcard").forEach(card => { const i = Number(card.dataset.ci), c = L.cards[i];
      card.querySelectorAll("[data-c]").forEach(el => el.oninput = () => { c[el.dataset.c] = el.dataset.c === "icon" ? el.value.trim() : el.value; dirty(); });
      card.querySelectorAll("[data-cm]").forEach(b => b.onclick = () => { const a = b.dataset.cm;
        if (a === "up" && i > 0) [L.cards[i - 1], L.cards[i]] = [L.cards[i], L.cards[i - 1]];
        else if (a === "down" && i < L.cards.length - 1) [L.cards[i + 1], L.cards[i]] = [L.cards[i], L.cards[i + 1]];
        else if (a === "vis") c.show = !c.show;
        else if (a === "del") { L.cards.splice(i, 1); toast("Card removed — tap Save to apply"); }
        dirty(); drawLanding(); }); });
    const add = $("#lcAdd"); if (add) add.onclick = () => { if (L.cards.length >= LIM.cards) return; L.cards.push({id: "c" + Date.now().toString(36), icon: "⭐", t_hi: "", t_en: "", d_hi: "", d_en: "", show: true}); dirty(); drawLanding();
      setTimeout(() => { const last = app.querySelector(".lcard:last-child input[data-c^='t_']"); if (last) { last.focus(); last.scrollIntoView({block: "center"}); } }, 30); };
    app.querySelectorAll("[data-pick]").forEach(b => b.onclick = () => emojiPick(em => { const t = b.dataset.pick;
      if (t.startsWith("card:")) L.cards[Number(t.slice(5))].icon = em; else L.icons[t.slice(3)] = em; dirty(); drawLanding(); }));
    app.querySelectorAll("[data-reset]").forEach(b => b.onclick = () => landingResetModal(b.dataset.reset));
    $("#lSave").onclick = () => landingSave();
  }
  function emojiPick(cb){
    const m = modal(`<h3>Pick an icon</h3><div class="epick">${LEMOJI.map(e => `<button type="button" class="ghost" data-e="${e}">${e}</button>`).join("")}</div><p class="hint">Or type any emoji in the box.</p><div class="dm-btns"><button type="button" class="btn b-gray" id="epNo">Close</button></div>`);
    m.q("#epNo").onclick = m.close; m.back.querySelectorAll("[data-e]").forEach(b => b.onclick = () => { m.close(); cb(b.dataset.e); });
  }
  function landingReset(id){
    const L = LS.landing, D = LS.defaults, secs = id === "all" ? LSEC : LSEC.filter(s => s.id === id);
    for (const s of secs) { (s.f || []).forEach(([k]) => { L.text[k] = {hi: "", en: ""}; }); (s.ic || []).forEach(([k]) => { L.icons[k] = ""; }); (s.show || []).forEach(([k]) => { L.show[k] = true; });
      if (s.cards) L.cards = D.cards.map(c => ({id: c.id, icon: "", t_hi: "", t_en: "", d_hi: "", d_en: "", show: true}));
      if (s.theme) L.theme = {primary: "", accent: ""}; }
  }
  function landingResetModal(id){
    const s = LSEC.find(x => x.id === id), name = id === "all" ? "the whole landing page" : "“" + s.t.replace(/^\S+\s/, "") + "”";
    const m = modal(`<h3>↺ Reset ${esc(name)}?</h3><p>All your text${id === "features" || id === "all" ? ", feature cards" : ""}${id === "theme" || id === "all" ? ", colours" : ""} in ${esc(name)} go back to the built-in default and it is saved right away.</p>
      <div class="dm-btns"><button type="button" class="btn b-gray" id="rsNo">Cancel</button><button type="button" class="btn b-red" id="rsYes">↺ Reset</button></div>`);
    m.q("#rsNo").onclick = m.close;
    m.q("#rsYes").onclick = async () => { m.q("#rsYes").disabled = true; landingReset(id); m.close(); await landingSave("↺ Reset — saved"); };
  }
  async function landingSave(msg){
    const btn = $("#lSave"), err = $("#lerr"); if (btn) { btn.disabled = true; btn.textContent = "Saving…"; } if (err) err.textContent = "";
    try { const r = await api("/api/dev/landing", {method: "POST", body: {landing: LS.landing}}); LS.landing = r.landing; LS.dirty = false; drawLanding(); toast(msg || "✅ Saved — live on the main page"); }
    catch (e) { if (authFail(e)) return; if (btn) { btn.disabled = false; btn.textContent = "💾 Save"; } const el = $("#lerr"); if (el) { el.textContent = e.message; el.scrollIntoView({block: "center"}); } toast("Not saved: " + e.message); }
  }
  async function platformView(){
    // v10.3: the developer phone comes with /api/dev/platform (GET /api/dev/service answers 404 once shop #1 is gone, which left this box empty and a Save wiped the phone)
    let r, svc; try { const x = await api("/api/dev/platform"); r = x.platform; svc = {dev_contact: x.dev_contact || ""}; } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    if (tab !== "platform") return;
    app.innerHTML = `<div id="alHost" class="al-host">${alertCard.last || ""}</div><h2>💸 Plan &amp; UPI</h2>
      <details class="more apps-note" id="appsNote"><summary>📱 Apps — Dev, Shop and Customer install separately</summary>
        <p>All three are now <b>separate apps</b> and don't open inside each other:</p>
        <ul><li>🛠️ <b>Apna Dhanda Dev</b> (purple icon, "DEV") → open <code>/dev</code> → Install / Add to Home screen</li>
        <li>🏪 <b>Apna Dhanda Dukaan</b> (green icon) → open <code>/admin</code> → Install</li>
        <li>🛒 <b>Each shop's customer app</b> (named after the shop, orange icon) → open <code>/s/&lt;shop&gt;</code> or the QR → Install</li></ul>
        <p class="hint">Remove old icons (from before v10.5) from the phone once, then add them again from the pages above. The QR always opens the customer shop, even if you're logged in to Shop or Dev.</p></details>
      <form class="card form" id="sp">
        <div class="row2"><div><label for="pr">Price per month (₹)</label><input id="pr" inputmode="decimal" value="${rupee(r.price_paise)}" required></div>
        <div><label for="mo">Billing period</label><select id="mo">${[1,3,6,12].map(m => `<option value="${m}" ${r.months === m ? "selected" : ""}>${m} month${m > 1 ? "s" : ""}</option>`).join("")}</select></div></div>
        <p class="hint" id="tot"></p>
        <label for="td">Free trial for new shops (days)</label><input id="td" type="number" min="0" max="365" inputmode="numeric" value="${r.trial_days}">
        <h3 style="margin:14px 0 4px">Where shopkeepers pay you (UPI)</h3>
        <label for="up">Your UPI ID</label><input id="up" autocapitalize="none" placeholder="krish@okaxis" value="${esc(r.upi_id)}">
        <label for="un">Payee name</label><input id="un" placeholder="Krish Patil" value="${esc(r.upi_name)}">
        <details class="more mini"><summary>How do payments work?</summary><p class="hint">Free: shopkeepers scan a UPI QR / open their UPI app, then type the 12-digit UTR. You verify it here in Payments. (Fully automatic confirmation would need a payment gateway, which takes a fee on every payment.)</p></details>
        <p class="err" id="sperr" role="alert"></p><button class="btn b-blue full">Save pricing</button></form>
      <h2>🔧 Sign-up &amp; contact</h2>
      <form class="card form" id="pf2">
        <label class="sw-row"><span><b>New shop sign-up open</b></span><input type="checkbox" id="so" ${r.signup_open ? "checked" : ""}></label>
        <label class="sw-row"><span><b>Auto-approve new shops</b></span><input type="checkbox" id="aa" ${r.auto_approve ? "checked" : ""}></label>
        <div class="lmoved"><span>📝 Landing page text, cards &amp; colours moved to <b>🏠 Landing</b></span><button type="button" class="btn b-gray" data-go="landing">Open 🏠 Landing</button></div>
        <label for="dc">Your phone (shown to shopkeepers)</label><input id="dc" inputmode="tel" placeholder="98XXXXXXXX" value="${esc((svc && svc.dev_contact) || "")}">
        <p class="err" id="plerr" role="alert"></p><button class="btn b-blue full">Save platform</button></form>
      <details class="more"><summary>🎨 Brand logo &amp; name</summary><div class="more-in"><div class="brand-card" id="brandCard"><p class="muted">Loading brand…</p></div></div></details>
      <details class="more"><summary>🔐 Password &amp; backup</summary><div class="more-in">
      <p><a class="btn b-gray" href="/api/dev/backup">⬇ Backup everything (JSON)</a></p>
      <form class="form" id="pf"><p class="muted" style="margin:0">Logged in as <b>${esc(me?.username || "")}</b></p>
        <label for="cp">Current password</label><input id="cp" type="password" autocomplete="current-password" required>
        <label for="np">New password (12+ characters)</label><input id="np" type="password" autocomplete="new-password" minlength="12" required>
        <p class="err" id="perr" role="alert"></p><button class="ghost full">Change password</button></form></div></details>`;
    drawBrand();
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => go(b.dataset.go));
    const tot = () => { const p = Number($("#pr").value) || 0, m = Number($("#mo").value); $("#tot").textContent = `Each bill = ₹${(p*m).toLocaleString("en-IN")} for ${m} month${m > 1 ? "s" : ""}. A shop can have its own price (Shops → Subscription).`; };
    $("#pr").oninput = tot; $("#mo").onchange = tot; tot();
    $("#sp").onsubmit = async e => { e.preventDefault(); $("#sperr").textContent = "";
      try { await api("/api/dev/platform", {method:"POST", body:{price: $("#pr").value.trim(), months: Number($("#mo").value), trial_days: Number($("#td").value), upi_id: $("#up").value.trim(), upi_name: $("#un").value.trim()}}); toast("Pricing saved"); } catch (x) { if (!authFail(x)) $("#sperr").textContent = x.message; } };
    $("#pf2").onsubmit = async e => { e.preventDefault(); $("#plerr").textContent = "";
      try { await api("/api/dev/platform", {method:"POST", body:{signup_open: $("#so").checked, auto_approve: $("#aa").checked}});
        await api("/api/dev/service", {method:"POST", body:{action: "settings", dev_contact: $("#dc").value.trim()}});
        toast("Saved"); } catch (x) { if (!authFail(x)) $("#plerr").textContent = x.message; } };
    $("#pf").onsubmit = async e => { e.preventDefault();
      try { await api("/api/dev/password", {method:"POST", body:{current: $("#cp").value, password: $("#np").value}}); toast("Password changed"); $("#pf").reset(); }
      catch (x) { if (!authFail(x)) $("#perr").textContent = x.message; } };
  }
  async function shopDetail(id){
    tab = "shops"; stop(); window.scrollTo(0, 0);
    setNav("shops");
    let r; try { r = await api(`/api/dev/shops/${id}`); } catch (e) { if (!authFail(e)) app.innerHTML = `<p class="err center">${esc(e.message)}</p>`; return; }
    const sh = r.shop, sub = r.sub, inv = r.invoice;
    app.innerHTML = `<p><button type="button" class="ghost sm" id="back">← Shops</button></p>
      <div class="card"><div class="shop-top"><div><b style="font-size:18px">${esc(sh.name)}</b> <span class="pill ${esc(sh.status)}">${esc((SVC[sh.status] || [sh.status])[0])}</span> ${subPill(sub)}<br>
        <small class="muted">#${sh.id} · ${esc(sh.owner_name || "—")} · ${sh.mobile ? `<a href="tel:+91${esc(sh.mobile)}">${esc(sh.mobile)}</a>` : ""} · joined ${istDate(sh.created_at)}</small></div><a class="ghost sm" href="${esc(sh.link)}" target="_blank" rel="noopener">Open ↗</a></div>
        <div class="muted sm-link">${esc(sh.customer_url)}</div></div>
      <div class="svc-hero sub-hero ${SUB[sub.state][1]}"><div class="k">Subscription</div><div class="v">${SUB[sub.state][0]}</div><p>${subLine(sub)}</p>
        <div class="chips"><span class="chip">Trial till <b>${istDate(sub.trial_end)}</b></span><span class="chip">Paid till <b>${sub.paid_until ? istDate(sub.paid_until) : "—"}</b></span><span class="chip">${money(r.plan.monthly_paise)}/month${r.plan.custom_price ? " (custom)" : ""}</span></div>
        <div class="actions"><button class="btn b-amber" data-x="bill">🧾 Send bill → 🔔 panel</button></div>${r.wa_url ? `<a class="wa-mini" href="${esc(r.wa_url)}" target="_blank" rel="noopener">📤 also share on WhatsApp (optional)</a>` : ""}
        <p class="hint" style="color:#cbd5e1;margin:10px 0 4px">Extend manually (cash / other payment):</p>
        <div class="actions"><button class="btn b-blue" data-ext="1">+1 month</button><button class="btn b-blue" data-ext="3">+3 months</button><button class="btn b-blue" data-ext="12">+12 months</button></div>
        <div class="actions" style="margin-top:8px">${sh.status === "paused" ? `<button class="btn b-green" data-x="resume">▶ Resume</button>` : sh.status === "active" ? `<button class="btn b-red" data-x="pause">⏸ Pause (manual)</button>` : ""}<button class="btn b-gray" data-x="expire">⏹ End trial / plan now</button></div></div>
      ${inv ? `<h2>Open bill</h2><div class="card"><p style="margin:0"><b>${esc(inv.number)}</b> · ${money(inv.amount_paise)} · ${inv.months} month${inv.months > 1 ? "s" : ""} · due ${istDate(inv.due_at)} · <span class="pill ${inv.status === "pending_verify" ? "sub-verify" : "sub-due"}">${esc(inv.status === "pending_verify" ? "UTR sent" : "unpaid")}</span></p>
        <p class="muted sm" style="margin:6px 0 0">Sent ${inv.sent_count} time(s)${inv.sent_at ? ", last " + ist(inv.sent_at) : ""}</p></div>` : ""}
      ${r.payments.some(p => p.status === "pending") ? `<div class="card"><button class="btn b-amber full" data-x="pay">💰 Payment waiting — verify</button></div>` : ""}
      <h2>Price for this shop</h2>
      <form class="card form" id="pr"><div class="row2"><div><label for="pp">₹ per month (empty = default)</label><input id="pp" inputmode="decimal" value="${r.plan.custom_price ? rupee(r.plan.monthly_paise) : ""}" placeholder="default"></div>
        <div style="align-self:end"><button class="btn b-blue full">Save price</button></div></div></form>
      <h2>Bills</h2>
      <div class="card"><ul class="list log">${r.invoices.length ? r.invoices.map(i => `<li><div class="what"><b>${esc(i.number)}</b> · ${money(i.amount_paise)} · <span class="pill ${i.status === "paid" ? "sub-active" : i.status === "pending_verify" ? "sub-verify" : "sub-due"}">${esc(i.status)}</span></div>
        <div class="when">${istDate(i.period_start)} → ${istDate(i.period_end)} · made ${ist(i.created_at)}${i.paid_at ? " · paid " + ist(i.paid_at) : ""}</div></li>`).join("") : `<li class="muted">No bills yet.</li>`}</ul></div>
      <h2>Payments</h2>
      <div class="card"><ul class="list log">${r.payments.length ? r.payments.map(p => `<li><div class="what">UTR <b class="mono">${esc(p.utr)}</b> · ${money(p.amount_paise)} · ${esc(p.status)}</div><div class="when">${ist(p.submitted_at)}${p.reason ? " · " + esc(p.reason) : ""}</div></li>`).join("") : `<li class="muted">No payments yet.</li>`}</ul></div>
      <h2>Shopkeeper login</h2>
      <div class="card"><p class="muted" style="margin:0 0 8px">Login: <b>${esc(r.owner ? (r.owner.mobile || r.owner.username) : "—")}</b></p><div class="actions"><button class="btn b-gray" data-x="pw">🔑 Reset password</button><button class="btn b-gray" data-x="rk">🗝 New recovery key</button></div></div>
      <h2>Change log</h2>
      <div class="card"><ul class="list log">${r.log.length ? r.log.map(l => `<li><div class="what"><b>${esc(l.action)}</b></div><div class="when">${ist(l.at)} · ${esc(l.actor)}${l.detail ? " · " + esc(l.detail) : ""}</div></li>`).join("") : `<li class="muted">No changes yet.</li>`}</ul></div>`;
    $("#back").onclick = () => shopsView();
    const again = () => shopDetail(id);
    app.querySelectorAll("[data-ext]").forEach(b => b.onclick = async () => { const n = Number(b.dataset.ext); if (!await ask(`${sh.name}: extend by ${n} month(s)?`, "", "✓ Extend", "b-green")) return;
      try { const x = await api(`/api/dev/shops/${id}/subscription`, {method:"POST", body:{action:"extend", months:n}}); toast("Paid till " + istDate(x.sub.paid_until)); again(); } catch (e) { fail(e); } });
    app.querySelectorAll("[data-x]").forEach(b => b.onclick = async () => { const x = b.dataset.x;
      try {
        if (x === "bill") { b.disabled = true; const res = await api(`/api/dev/shops/${id}/bill`, {method:"POST", body:{}}); return billsSent([res], again); }
        if (x === "pay") return go("payments");
        if (x === "expire") { if (!await ask(`End ${sh.name}'s plan now?`, "The shop stays paused until it pays.", "End plan")) return; await api(`/api/dev/shops/${id}/subscription`, {method:"POST", body:{action:"expire_now"}}); toast("Ended — shop auto-paused"); return again(); }
        if (x === "pause" || x === "resume") { if (x === "pause" && !await ask(`⏸ Pause ${sh.name}?`, "The shop will close.", "⏸ Pause")) return; await api("/api/dev/service", {method:"POST", body:{shop_id: id, action: x}}); toast(x === "pause" ? "Paused" : "Resumed"); return again(); }
        if (x === "pw") { if (!await ask("🔑 Reset the password?", "The shopkeeper will be logged out.", "Reset")) return; const res = await api(`/api/dev/shops/${id}/reset-password`, {method:"POST", body:{}}); return shownOnce("New password", [["Login", res.login || (r.owner && (r.owner.mobile || r.owner.username)) || ""], ["Password", res.password]]); }
        if (x === "rk") { if (!await ask("Create a new recovery key?", "The old one will stop working.", "Create")) return; const res = await api(`/api/dev/shops/${id}/reset-recovery`, {method:"POST", body:{}}); return shownOnce("New recovery key", [["Recovery key", res.recovery_key]]); }
      } catch (e) { b.disabled = false; fail(e); } });
    $("#pr").onsubmit = async e => { e.preventDefault(); try { await api(`/api/dev/shops/${id}/subscription`, {method:"POST", body:{action:"price", price: $("#pp").value.trim()}}); toast("Price saved"); again(); } catch (x) { fail(x); } };
  }
})();
