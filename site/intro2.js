/* Apna Dhanda — PREVIEW intro (/?preview=landing2 only): a short intro on EVERY visit, about 1.5 s, Skip / Esc / Enter end it. Copy of intro.js.
   Original note: "/" intro animation control (loaded in <head> on the landing only).
   First visit only (localStorage "ad_intro_v1"); later visits go straight to the choice screen. ?intro=1 forces it, ?intro=0 hides it.
   A deep link (#shopkeeper / #customer) skips it. prefers-reduced-motion: a still card for ~1 s, no motion. Skip button / Esc / Enter end it. */
(function(){
  var d = document.documentElement, K = "ad_intro_v1", q = location.search, seen = false, reduce = false;
  try { seen = localStorage.getItem(K) === "1"; } catch (e) {}
  try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var force = /[?&]intro=1(&|$)/.test(q), off = /[?&]intro=0(&|$)/.test(q), deep = /^#(shopkeeper|customer)$/.test(location.hash);
  var api = {shown: false, done: true, onEnd: null};
  window.AD_INTRO = api;
  if (off || deep) return;
  api.shown = true; api.done = false;
  d.classList.add("lf-intro-on"); if (reduce) d.classList.add("lf-rm");
  var t1, t2;
  function end(){ if (api.done) return; api.done = true; clearTimeout(t1); clearTimeout(t2);
    d.classList.remove("lf-intro-on", "lf-intro-out", "lf-rm"); var el = document.getElementById("lfIntro"); if (el && el.parentNode) el.parentNode.removeChild(el);
    if (api.onEnd) try { api.onEnd(); } catch (e) {} }
  function out(){ if (api.done) return; if (reduce) return end(); d.classList.add("lf-intro-out"); t2 = setTimeout(end, 420); }
  api.skip = out;
  t1 = setTimeout(out, reduce ? 700 : 1050);
  // v10.16.1: a tap anywhere on the intro ends it (not only Skip), and while it fades out the page under it already takes taps (landing2.css)
  document.addEventListener("click", function(e){ if (!api.done && e.target && e.target.closest && (e.target.closest("#lfSkip") || e.target.closest("#lfIntro"))) { e.preventDefault(); out(); } }, true);
  document.addEventListener("keydown", function(e){ if (!api.done && (e.key === "Escape" || e.key === "Enter" || e.key === " ")) out(); });
})();
