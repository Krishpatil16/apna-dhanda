/* Apna Dhanda v10 — intro splash control. Loaded in <head> on /, /admin and /dev only (never on /s/<slug> storefronts).
   Shows once per browser session (sessionStorage); an installed app's cold launch is a new session, so it shows there too.
   Tap / Enter / Esc skips. ?splash=1 forces it, ?splash=0 hides it. The page loads underneath the whole time. */
(function(){
  var d = document.documentElement, K = "ad_splash_v10", q = location.search;
  if (/^\/s\//.test(location.pathname)) return;
  var force = /[?&]splash=1(&|$)/.test(q), off = /[?&]splash=0(&|$)/.test(q), seen = false;
  try { seen = sessionStorage.getItem(K) === "1"; } catch (e) {}
  if (off || (seen && !force)) return;
  try { sessionStorage.setItem(K, "1"); } catch (e) {}
  d.classList.add("sp-on");
  var done = false;
  var reduce = false; try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  function el(){ return document.getElementById("adSplash"); }
  function end(){ if (done) return; done = true; d.classList.remove("sp-on"); var s = el(); if (s && s.parentNode) s.parentNode.removeChild(s); }
  function skip(){ if (done) return; var s = el(); if (!s) return end(); s.classList.add("sp-skip"); setTimeout(end, 320); }
  setTimeout(end, reduce ? 1650 : 2550);
  document.addEventListener("pointerdown", function(e){ if (!done && e.target && e.target.closest && e.target.closest("#adSplash")) { e.preventDefault(); skip(); } }, true);
  document.addEventListener("click", function(e){ if (!done && e.target && e.target.closest && e.target.closest("#adSplash")) { e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener("keydown", function(e){ if (!done && (e.key === "Escape" || e.key === "Enter" || e.key === " ")) skip(); });
  window.AD_SPLASH = {skip: skip, end: end};
})();
