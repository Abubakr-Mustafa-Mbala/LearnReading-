// Netlify Function: Tidy looks at something handwritten on the board.
// If it's writing, it returns the letters; if it's a drawing, it says so (the app then straightens it).
// Netlify environment variables:
//   OPENAI_API_KEY  (ChatGPT, used first)   or   ANTHROPIC_API_KEY (Claude)
//   SUPABASE_URL and SUPABASE_KEY (to check the person is signed in to the class, so strangers can't spend the key)
//   TIDY_MODEL (optional: which model to use)
const PROMPT = "This picture was drawn with a finger on a chalkboard by an adult who is learning to read and write. " +
  "Decide if it is WRITING (letters, a word or a short phrase) or a DRAWING (a line, arrow, shape, picture). " +
  "If it is writing, give exactly the letters you see, keeping capital and small letters as written, and do NOT correct the spelling. " +
  'Reply with JSON only: {"type":"text","text":"the letters"} or {"type":"drawing"}. If you can\'t tell, reply {"type":"unknown"}.';

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
  const image = String(b.image || "");
  if (!image || image.length > 800000 || !/^[A-Za-z0-9+/=]+$/.test(image)) return json({ error: "bad image" }, 400);

  let reply = "", fail = null;
  if (openai) {
    const model = env("TIDY_MODEL") || "gpt-4.1-mini";
    const thinking = /^(gpt-5|o\d)/.test(model);   // these models take different settings
    const body = {
      model,
      messages: [{ role: "user", content: [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: "data:image/png;base64," + image, detail: "low" } },
      ] }],
      response_format: { type: "json_object" },
    };
    if (thinking) { body.max_completion_tokens = 400; body.reasoning_effort = "minimal"; } else body.max_tokens = 60;
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
      body: JSON.stringify({
        model: env("TIDY_MODEL") || "claude-sonnet-5-5", max_tokens: 60,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: image } },
          { type: "text", text: PROMPT },
        ] }],
      }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) fail = { who: "Claude", status: r ? r.status : 0, code: (d.error && d.error.type) || "", msg: (d.error && d.error.message) || "" };
    else reply = (d.content || []).map(c => c.text || "").join("");
  }
  if (fail) return json({ error: "ai", ...fail, msg: String(fail.msg).slice(0, 200) }, 502);
  let o = {};
  try { o = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1)); } catch (e) { o = {}; }
  if (o.type === "drawing") return json({ type: "drawing" });
  const text = String(o.text || "").trim().replace(/[^A-Za-z0-9 .,!?'-]/g, "").slice(0, 30);
  return json(o.type === "text" && text ? { type: "text", text } : { type: "unknown" });
};
