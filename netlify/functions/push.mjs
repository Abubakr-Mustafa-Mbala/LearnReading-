// Netlify Function: sends a phone notification (Web Push) when a student asks a question or the
// teacher answers. Who may notify whom is decided by the database (push_targets), using the
// sender's own sign-in, so a stranger can't send anything.
// Netlify environment variables: SUPABASE_URL, SUPABASE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (for example mailto:you@example.com).
import crypto from "node:crypto";

const b64u = b => Buffer.from(b).toString("base64url");
const unb64u = s => Buffer.from(String(s || ""), "base64url");

export function vapidJwt(aud, sub, pubB64u, privB64u) {
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub }));
  const pub = unb64u(pubB64u);
  const key = crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: privB64u, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key, dsaEncoding: "ieee-p1363" });
  return head + "." + body + "." + b64u(sig);
}

// RFC 8291 (aes128gcm): only the phone the subscription belongs to can read the message.
export function encrypt(sub, text) {
  const uaPub = unb64u(sub.p256dh), secret = unb64u(sub.auth);
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), shared = ecdh.computeSecret(uaPub);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, secret, Buffer.concat([Buffer.from("WebPush: info\0"), uaPub, asPub]), 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(text), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head[20] = asPub.length;
  return Buffer.concat([head, asPub, ct]);
}

export default async (req) => {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (req.method !== "POST") return json({ error: "post only" }, 405);
  const env = k => (process.env[k] || "").trim();
  const url = env("SUPABASE_URL").replace(/\/+$/, ""), key = env("SUPABASE_KEY");
  const vpub = env("VAPID_PUBLIC_KEY"), vpriv = env("VAPID_PRIVATE_KEY"), vsub = env("VAPID_SUBJECT") || "mailto:teacher@example.com";
  if (!url || !key || !vpub || !vpriv) return json({ sent: 0, off: true });
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer \S+/.test(auth)) return json({ error: "sign in" }, 401);
  let b = {};
  try { b = await req.json(); } catch (e) { return json({ error: "bad body" }, 400); }
  const to = b.to === "student" ? "student" : "teacher";
  const msg = JSON.stringify({ title: String(b.title || "Reading class").slice(0, 80), body: String(b.body || "").slice(0, 160), url: String(b.url || "./").slice(0, 300), tag: String(b.tag || "rc").slice(0, 60) });
  // the database decides who this person may notify
  const r = await fetch(url + "/rest/v1/rpc/push_targets", { method: "POST", headers: { apikey: key, authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ p_to: to, p_student: b.student || null }) });
  if (!r.ok) return json({ error: "not allowed" }, 403);
  const subs = await r.json();
  let sent = 0;
  await Promise.all((Array.isArray(subs) ? subs : []).map(async s => {
    try {
      const aud = new URL(s.endpoint).origin;
      const res = await fetch(s.endpoint, { method: "POST", headers: { TTL: "86400", Urgency: "high", "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", Authorization: "vapid t=" + vapidJwt(aud, vsub, vpub, vpriv) + ", k=" + vpub }, body: encrypt(s, msg) });
      if (res.ok) sent++;
      else if (res.status === 404 || res.status === 410) await fetch(url + "/rest/v1/rpc/push_gone", { method: "POST", headers: { apikey: key, authorization: auth, "content-type": "application/json" }, body: JSON.stringify({ p_endpoint: s.endpoint }) });
    } catch (e) {}
  }));
  return json({ sent });
};
