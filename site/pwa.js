/* Apna Dhanda v10.8: + 🆕 update bar (checks /health on open + visibilitychange) and 📶 offline/online bar. v10.5 — one installable app per role on this site, kept apart:
   • Dev app      → /dev            (manifest /dev.webmanifest,  id /dev-app,   service worker scope /dev)
   • Dukaan app   → /admin          (manifest /admin.webmanifest, id /admin-app, service worker scope /admin)
   • Customer app → /s/<slug>       (manifest /s/<slug>/manifest.webmanifest, id /s/<slug>, scope /s/<slug>)
   The landing page "/" is not an app. This file registers the page's own narrow-scope service worker, removes the old
   pre-v10.5 worker at scope "/" (it used to control every page), and shows a small role-labelled "Install app" prompt. */
(function(){
  var meta = document.querySelector('meta[name="ak-app"]'), app = meta ? meta.getAttribute("content") || "" : "";
  var sm = document.querySelector('meta[name="ak-shop"]'), slug = sm ? sm.getAttribute("content") || "" : "", shopName = sm ? sm.getAttribute("data-name") || "" : "";
  var scope = app === "dev" ? "/dev" : app === "admin" ? "/admin" : (app === "shop" && slug) ? "/s/" + slug : "";
  var hasSW = "serviceWorker" in navigator, regP = null, oldEndpoint = null;
  function waitActive(reg){ return new Promise(function(ok){
    if (!reg || reg.active) return ok(reg); var w = reg.installing || reg.waiting; if (!w) return ok(reg);
    var t = setTimeout(function(){ ok(reg); }, 10000);
    w.addEventListener("statechange", function(){ if (reg.active) { clearTimeout(t); ok(reg); } }); }); }
  // Remove the old site-wide worker (scope "/"). Its push address is kept so the panel can move alerts to the new app.
  function cleanup(){
    if (!hasSW || !navigator.serviceWorker.getRegistrations) return Promise.resolve();
    return navigator.serviceWorker.getRegistrations().then(function(rs){ return Promise.all(rs.map(function(r){
      if (new URL(r.scope).pathname !== "/") return null;
      return (r.pushManager ? r.pushManager.getSubscription().catch(function(){ return null; }) : Promise.resolve(null))
        .then(function(sub){ if (sub) oldEndpoint = sub.endpoint; return r.unregister(); });
    })); }).catch(function(){});
  }
  function register(){
    if (!hasSW || !scope) return Promise.resolve(null);
    if (!regP) regP = cleanup().then(function(){ return navigator.serviceWorker.register("/sw.js?app=" + app, {scope: scope}); })
      .then(waitActive).catch(function(){ regP = null; return null; });
    return regP;
  }
  window.AKPWA = {app: app, scope: scope, register: register, cleanup: cleanup, oldEndpoint: function(){ return oldEndpoint; }};
  if (hasSW) addEventListener("load", function(){ if (scope) register(); else cleanup(); });

  // ---------- v10.8: 🆕 auto-update notice + 📶 weak-internet bar (all apps) ----------
  // Every page carries <meta name="ak-ver"> (the deploy it came from). On open and whenever the app comes back to the
  // screen we ask /health (no-store) for the live version and nudge the service worker to update. Newer → a small bar
  // "🆕 Naya update aaya — Refresh"; if nothing is being typed, the page simply reloads itself.
  var vm = document.querySelector('meta[name="ak-ver"]'), myVer = vm ? vm.getAttribute("content") || "" : "";
  var dirty = false, upBar = null, netBar = null, netT = null;
  function isNewer(cur, srv){ if (!cur || !srv) return false; var a = String(cur).split("."), b = String(srv).split(".");
    for (var i = 0; i < Math.max(a.length, b.length); i++) { var x = Number(a[i] || 0), y = Number(b[i] || 0); if (y !== x) return y > x; } return false; }
  function barCss(){ if (document.getElementById("akBarCss")) return; var st = document.createElement("style"); st.id = "akBarCss";
    st.textContent = ".ak-bar{position:fixed;z-index:10000;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 74px);width:min(94vw,430px);display:flex;align-items:center;gap:10px;padding:8px 8px 8px 14px;border-radius:14px;color:#fff;font:700 14px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)}"
      + ".ak-bar span{flex:1}.ak-bar button{min-height:44px;min-width:44px;border:0;border-radius:10px;padding:8px 14px;font:800 14px system-ui,sans-serif;background:#fff;color:#111;cursor:pointer}"
      + ".ak-up{background:#1f6b3a}.ak-off{background:#b91c1c}.ak-on{background:#15803d}";
    document.head.appendChild(st); }
  function showUpdate(v){
    if (upBar) return; barCss(); upBar = document.createElement("div"); upBar.className = "ak-bar ak-up"; upBar.setAttribute("role", "status");
    var s = document.createElement("span"); s.textContent = "🆕 Naya update aaya" + (v ? " (" + v + ")" : ""); upBar.appendChild(s);
    var b = document.createElement("button"); b.type = "button"; b.textContent = "Refresh"; b.setAttribute("aria-label", "Refresh — naya update lo"); b.onclick = function(){ location.reload(); }; upBar.appendChild(b);
    document.body.appendChild(upBar);
  }
  function check(auto){
    if (!myVer || typeof fetch !== "function") return Promise.resolve(false);
    try { if (regP) regP.then(function(r){ if (r && r.update) r.update().catch(function(){}); }); } catch (e) {}
    return fetch("/health", {cache: "no-store"}).then(function(r){ return r.ok ? r.json() : null; }).then(function(h){
      if (!h || !isNewer(myVer, h.version)) return false;
      var typing = dirty || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
      var tried = ""; try { tried = sessionStorage.getItem("ak_reload_for") || ""; } catch (e) {}
      if (auto && !typing && tried !== h.version && !(window.AKDirty && window.AKDirty())) { try { sessionStorage.setItem("ak_reload_for", h.version); } catch (e) {} location.reload(); return true; } // once per version: never a reload loop
      showUpdate(h.version); return true;
    }).catch(function(){ return false; });
  }
  function net(on){
    barCss(); clearTimeout(netT); if (netBar) { netBar.remove(); netBar = null; }
    netBar = document.createElement("div"); netBar.className = "ak-bar " + (on ? "ak-on" : "ak-off"); netBar.setAttribute("role", "status");
    netBar.textContent = on ? "✅ Wapas online" : "📶 Internet nahi hai — jo save kiya wo net aate hi bhej denge";
    document.body.appendChild(netBar);
    if (on) netT = setTimeout(function(){ if (netBar) { netBar.remove(); netBar = null; } }, 2500);
  }
  window.AKUpdate = {isNewer: isNewer, check: check, version: myVer, showUpdate: showUpdate, net: net};
  document.addEventListener("input", function(e){ if (e.target && e.target.closest && e.target.closest("form, .sheet, .ak-ov")) dirty = true; }, true);
  document.addEventListener("submit", function(){ dirty = false; }, true);
  window.addEventListener("load", function(){ setTimeout(function(){ check(true); }, 1500); });
  document.addEventListener("visibilitychange", function(){ if (document.visibilityState === "visible") check(true); });
  window.addEventListener("offline", function(){ net(false); });
  window.addEventListener("online", function(){ net(true); });
  if (navigator.onLine === false) window.addEventListener("load", function(){ net(false); });

  // ---------- "Install app / Home screen pe add karo" (one per role) ----------
  if (!scope) return;
  var standalone = function(){ return matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; };
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var KEY = "pwa." + (app === "shop" ? "shop." + slug : app) + ".hide";
  var label = app === "dev" ? "🛠️ Apna Dhanda Dev app" : app === "admin" ? "🏪 Dukaan app (दुकानदार)" : "🛒 " + (shopName || "Dukaan") + " app";
  function hidden(){ try { return Date.now() - Number(localStorage.getItem(KEY) || 0) < 7 * 864e5; } catch (e) { return false; } }
  var deferred = null, bar = null;
  function css(){
    if (document.getElementById("pwaCss")) return; var st = document.createElement("style"); st.id = "pwaCss";
    st.textContent = ".pwa-bar{position:fixed;z-index:9999;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 10px);width:min(94vw,430px);display:flex;align-items:center;gap:10px;padding:10px 10px 10px 14px;border-radius:16px;background:#fff;color:#1f2937;box-shadow:0 10px 30px rgba(0,0,0,.18);font:600 14px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;border:2px solid " + (app === "dev" ? "#6d28d9" : app === "admin" ? "#1f6b3a" : "#f97316") + "}"
      + ".pwa-bar .pt{flex:1;min-width:0}.pwa-bar small{display:block;font-weight:500;color:#4b5563;margin-top:2px}"
      + ".pwa-bar button{border:0;border-radius:12px;padding:9px 12px;font:700 14px system-ui,sans-serif;cursor:pointer}"
      + ".pwa-bar .pi{background:" + (app === "dev" ? "#6d28d9" : app === "admin" ? "#1f6b3a" : "#ea580c") + ";color:#fff}.pwa-bar .px{background:#f3f4f6;color:#374151;padding:9px 11px}";
    document.head.appendChild(st);
  }
  function show(ios){
    if (bar || standalone() || hidden()) return; css();
    bar = document.createElement("div"); bar.className = "pwa-bar pwa-" + app; bar.setAttribute("role", "dialog"); bar.setAttribute("aria-label", "Install app");
    var t = document.createElement("div"); t.className = "pt"; t.textContent = "📲 " + label;
    var s = document.createElement("small"); s.textContent = ios ? "Share ⬆️ → “Add to Home Screen” · Home screen pe add karo" : "Install karo · Home screen pe add karo"; t.appendChild(s); bar.appendChild(t);
    if (!ios) { var b = document.createElement("button"); b.type = "button"; b.className = "pi"; b.textContent = "Install"; bar.appendChild(b);
      b.onclick = function(){ if (!deferred) return close(); deferred.prompt(); deferred.userChoice.then(function(){ deferred = null; close(); }, close); }; }
    var x = document.createElement("button"); x.type = "button"; x.className = "px"; x.setAttribute("aria-label", "Close"); x.textContent = "✕"; bar.appendChild(x);
    x.onclick = function(){ try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} close(); };
    document.body.appendChild(bar);
  }
  function close(){ if (bar) { bar.remove(); bar = null; } }
  addEventListener("beforeinstallprompt", function(e){ e.preventDefault(); deferred = e; setTimeout(function(){ show(false); }, 2500); });
  addEventListener("appinstalled", function(){ deferred = null; close(); });
  if (isIOS && !standalone()) addEventListener("load", function(){ setTimeout(function(){ show(true); }, 4000); });
})();
