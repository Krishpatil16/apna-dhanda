// v10.16.2 speed pass 3: the owner's first screen (Today) needs the dashboard and the active orders. They used to be asked for only
// after all the panel scripts had downloaded and run (~0.5 s more on a slow phone). This small file (async, in <head>) reads the login
// state the page already preloads and, for a logged-in owner opening Today, starts those two exact requests at once. common.js api()
// hands each answer to the first matching call (once, within 20 s; a call for one of the two waits until this file has decided, so a
// request is never made twice); anything else goes to the network exactly as before.
(function(){
  try {
    if (!window.fetch || window.__adPre || /^\/dev\//.test(location.pathname)) return;
    var h = location.hash; if (h && h !== "#" && h !== "#today") return;
    var o = {method: "GET", headers: {}, credentials: "same-origin"}, P = window.__adPre = {}, done; window.__adPreT = Date.now();
    var D = "/api/admin/dashboard", O = "/api/admin/orders?status=active&q=";
    P.__paths = [D, O]; P.__dec = new Promise(function(r){ done = r; }); setTimeout(function(){ done(); }, 8000);
    P["/api/admin/state"] = fetch("/api/admin/state", o).then(function(r){
      try { if (!r.ok) done(); else r.clone().json().then(function(s){
        if (s && s.admin && !s.needs_setup && !s.admin.must_change) {
          P[D] = fetch(D, o); P[O] = fetch(O, o); P[D].catch(function(){}); P[O].catch(function(){});
        }
        done();
      }, function(){ done(); }); } catch (e) { done(); }
      return r;
    }, function(e){ done(); throw e; });
    P["/api/admin/state"].catch(function(){});
  } catch (e) {}
})();
