// Netlify scheduled function: every 10 minutes, asks the class database which classes start in the next
// 20 minutes (from each class's timetable) and sends a reminder to those students' phones and their teachers'.
// It uses the same environment variables as the notifications (SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC_KEY,
// VAPID_PRIVATE_KEY, VAPID_SUBJECT). Its key to the database is made from your private notifications key, so
// nobody else can ask; the database remembers it the first time.
import crypto from "node:crypto";
import { vapidJwt, encrypt } from "./push.mjs";

export default async () => {
  const env = k => (process.env[k] || "").trim();
  const url = env("SUPABASE_URL").replace(/\/+$/, ""), key = env("SUPABASE_KEY");
  const vpub = env("VAPID_PUBLIC_KEY"), vpriv = env("VAPID_PRIVATE_KEY"), vsub = env("VAPID_SUBJECT") || "mailto:teacher@example.com";
  if (!url || !key || !vpub || !vpriv) return new Response("off");
  const pkey = crypto.createHmac("sha256", vpriv).update("class-reminders").digest("hex");
  const r = await fetch(url + "/rest/v1/rpc/reminders_due", { method: "POST", headers: { apikey: key, authorization: "Bearer " + key, "content-type": "application/json" }, body: JSON.stringify({ p_key: pkey }) }).catch(() => null);
  if (!r || !r.ok) return new Response("nothing");
  const list = await r.json().catch(() => []);
  let sent = 0;
  await Promise.all((Array.isArray(list) ? list : []).map(async s => {
    try {
      const msg = JSON.stringify({ title: String(s.title || "Class soon").slice(0, 80), body: String(s.body || "").slice(0, 160), url: "./", tag: String(s.tag || "class").slice(0, 60) });
      const aud = new URL(s.endpoint).origin;
      const res = await fetch(s.endpoint, { method: "POST", headers: { TTL: "1800", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", Authorization: "vapid t=" + vapidJwt(aud, vsub, vpub, vpriv) + ", k=" + vpub }, body: encrypt(s, msg) });
      if (res.ok) sent++;
    } catch (e) {}
  }));
  return new Response("sent " + sent);
};
export const config = { schedule: "*/10 * * * *" };
