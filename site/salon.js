(function(){
  "use strict";
  const {api, esc} = AK;
  const $ = s => document.querySelector(s);
  const L = (en, hi) => AK.lang === "hi" ? hi : en;
  let data = null; const selected = new Set();
  const qr = new URLSearchParams(location.search).get("src") === "qr";
  const sheet = $("#salonSheet"), back = $("#sheetBack");
  function renderLang(){ AK.paintLang(); document.documentElement.lang = AK.lang === "hi" ? "hi" : "en";
    document.querySelectorAll("[data-l]").forEach(el => { const [en, hi] = el.dataset.l.split("|"); el.textContent = L(en, hi); });
    if (data) { paintName(); renderGroups(); paintCount(); paintStatus(); }
    $("#sendBtn").textContent = L(qr ? "Book →" : "Send request →", qr ? "बुक करें →" : "रिक्वेस्ट भेजें →");
    $("#guestName").placeholder = L("Your name", "आपका नाम");
    $("#sheetFoot").textContent = qr ? L("You get your number right away.", "आपको नंबर तुरंत मिलेगा।") : L("The salon will confirm your request.", "सैलून आपकी रिक्वेस्ट कन्फर्म करेगा।");
  }
  function paintName(){ if (!data) return; const st = data.settings || {};
    $("#salonName").textContent = (AK.lang === "hi" ? st.store_name_hi || st.store_name_en : st.store_name_en || st.store_name_hi) || data.shop.name || AK.SHOP.name;
    const tg = AK.lang === "hi" ? st.tagline_hi || st.tagline_en : st.tagline_en || st.tagline_hi; if (tg) $("#salonTag").textContent = tg; }
  function paintStatus(){ if (!data) return; const el = $("#salonStatus"); el.textContent = data._open ? L("● Open now","● अभी खुला है") : L("● Closed now","● अभी बंद है"); el.classList.toggle("closed", !data._open); }
  function renderGroups(){ const root = $("#salonGroups"); if (!data) return;
    root.innerHTML = data.salon.groups.map(g => { const services = data.salon.services.filter(s => s.group === g.key); if (!services.length) return "";
      return `<section class="salon-group"><div class="salon-group-heading"><span class="salon-group-icon">${g.icon}</span><h3>${esc(L(g.name_en, g.name_hi))}</h3><span class="salon-group-number">${String(services.length).padStart(2,"0")}</span></div><div class="salon-tiles">${services.map(s => `<button type="button" class="salon-tile ${selected.has(s.key) ? "selected" : ""}" data-key="${s.key}" aria-pressed="${selected.has(s.key)}"><span class="salon-tile-icon" aria-hidden="true">${s.icon}</span><span class="salon-tile-text"><b>${esc(L(s.name_en, s.name_hi))}</b>${s.price_paise != null ? `<small>₹${(s.price_paise/100).toLocaleString("en-IN")}</small>` : ""}</span><span class="salon-tick" aria-hidden="true">${selected.has(s.key) ? "✓" : "+"}</span></button>`).join("")}</div></section>`;
    }).join("");
  }
  function paintCount(){ const n=selected.size; $("#bookBtn").disabled = !n || (data && data.service_paused);
    $("#selCount").textContent = L(`${n} selected`, `${n} चुनी गईं`);
    if (sheet && !sheet.hidden && data) $("#sheetSummary").textContent = [...selected].map(k => { const s = data.salon.services.find(x=>x.key===k); return s ? L(s.name_en,s.name_hi) : ""; }).join(" · ");
  }
  function showSheet(on){ sheet.hidden = back.hidden = !on; document.body.classList.toggle("sheet-open",on); if (on){paintCount();$("#guestName").focus();} }
  $("#salonGroups").addEventListener("click",e=>{const tile=e.target.closest("[data-key]"); if(!tile)return;const key=tile.dataset.key; selected.has(key)?selected.delete(key):selected.add(key);renderGroups();paintCount();});
  $("#bookBtn").onclick=()=>showSheet(true); $("#sheetClose").onclick=$("#sheetBack").onclick=()=>showSheet(false);
  $("#langBtn").onclick=()=>{AK.setLang(AK.lang === "en" ? "hi" : "en");renderLang();};
  $("#salonForm").addEventListener("submit",async e=>{
    e.preventDefault(); const name=$("#guestName").value.trim(); if(!name){$("#guestName").focus();return;}
    const keys=[...selected]; if(!keys.length)return;
    const btn=$("#sendBtn"); btn.disabled=true; btn.textContent=L("Sending…","भेज रहे हैं…"); $("#salonError").textContent="";
    try{
      let idem=sessionStorage.getItem(AK.SK("salon_idem")); if (!idem){idem=[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,"0")).join("");sessionStorage.setItem(AK.SK("salon_idem"),idem);}
      const r=await api("/api/orders",{method:"POST",body:{idempotency_key:idem,name,services:keys,source:qr?"walkin":"online"}});
      sessionStorage.removeItem(AK.SK("salon_idem"));
      try{ localStorage.setItem("cust._me",JSON.stringify({name})); }catch{}
      const mine=JSON.parse(localStorage.getItem(AK.SK("ak_orders"))||"[]");
      const tok=r.token||(mine.find(o=>o.code===r.order.code)||{}).token;
      if(tok){ if(!mine.some(o=>o.code===r.order.code)){mine.unshift({code:r.order.code,token:tok,at:r.order.created_at,total:0});localStorage.setItem(AK.SK("ak_orders"),JSON.stringify(mine.slice(0,30)));}
        location.href=`/track?s=${encodeURIComponent(AK.SHOP.slug)}#${r.order.code}.${tok}`;
      }else throw new Error(L("Could not save the booking link. Please try again.","बुकिंग लिंक सेव नहीं हुआ। फिर कोशिश करें।"));
    }catch(err){$("#salonError").textContent=err.message||L("Please try again.","फिर कोशिश करें।");btn.disabled=false;btn.textContent=L(qr?"Book →":"Send request →",qr?"बुक करें →":"रिक्वेस्ट भेजें →");}
  });
  // v10.15.1: count salon visits in Reports again (same anonymous beacon as the shop page: random device id, at most once per 30 min per salon)
  function visitBeacon(){
    try { const slug = AK.SHOP && AK.SHOP.slug; if (!slug) return;
      const vk = AK.SK("ak_visit_at"), t = Date.now(); if (t - Number(localStorage.getItem(vk) || 0) < 30*60000) return;
      let did = localStorage.getItem("ak_did");
      if (!/^[a-z0-9]{16,40}$/.test(did || "")) { const a = new Uint8Array(12); crypto.getRandomValues(a); did = [...a].map(x => x.toString(16).padStart(2, "0")).join(""); localStorage.setItem("ak_did", did); }
      let name = ""; try { name = String((JSON.parse(localStorage.getItem("cust._me") || "null") || {}).name || "").trim().slice(0, 40); } catch {}
      localStorage.setItem(vk, String(t));
      fetch("/api/visit", {method: "POST", keepalive: true, credentials: "omit", headers: {"content-type": "application/json", "x-shop": slug}, body: JSON.stringify({did, name})}).catch(() => {});
    } catch {}
  }
  async function start(){ renderLang(); $("#navServices").href=AK.HOME; $("#navBookings").href=`/track?s=${encodeURIComponent(AK.SHOP.slug)}`;
    try{data=await api("/api/store"); paintName();
      const open = !!(data.settings && data.settings.status && data.settings.status.open) && !data.service_paused;
      data._open = open; paintStatus();
      try {const me=JSON.parse(localStorage.getItem("cust._me")||"null");if(me?.name)$("#guestName").value=me.name;}catch{}
      renderGroups(); paintCount(); visitBeacon();
    }catch(err){$("#salonGroups").innerHTML=`<p class="salon-loading">${esc(err.message||"Could not load services")}</p>`;}
  }
  start();
})();