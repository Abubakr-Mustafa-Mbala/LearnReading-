// Netlify Function: subtitles. Turns a recorded explanation into words with their times, using OpenAI.
// Netlify environment variables: OPENAI_API_KEY (needed), SUPABASE_URL and SUPABASE_KEY (to check the person
// is signed in to the class, and to fetch the recording from the class's file store).
export default async (req) => {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (req.method !== "POST") return json({ error: "post only" }, 405);
  const env = k => (process.env[k] || "").trim();
  const key = env("OPENAI_API_KEY");
  if (!key) return json({ off: true });
  const auth = req.headers.get("authorization") || "";
  const url = env("SUPABASE_URL").replace(/\/+$/, ""), anon = env("SUPABASE_KEY");
  if (!/^Bearer \S+/.test(auth) || !url || !anon) return json({ error: "sign in" }, 401);
  const who = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, authorization: auth } }).catch(() => null);
  if (!who || !who.ok) return json({ error: "sign in" }, 401);
  let b = {};
  try { b = await req.json(); } catch (e) { return json({ error: "bad body" }, 400); }
  let audio = null, type = "audio/mp4";
  if (b.path && /^[\w\-/.]+$/.test(b.path)) {
    const r = await fetch(url + "/storage/v1/object/public/class/" + b.path).catch(() => null);
    if (!r || !r.ok) return json({ error: "no file" }, 404);
    type = r.headers.get("content-type") || type; audio = await r.arrayBuffer();
  } else if (b.audio && b.audio.length < 6000000) {
    audio = Buffer.from(String(b.audio), "base64"); type = String(b.type || type);
  } else return json({ error: "no audio" }, 400);
  const ext = /webm/.test(type) ? "webm" : /mpeg|mp3/.test(type) ? "mp3" : /wav/.test(type) ? "wav" : "m4a";
  const fd = new FormData();
  fd.append("file", new Blob([audio], { type }), "voice." + ext);
  fd.append("model", "whisper-1");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "word");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: "Bearer " + key }, body: fd }).catch(() => null);
  const d = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok) return json({ error: "ai", status: r ? r.status : 0, msg: String((d.error && d.error.message) || "").slice(0, 200) }, 502);
  const words = (d.words || []).map(w => [Math.round(w.start * 100) / 100, Math.round(w.end * 100) / 100, String(w.word || "").trim()]).filter(w => w[2]);
  return json({ words, text: d.text || "" });
};
