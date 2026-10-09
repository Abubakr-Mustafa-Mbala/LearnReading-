// Netlify Function: studio-clean voice. Takes a short piece of a recording and sends back only the speaking voice,
// with the room noise, music, kids and chatter in the background taken out (ElevenLabs Voice Isolator).
// Netlify environment variables: ELEVENLABS_API_KEY (needed; mark it "Contains secret values"),
// SUPABASE_URL and SUPABASE_KEY (to check the person is signed in to the class).
export default async (req) => {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (req.method !== "POST") return json({ error: "post only" }, 405);
  const env = k => (process.env[k] || "").trim();
  const key = env("ELEVENLABS_API_KEY");
  if (!key) return json({ off: true });
  const auth = req.headers.get("authorization") || "";
  const url = env("SUPABASE_URL").replace(/\/+$/, ""), anon = env("SUPABASE_KEY");
  if (!/^Bearer \S+/.test(auth) || !url || !anon) return json({ error: "sign in" }, 401);
  const who = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, authorization: auth } }).catch(() => null);
  if (!who || !who.ok) return json({ error: "sign in" }, 401);
  let b = {};
  try { b = await req.json(); } catch (e) { return json({ error: "bad body" }, 400); }
  if (!b.audio || b.audio.length > 5500000) return json({ error: "no audio" }, 400);
  const type = String(b.type || "audio/mp4"), audio = Buffer.from(String(b.audio), "base64");
  const ext = /webm/.test(type) ? "webm" : /mpeg|mp3/.test(type) ? "mp3" : /wav/.test(type) ? "wav" : "m4a";
  const fd = new FormData();
  fd.append("audio", new Blob([audio], { type }), "voice." + ext);
  const r = await fetch("https://api.elevenlabs.io/v1/audio-isolation", { method: "POST", headers: { "xi-api-key": key }, body: fd }).catch(() => null);
  if (!r || !r.ok) {
    const t = r ? await r.text().catch(() => "") : "";
    return json({ error: "ai", status: r ? r.status : 0, msg: t.slice(0, 300) }, 502);
  }
  const out = await r.arrayBuffer();
  return new Response(out, { status: 200, headers: { "content-type": r.headers.get("content-type") || "audio/mpeg" } });
};
