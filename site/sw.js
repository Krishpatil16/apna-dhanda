// Apna Dhanda service worker v10.7 (2026-10-25): + action buttons on low-stock alerts (+10 / +20). v10.6: + Dev app alerts (new shop, payment, plan ending). v10.5: shows order + shopkeeper notifications (Web Push). No offline caching of pages.
// v10.5: the same file is registered once PER APP with a narrow scope — /dev (Dev app), /admin (Dukaan app) and /s/<slug>
// (each shop's customer app) — so no app's worker ever controls another app's pages. The old worker registered at scope "/"
// (before v10.5) removes itself the moment it updates to this file, so old installs stop capturing every page.
const SW_VERSION = "10.16.2"; // v10.8: bumped every deploy → the browser installs the new worker (skipWaiting + clients.claim)
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const IS_ROOT = SCOPE_PATH === "/";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  if (IS_ROOT) { try { await self.registration.unregister(); } catch {} return; }
  await self.clients.claim();
})()));
// Pages that belong to this app: inside the scope; a shop's worker also serves its order-tracking page (/track?s=<slug>).
const shopSlug = SCOPE_PATH.startsWith("/s/") ? SCOPE_PATH.slice(3).replace(/\/.*$/, "") : "";
const ours = href => { try { const u = new URL(href); if (u.origin !== self.location.origin) return false;
  if (u.pathname === SCOPE_PATH || u.pathname.startsWith(SCOPE_PATH.replace(/\/?$/, "/"))) return true;
  return !!shopSlug && (u.pathname === "/track" || u.pathname === "/info") && u.searchParams.get("s") === shopSlug; } catch { return false; } };
// v10.10: AI product icons (/icons/<slug>.webp?v=N) are cached lazily — each one the first time a page shows it, never all 287 up front.
// Only icon requests are touched; pages, API calls and everything else go to the network exactly as before.
const ICON_CACHE = "ak-icons-v1";
self.addEventListener("fetch", e => {
  const r = e.request; if (r.method !== "GET") return;
  let u; try { u = new URL(r.url); } catch { return; }
  if (u.origin !== self.location.origin || !/^\/icons\/[a-z0-9-]+\.webp$/.test(u.pathname)) return;
  e.respondWith((async () => {
    const c = await caches.open(ICON_CACHE); const hit = await c.match(r); if (hit) return hit;
    const res = await fetch(r); if (res.ok) { try { await c.put(r, res.clone()); } catch {} } return res;
  })());
});
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {body: e.data ? e.data.text() : ""}; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || "Apna Dhanda", {
      body: d.body || "", icon: d.icon || "/icon-192.png?v=8", badge: "/badge-96.png", tag: d.tag || undefined, renotify: !!d.tag,
      data: {url: d.url || SCOPE_PATH, acts: Array.isArray(d.actions) ? Object.fromEntries(d.actions.slice(0, 2).map(a => [a.action, a.url])) : {}}, lang: "hi", vibrate: [200, 100, 200],
      ...(Array.isArray(d.actions) && d.actions.length ? {actions: d.actions.slice(0, 2).map(a => ({action: a.action, title: a.title}))} : {})
    });
    // Tell this app's open pages (they refresh at once) and keep the last one for checks.
    try { const c = await caches.open("ak-push-log"); await c.put(SCOPE_PATH.replace(/\/?$/, "/") + "__last-push", new Response(JSON.stringify({...d, scope: SCOPE_PATH, received_at: Date.now()}))); } catch {}
    const wins = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for (const w of wins) if (ours(w.url)) w.postMessage({type: "ak-push", data: d});
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const dd = e.notification.data || {}; // v10.7: a tapped action button ("+10 जोड़ें") opens its own deep link (one-tap restock)
  const url = new URL((e.action && dd.acts && dd.acts[e.action]) || dd.url || SCOPE_PATH, self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({type: "window", includeUncontrolled: true});
    for (const w of wins) {
      if (ours(w.url) && new URL(w.url).pathname === new URL(url).pathname && "focus" in w) {
        try { await w.navigate(url); } catch {}
        return w.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
