// Netlify Function: your audience's questions, sent with no name and no account.
// The page that sends them (ask.html, or your own copy of it on another address) only ever talks to this.
// Netlify environment variables: SUPABASE_URL and SUPABASE_KEY (the same ones the class uses).
export default async (req) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" };
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: Object.assign({ "content-type": "application/json" }, cors) });
  if (req.method === "OPTIONS") return new Response("", { status: 204, headers: cors });
  if (req.method !== "POST") return json({ ok: true });
  const env = k => (process.env[k] || "").trim();
  const url = env("SUPABASE_URL").replace(/\/+$/, ""), anon = env("SUPABASE_KEY");
  if (!url || !anon) return json({ error: "not set up" }, 503);
  let b = {};
  try { b = await req.json(); } catch (e) { return json({ error: "bad" }, 400); }
  if (b.hp) return json({ ok: true });   // a robot filled the hidden box: say thanks, keep nothing
  const text = String(b.text || "").replace(/\s+/g, " ").trim().slice(0, 600);
  const kind = ["question", "news", "confession"].includes(b.kind) ? b.kind : "question";
  if (text.length < 2) return json({ error: "empty" }, 400);
  const r = await fetch(url + "/rest/v1/asks", {
    method: "POST",
    headers: { apikey: anon, authorization: "Bearer " + anon, "content-type": "application/json", prefer: "return=minimal" },
    body: JSON.stringify({ body: text, kind }),
  }).catch(() => null);
  if (!r || !r.ok) return json({ error: "store", status: r ? r.status : 0 }, 502);
  return json({ ok: true });
};
