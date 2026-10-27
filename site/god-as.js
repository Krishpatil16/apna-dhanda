// v10.15 👑 God Mode viewing: /dev/as/<shop> opens the real shopkeeper panel for that shop, as the developer.
// Only this page loads this file. Every /api/admin/… call is sent to /api/dev/god/as/<shop>/api/admin/… (developer login + header),
// so nothing changes for shopkeepers. No service worker and no push subscription are registered from here.
(function(){
  var m = location.pathname.match(/^\/dev\/as\/(\d+)$/); if (!m) return;
  var sid = m[1], pre = "/api/dev/god/as/" + sid, of = window.fetch.bind(window);
  window.fetch = function(input, init){
    try {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var u = new URL(url, location.href);
      if (u.origin === location.origin && u.pathname.indexOf("/api/admin/") === 0) {
        init = Object.assign({}, init || {});
        var meth = String(init.method || (typeof input !== "string" && input.method) || "GET").toUpperCase();
        var h = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined) || {});
        if (meth !== "GET" && meth !== "HEAD") h.set("x-requested-with", "kirana-dev");
        init.headers = h; init.method = meth; init.credentials = "same-origin";
        return of(pre + u.pathname + u.search, init);
      }
    } catch (e) {}
    return of(input, init);
  };
  try { if (navigator.serviceWorker) navigator.serviceWorker.register = function(){ return Promise.reject(new Error("God Mode viewing: no service worker")); }; } catch (e) {}
  try { if (window.PushManager && PushManager.prototype) PushManager.prototype.subscribe = function(){ return Promise.reject(new Error("God Mode viewing: no push")); }; } catch (e) {}
  var shopName = ""; // v10.15.1: was bar.name — a function's .name is read-only ("bar"), so the banner said "viewing · bar"
  function bar(){
    var el = document.getElementById("devBanner"); if (!el) return;
    var go = function(){ el.innerHTML = ""; var t = document.createElement("span"); t.textContent = "👑 God Mode viewing · " + (shopName || ("shop #" + sid)); t.style.minWidth = "0"; t.style.overflow = "hidden"; t.style.textOverflow = "ellipsis"; t.style.whiteSpace = "nowrap";
      var b = document.createElement("a"); b.href = "/dev#shop-" + sid; b.textContent = "Exit ✕"; b.className = "god-exit"; b.style.whiteSpace = "nowrap"; b.style.flex = "none"; b.style.color = "#ffd76a"; b.style.fontWeight = "800";
      el.append(t, b); el.hidden = false; el.classList.add("god-as"); document.body.classList.add("dev-mode"); };
    go(); setTimeout(go, 1200); setTimeout(go, 3000);
  }
  of(pre + "/api/admin/state", {credentials: "same-origin"}).then(function(r){ return r.json(); }).then(function(j){
    if (!j || !j.admin) { location.href = "/dev"; return; } shopName = (j.admin.shop && j.admin.shop.name) || ""; bar(); }).catch(function(){});
  document.addEventListener("DOMContentLoaded", bar);
})();
