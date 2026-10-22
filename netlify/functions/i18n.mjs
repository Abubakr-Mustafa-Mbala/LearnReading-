// Netlify Function: the app in any language. Translates the app's own words (only those: the list is in
// i18n-keys.mjs, so lessons, names and messages are never sent) the first time someone uses a language,
// and keeps them in the database for everyone after that.
// Netlify environment variables: OPENAI_API_KEY (or ANTHROPIC_API_KEY), SUPABASE_URL, SUPABASE_KEY.
import crypto from "node:crypto";
import KEYS from "./i18n-keys.mjs";

const NAMES = { ar: "Arabic", fr: "French", nl: "Dutch", ur: "Urdu", tr: "Turkish", id: "Indonesian", ms: "Malay", sw: "Swahili", ha: "Hausa", so: "Somali",
  es: "Spanish", pt: "Portuguese", bn: "Bengali", fa: "Persian", de: "German", it: "Italian", ru: "Russian", hi: "Hindi", zh: "Simplified Chinese",
  ny: "Chichewa (Nyanja)", bem: "Bemba", yo: "Yoruba", am: "Amharic", ps: "Pashto", ku: "Kurdish (Kurmanji)" };
const WORDS = new Set(KEYS);

export default async (req) => {
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (req.method !== "POST") return json({ error: "post only" }, 405);
  const env = k => (process.env[k] || "").trim();
  const openai = env("OPENAI_API_KEY"), claude = env("ANTHROPIC_API_KEY"), url = env("SUPABASE_URL").replace(/\/+$/, ""), anon = env("SUPABASE_KEY");
  if (!url || !anon) return json({ t: {} });
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer \S{20,}/.test(auth)) return json({ error: "sign in" }, 401);
  const who = await fetch(url + "/auth/v1/user", { headers: { apikey: anon, authorization: auth } }).catch(() => null);
  if (!who || !who.ok) return json({ error: "sign in" }, 401);
  let b = {}; try { b = await req.json(); } catch (e) { return json({ error: "bad body" }, 400); }
  const secret = openai || claude, pkey = secret ? crypto.createHmac("sha256", secret).update("al-halaqa-i18n").digest("hex") : "";
  const rpc = (fn, body, a) => fetch(url + "/rest/v1/rpc/" + fn, { method: "POST", headers: { apikey: anon, authorization: a || "Bearer " + anon, "content-type": "application/json" }, body: JSON.stringify(body) });
  // you (the owner) register the helper's key, so only it can save translations
  if (b.claim) { if (!pkey) return json({ ok: false }); const r = await rpc("i18n_claim", { p_key: pkey }, auth).catch(() => null); return json({ ok: !!(r && r.ok) }); }
  // you (the owner) can get a whole language ready for everyone, a piece at a time
  if (b.fill) {
    const lang = String(b.fill); if (!NAMES[lang]) return json({ error: "language" }, 400);
    if (!secret) return json({ error: "nokey" });
    const r = await rpc("i18n_claim", { p_key: pkey }, auth).catch(() => null);
    if (!r || !r.ok) return json({ error: "owner" }, 403);
    const C = 25, chunks = Math.ceil(KEYS.length / C), i = Math.max(0, Math.min(chunks - 1, Number(b.chunk) | 0));
    const t = await translate(lang, KEYS.slice(i * C, i * C + C));
    return json({ chunks, n: Object.keys(t).length });
  }
  const lang = String(b.lang || ""); if (!NAMES[lang]) return json({ error: "language" }, 400);
  const asked = [...new Set((Array.isArray(b.items) ? b.items : []).map(x => String(x || "")))].slice(0, 60);
  const skip = asked.filter(x => !(x.length >= 2 && x.length <= 400 && WORDS.has(x))), items = asked.filter(x => !skip.includes(x)).slice(0, 30);
  if (!items.length) return json({ t: {}, skip });
  return json({ t: await translate(lang, items), skip });
  async function translate(lang, items) {
  const out = {};
  // already translated for everyone
  try {
    const q = items.map(s => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"').join(",");
    const r = await fetch(url + "/rest/v1/i18n?select=src,txt&lang=eq." + lang + "&src=in.(" + encodeURIComponent(q) + ")", { headers: { apikey: anon, authorization: "Bearer " + anon } });
    if (r.ok) for (const x of await r.json()) out[x.src] = x.txt;
  } catch (e) {}
  const need = items.filter(s => !out[s]);
  if (!need.length || !secret) return out;
  // the AI translates the rest
  const p = "Translate these short pieces of text from the interface of a learning app (an online Islamic academy: classes, lessons, students, teachers, parents, videos) from English into " + NAMES[lang] + ".\n" +
    "Rules: keep every {#} exactly (it stands for a number) and every placeholder like {name}, {n}, {term}, {money} exactly as written (untranslated); keep emoji and symbols; keep it short and natural, as a native app would say it (buttons, labels, short messages); " +
    "keep Islamic terms in their usual form for that language (Quran, Fajr, wudu, ijazah…); don't translate the names Al-Halaqa, YouTube, TikTok, WhatsApp, Instagram.\n" +
    'Reply with JSON only: {"t":["…", "…"]} with exactly ' + need.length + " translations in the same order.\n\n" + JSON.stringify(need);
  let reply = "";
  if (openai) {
    const model = env("I18N_MODEL") || "gpt-4.1-mini", thinking = /^(gpt-5|o\d)/.test(model);
    const body = { model, messages: [{ role: "user", content: p }], response_format: { type: "json_object" } };
    if (thinking) { body.max_completion_tokens = 4000; body.reasoning_effort = "minimal"; } else { body.max_tokens = 3000; body.temperature = 0.2; }
    const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { authorization: "Bearer " + openai, "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {}; reply = r && r.ok ? (((d.choices || [])[0] || {}).message || {}).content || "" : "";
  } else {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": claude, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: env("I18N_MODEL") || "claude-haiku-4-5-20251001", max_tokens: 3000, messages: [{ role: "user", content: p }] }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {}; reply = r && r.ok ? (d.content || []).map(c => c.text || "").join("") : "";
  }
  let T = []; try { T = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1)).t || []; } catch (e) {}
  const rows = [];
  need.forEach((s, i) => { const v = String(T[i] || "").trim(); const ph = (s.match(/\{[a-z#]+\}/g) || []).sort().join(); if (v && v.length <= 800 && (v.match(/\{[a-z#]+\}/g) || []).sort().join() === ph) { out[s] = v; rows.push({ s, t: v }); } });
  if (rows.length) await rpc("i18n_save", { p_key: pkey, p_lang: lang, p_rows: rows }).catch(() => null);
  return out;
  }
};
