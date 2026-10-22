// Background helper: shows the class's phone notifications, even when the app is closed.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
// in the language this phone chose in the app (the app keeps the words here for it)
async function inMyLanguage(d) {
  try {
    const c = await caches.open("rc-i18n"), r = await c.match("/__i18n"); if (!r) return d;
    const j = await r.json(), D = j && j.d; if (!j || j.lang === "en" || !D) return d;
    const word = t => { const n = [], k = String(t || "").replace(/\s+/g, " ").trim().replace(/\d+(?:[.,:]\d+)*/g, m => { n.push(m); return "{#}"; }); const v = D[k]; if (!v) return null; let i = 0; return v.replace(/\{#\}/g, () => (i < n.length ? n[i++] : "")); };
    const any = t => { if (!t) return t; const w = word(t); if (w) return w; const m = String(t).match(/^(.{2,40}?)(: | · )([\s\S]*)$/); if (m) { const h1 = D[m[1] + m[2].trimEnd()], h2 = word(m[1]); if (h1) return h1 + " " + (word(m[3]) || m[3]); if (h2) return h2 + m[2] + (word(m[3]) || m[3]); } return t; };
    const fill = (k, v) => { const t = k && D[k]; if (!t) return null; return t.replace(/\{([a-z]+)\}/g, (m, x) => (v && v[x] != null ? (D[v[x]] || v[x]) : m)); };
    return Object.assign({}, d, { title: fill(d.tk, d.tv) || any(d.title), body: fill(d.bk, d.bv) || any(d.body) });
  } catch (x) { return d; }
}
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(inMyLanguage(d).then(t => self.registration.showNotification(t.title || "Al-Halaqa", {
    body: t.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag || "rc", renotify: true, data: { url: d.url || "./" },
  })));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if ("focus" in c) return c.focus();
    return self.clients.openWindow(url);
  }));
});
