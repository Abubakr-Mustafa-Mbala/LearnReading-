// Netlify Function: Tidy reads a handwritten word from the board and returns the letters, using Claude.
// Netlify environment variables: ANTHROPIC_API_KEY (needed), SUPABASE_URL and SUPABASE_KEY (to check the
// person is signed in to the class, so strangers can't spend the key), TIDY_MODEL (optional).
export default async (req) => {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (req.method !== "POST") return json({ error: "post only" }, 405);
  const env = k => (process.env[k] || "").trim();
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return json({ off: true });
  const auth = req.headers.get("authorization") || "";
  const url = env("SUPABASE_URL").replace(/\/+$/, ""), anon = env("SUPABASE_KEY");
  if (!/^Bearer \S+/.test(auth) || !url || !anon) return json({ error: "sign in" }, 401);
  const who = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, authorization: auth } }).catch(() => null);
  if (!who || !who.ok) return json({ error: "sign in" }, 401);
  let b = {};
  try { b = await req.json(); } catch (e) { return json({ error: "bad body" }, 400); }
  const image = String(b.image || "");
  if (!image || image.length > 800000 || !/^[A-Za-z0-9+/=]+$/.test(image)) return json({ error: "bad image" }, 400);
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: env("TIDY_MODEL") || "claude-sonnet-5-5",
      max_tokens: 40,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: image } },
        { type: "text", text: "This is a word or short phrase written with a finger on a chalkboard by an adult who is learning to read and write English letters. Write exactly the letters you see, keeping capital and small letters as they are written. Do not correct the spelling, even if it looks wrong. Reply with only those letters and nothing else. If you can't read it, reply with a single ?" },
      ] }],
    }),
  }).catch(() => null);
  if (!r || !r.ok) return json({ error: "tidy failed" }, 502);
  const d = await r.json().catch(() => ({}));
  const text = (d.content || []).map(c => c.text || "").join("").trim().replace(/[^A-Za-z0-9 .,!?'-]/g, "").slice(0, 30);
  return json({ text: text || "?" });
};
