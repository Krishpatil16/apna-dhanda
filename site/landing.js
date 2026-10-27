/* Apna Dhanda v10.12.5 landing "/": EN | हिंदी switch (shared "ak_lang" choice, English first) + the glass flow:
   choice → (short glass transition) → shopkeeper / customer info, on the same page (#shopkeeper / #customer, browser back works). */
(function(){
  var KEY = "ak_lang", lang = "en"; try { lang = localStorage.getItem(KEY) || "en"; } catch (e) {}
  var btn = document.getElementById("langBtn");
  function apply(){
    document.documentElement.lang = lang === "en" ? "en" : "hi";
    var els = document.querySelectorAll("[data-en]");
    for (var i = 0; i < els.length; i++) { var el = els[i];
      if (!el.hasAttribute("data-hi")) el.setAttribute("data-hi", el.innerHTML);
      if (lang === "en") el.textContent = el.getAttribute("data-en"); else el.innerHTML = el.getAttribute("data-hi"); }
    if (btn) { btn.classList.add("lang-sw"); btn.innerHTML = '<span class="' + (lang === "en" ? "on" : "") + '">EN</span><i aria-hidden="true">|</i><span lang="hi" class="' + (lang === "en" ? "" : "on") + '">हिंदी</span>'; btn.setAttribute("aria-label", lang === "en" ? "Language: English. Switch to Hindi" : "भाषा: हिंदी"); }
  }
  if (btn) btn.onclick = function(){ lang = lang === "en" ? "hi" : "en"; try { localStorage.setItem(KEY, lang); } catch (e) {} apply(); };
  apply();

  var V = {choice: document.getElementById("vChoice"), shopkeeper: document.getElementById("vShop"), customer: document.getElementById("vCust")};
  if (!V.choice) return;
  var tr = document.getElementById("lfTrans"), cur = "choice", busy = false, reduce = false;
  try { reduce = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  function cls(el, c, on){ if (el) el.classList[on ? "add" : "remove"](c); }
  function swap(name, how){
    for (var k in V) { var v = V[k]; if (!v) continue; v.hidden = k !== name; cls(v, "on", k === name); cls(v, "lf-in", false); cls(v, "lf-fade", false); }
    var t = V[name]; if (t && how && !reduce) { void t.offsetWidth; cls(t, how, true); }
    cur = name; try { window.scrollTo(0, 0); } catch (e) {}
    var h = t && t.querySelector("h1,h2"); if (h && how) { h.setAttribute("tabindex", "-1"); try { h.focus({preventScroll: true}); } catch (e) {} }
  }
  // choice → info: a 1–1.3 s glass card (🏪 or 🛍️) expands with a sheen, then the info slides up
  function go(name, anim){
    if (!V[name] || name === cur || busy) return;
    if (name === "choice" || !anim || reduce || !tr) return swap(name, name === "choice" ? "lf-fade" : "lf-in");
    busy = true; var card = V.choice.querySelector(".lf-card");
    tr.className = "lf-trans on " + (name === "shopkeeper" ? "t-shop" : "t-cust"); cls(card, "lf-leave", true);
    setTimeout(function(){ swap(name, "lf-in"); cls(card, "lf-leave", false); tr.classList.add("off");
      setTimeout(function(){ tr.className = "lf-trans"; busy = false; }, 360); }, 1150);
  }
  window.AD_LANDING = {go: go, view: function(){ return cur; }};
  document.addEventListener("click", function(e){
    var a = e.target.closest ? e.target.closest("[data-go]") : null; if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var n = a.getAttribute("data-go"); if (!V[n]) return; e.preventDefault();
    if (n === "choice") { if (history.state && history.state.lf) history.back(); else { try { history.replaceState(null, "", location.pathname + location.search); } catch (x) {} go("choice"); } return; }
    try { history.pushState({lf: n}, "", "#" + n); } catch (x) {}
    go(n, true);
  });
  function fromHash(anim){ var m = location.hash.match(/^#(shopkeeper|customer)$/); go(m ? m[1] : "choice", anim); }
  window.addEventListener("popstate", function(){ busy = false; if (tr) tr.className = "lf-trans"; fromHash(false); });
  fromHash(false);
  // after the first-visit intro the choice card blurs in (landing.css: html.lf-intro-out .lf-choice)
})();
