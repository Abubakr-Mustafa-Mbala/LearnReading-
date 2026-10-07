// Netlify Function: ideas for thumbnail words (and a title) for a video.
// Netlify environment variables:
//   OPENAI_API_KEY  (ChatGPT, used first)   or   ANTHROPIC_API_KEY (Claude)
//   SUPABASE_URL and SUPABASE_KEY (to check the person is signed in, so strangers can't spend the key)
//   THUMB_MODEL (optional: which model to use)
const RULES = "You write the words that go ON a YouTube thumbnail for a creator. Rules: " +
  "3 to 6 words each, ALL CAPS, punchy, curiosity-driven, never a summary of the video. " +
  "The thumbnail creates the curiosity; the title gives the context. " +
  "Each option must use a genuinely different psychological angle (curiosity, shock, question, conflict, mistake, result). " +
  "No emoji, no hashtags, no clickbait lies, nothing the video can't back up. Plain, honest, human words. " +
  "Also write one YouTube title (under 70 characters) that gives the context. " +
  'Reply with JSON only: {"texts":["...","...","...","...","..."],"title":"..."}';

export default async (req) => {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (req.method !== "POST") return json({ error: "post only" }, 405);
  const env = k => (process.env[k] || "").trim();
  const openai = env("OPENAI_API_KEY"), claude = env("ANTHROPIC_API_KEY");
  if (!openai && !claude) return json({ off: true });
  const auth = req.headers.get("authorization") || "";
  const url = env("SUPABASE_URL").replace(/\/+$/, ""), anon = env("SUPABASE_KEY");
  if (!/^Bearer \S+/.test(auth) || !url || !anon) return json({ error: "sign in" }, 401);
  const who = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, authorization: auth } }).catch(() => null);
  if (!who || !who.ok) return json({ error: "sign in" }, 401);
  let b = {};
  try { b = await req.json(); } catch (e) { return json({ error: "bad body" }, 400); }
  const clip = (v, n) => String(v || "").replace(/[\u0000-\u001f]/g, " ").slice(0, n);
  const ask = RULES + "\n\nVideo type: " + clip(b.type, 30) + "\nAngle wanted first: " + clip(b.angle, 30) +
    "\nWhat the video is about: " + (clip(b.topic, 400) || "(not given)") + (b.title ? "\nWorking title: " + clip(b.title, 120) : "");

  let reply = "", fail = null;
  if (openai) {
    const model = env("THUMB_MODEL") || "gpt-4.1-mini";
    const thinking = /^(gpt-5|o\d)/.test(model);
    const body = { model, messages: [{ role: "user", content: ask }], response_format: { type: "json_object" } };
    if (thinking) { body.max_completion_tokens = 800; body.reasoning_effort = "minimal"; } else { body.max_tokens = 250; body.temperature = 0.9; }
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { authorization: "Bearer " + openai, "content-type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) fail = { who: "ChatGPT", status: r ? r.status : 0, code: (d.error && (d.error.code || d.error.type)) || "", msg: (d.error && d.error.message) || "" };
    else reply = ((d.choices || [])[0] || {}).message ? d.choices[0].message.content || "" : "";
  } else {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": claude, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: env("THUMB_MODEL") || "claude-sonnet-5-5", max_tokens: 300, messages: [{ role: "user", content: ask }] }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) fail = { who: "Claude", status: r ? r.status : 0, code: (d.error && d.error.type) || "", msg: (d.error && d.error.message) || "" };
    else reply = (d.content || []).map(c => c.text || "").join("");
  }
  if (fail) return json({ error: "ai", ...fail, msg: String(fail.msg).slice(0, 200) }, 502);
  let o = {};
  try { o = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1)); } catch (e) { o = {}; }
  const texts = (Array.isArray(o.texts) ? o.texts : []).map(t => String(t || "").toUpperCase().replace(/[^A-Z0-9 .,!?'’→:-]/g, "").replace(/\s+/g, " ").trim()).filter(t => t && t.split(" ").length <= 7).slice(0, 6);
  return json({ texts, title: String(o.title || "").slice(0, 100) });
};
