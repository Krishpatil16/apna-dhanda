// v7: shows a "Dev mode" banner when the developer opened this panel with "Login as shop", with an Exit back to /dev.
(async () => {
  try {
    const r = await fetch("/api/admin/state", {credentials: "same-origin", headers: {accept: "application/json"}}); const j = await r.json();
    const dm = j && j.admin && j.admin.dev_mode; if (!dm) return;
    const el = document.getElementById("devBanner"); if (!el) return;
    const t = document.createElement("span"); t.textContent = "🛠️ Dev mode · " + (j.admin.shop && j.admin.shop.name || "") + "";
    const b = document.createElement("button"); b.type = "button"; b.textContent = "Exit ✕";
    b.onclick = async () => { b.disabled = true; try { await fetch("/api/admin/logout", {method: "POST", credentials: "same-origin", headers: {"x-requested-with": "kirana", "content-type": "application/json"}, body: "{}"}); } catch (e) {} location.href = "/dev#shops"; };
    el.append(t, b); el.hidden = false; document.body.classList.add("dev-mode");
  } catch (e) {}
})();
