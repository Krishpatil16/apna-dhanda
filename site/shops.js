/* Apna Dhanda v10.12.3 — customer side. /shops = category tiles only (no shop names: privacy), /shops/<category> = that category's
   registered shops with a small search and 📍 Near me (browser location → the server sorts that category by distance). EN | हिंदी. */
(function(){
  "use strict";
  var KEY = "ak_lang", lang = "en"; try { lang = localStorage.getItem(KEY) || "en"; } catch (e) {}
  var $ = function(s){ return document.querySelector(s); };
  var btn = $("#langBtn"), q = $("#q"), cards = $("#cards"), note = $("#note"), empty = $("#empty"), near = $("#nearBtn"), main = document.querySelector(".c-main");
  var cat = document.body.getAttribute("data-cat") || "";
  var TY = {kirana: ["🛒", "Grocery", "किराना", "grocery"], restaurant: ["🍽️", "Restaurant", "होटल", "food"], salon: ["💇", "Salon", "सैलून", "salon"],
    clinic: ["🩺", "Clinic", "क्लिनिक", "clinic"], repair: ["🔧", "Repair", "रिपेयर", "repair"], other: ["🏪", "Other", "अन्य", "other"]};
  var T = function(en, hi){ return lang === "en" ? en : hi; };
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
  function apply(){
    document.documentElement.lang = lang === "en" ? "en" : "hi";
    var els = document.querySelectorAll("[data-en]");
    for (var i = 0; i < els.length; i++) { var el = els[i]; if (!el.hasAttribute("data-hi")) el.setAttribute("data-hi", el.textContent); el.textContent = el.getAttribute(lang === "en" ? "data-en" : "data-hi"); }
    if (q) q.placeholder = q.getAttribute(lang === "en" ? "data-ph-en" : "data-ph-hi");
    if (btn) { btn.innerHTML = '<span class="' + (lang === "en" ? "on" : "") + '">EN</span><i aria-hidden="true">|</i><span lang="hi" class="' + (lang === "en" ? "" : "on") + '">हिंदी</span>'; btn.setAttribute("aria-label", lang === "en" ? "Language: English. Switch to Hindi" : "भाषा: हिंदी"); }
  }
  if (btn) btn.onclick = function(){ lang = lang === "en" ? "hi" : "en"; try { localStorage.setItem(KEY, lang); } catch (e) {} apply(); };
  apply();
  if (!cat || !cards) return; // the category screen is plain links; nothing else to do there

  var tools = document.querySelector(".c-tools");
  function norm(s){ return String(s || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim(); }
  function show(){
    var term = norm(q && q.value), li = cards.querySelectorAll("li"), n = 0;
    for (var i = 0; i < li.length; i++) { var ok = !term || norm(li[i].getAttribute("data-n")).indexOf(term) >= 0; li[i].hidden = !ok; if (ok) n++; }
    empty.hidden = n > 0 || li.length === 0;
    if (tools) tools.hidden = li.length === 0 && !(near && near.getAttribute("aria-pressed") === "true");
  }
  if (q) q.addEventListener("input", show);
  function card(s){ var t = TY[s.type] || TY.other;
    return '<li class="sc t-' + t[3] + '" data-t="' + esc(s.type) + '" data-n="' + esc(String(s.name).toLowerCase()) + '"><a href="/s/' + esc(s.slug) + '">' +
      '<span class="sc-ic" aria-hidden="true">' + (s.logo ? '<img src="' + esc(s.logo) + '" alt="" width="48" height="48" loading="lazy" decoding="async">' : t[0]) + '</span>' +
      '<span class="sc-tx"><b>' + esc(s.name) + '</b><span class="sc-meta"><em class="sc-badge" data-en="' + t[1] + '" data-hi="' + t[2] + '">' + T(t[1], t[2]) + '</em>' +
      '<i class="dot ' + (s.open ? "on" : "off") + '" aria-hidden="true"></i><span class="sc-st" data-en="' + (s.open ? "Open" : "Closed") + '" data-hi="' + (s.open ? "खुला है" : "बंद है") + '">' + (s.open ? T("Open", "खुला है") : T("Closed", "बंद है")) + '</span>' +
      (s.km_text ? '<span class="sc-km">📍 ' + esc(s.km_text) + '</span>' : "") + '</span></span><span class="sc-go" aria-hidden="true">›</span></a></li>'; }
  function say(en, hi){ note.hidden = false; note.setAttribute("data-en", en); note.setAttribute("data-hi", hi); note.textContent = T(en, hi); }
  function load(pos){
    var u = "/api/shops" + "?type=" + encodeURIComponent(cat) + (pos ? "&lat=" + pos.lat.toFixed(5) + "&lng=" + pos.lng.toFixed(5) : "");
    return fetch(u, {credentials: "omit"}).then(function(r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function(d){
      cards.innerHTML = d.shops.map(card).join(""); main.setAttribute("data-n", String(d.shops.length)); show();
      var withKm = d.shops.filter(function(s){ return s.km != null; }).length;
      if (pos) { if (withKm) say("Nearest shops first.", "सबसे पास की दुकानें पहले।"); else say("These shops haven't set their location yet, so here is the normal list.", "इन दुकानों ने अभी लोकेशन नहीं डाली, इसलिए सामान्य लिस्ट।"); }
    });
  }
  if (near) near.onclick = function(){
    if (near.getAttribute("aria-pressed") === "true") { near.setAttribute("aria-pressed", "false"); note.hidden = true; load(null).catch(function(){}); return; }
    if (!navigator.geolocation) { say("Location isn't available on this phone.", "इस फ़ोन पर लोकेशन नहीं मिल रही।"); return; }
    near.disabled = true; say("Finding your location…", "आपकी लोकेशन देख रहे हैं…");
    navigator.geolocation.getCurrentPosition(function(p){
      load({lat: p.coords.latitude, lng: p.coords.longitude}).then(function(){ near.setAttribute("aria-pressed", "true"); })
        .catch(function(){ say("Couldn't load shops. Check your internet and try again.", "दुकानें लोड नहीं हुईं। इंटरनेट देखकर फिर कोशिश करें।"); })
        .then(function(){ near.disabled = false; });
    }, function(err){ near.disabled = false;
      if (err && err.code === 1) say("Location is off. Allow location for this site to see shops near you.", "लोकेशन बंद है। पास की दुकानें देखने के लिए लोकेशन की इजाज़त दें।");
      else say("Couldn't get your location. Try again.", "लोकेशन नहीं मिली। फिर कोशिश करें।");
    }, {enableHighAccuracy: false, timeout: 12000, maximumAge: 300000});
  };
  show();
})();
