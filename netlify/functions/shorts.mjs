// Netlify Function: the studio's writer (long videos and Shorts). Finds the best moments in a transcript, writes hooks,
// titles, descriptions and hashtags, scripts for a Short, and ideas for a channel.
// Netlify environment variables:
//   OPENAI_API_KEY (ChatGPT)   or   ANTHROPIC_API_KEY (Claude)
//   SUPABASE_URL and SUPABASE_KEY (to check it's you, so nobody else can spend the key)
//   SHORTS_MODEL (optional: which model to use)
const RULES = "You help a Muslim teacher and content creator make YouTube videos and short vertical videos (YouTube Shorts, TikTok, Instagram Reels). " +
  "Be accurate and respectful about Islam; never invent hadith, verses or rulings. Never suggest music. Plain, punchy, natural language. " +
  "Reply with JSON only.";

function prompt(b) {
  const lang = b.lang === "ar" ? "Write the titles and hooks in Arabic." : "Write in the same language as the transcript (English if unsure).";
  if (b.mode === "moments") {
    const n = Math.max(1, Math.min(8, +b.count || 3)), max = Math.max(20, Math.min(180, +b.maxLen || 55));
    return "Below is a transcript with times in seconds, one sentence per line, as [start-end] text.\n" +
      `Choose the ${n} best self-contained moments to post as Shorts. Each must be between 15 and ${max} seconds long, ` +
      "start at the beginning of a sentence with something that grabs attention (a question, a surprising claim, a strong statement), " +
      "carry ONE clear idea a stranger understands without context, and end on a complete thought. Don't overlap moments. " +
      lang + "\nFor each give: start and end (seconds, from the transcript times), score (1-10, how likely it does well), " +
      "hook (max 8 words, to show big on screen in the first seconds, a curiosity gap, no clickbait lies), " +
      "title (max 70 characters, for the post), why (max 12 words: why it works), desc (2 short sentences for the description), " +
      "tags (5-8 relevant hashtags in one string, include #shorts).\n" +
      'JSON: {"moments":[{"start":0,"end":0,"score":0,"hook":"","title":"","why":"","desc":"","tags":""}]}\n\nTRANSCRIPT:\n' + (b.lines || []).join("\n").slice(0, 12000);
  }
  if (b.mode === "kit" && b.long) {
    return "Write what to post with this YouTube video (" + Math.round((+b.dur || 0) / 60) + " minutes). Its transcript, one sentence per line as [seconds] text:\n" + (b.lines || []).join("\n").slice(0, 12000) + "\nIts working title: \"" + String(b.title || "").slice(0, 120) + "\"\n" +
      "Give: titles (3 options, max 70 characters, clear promise, curiosity without lying), desc (3-5 sentences: what the viewer learns, then a question to drive comments; no hashtags in it), " +
      "chapters (5-12 chapters in order: t = the start in seconds taken from the transcript, title max 40 characters; the first must be t 0 titled like Introduction; each at least 15 seconds apart), " +
      "tags (12-20 YouTube tags separated by commas, mix broad and specific), youtube (3 hashtags in one string), pinned (one pinned comment that starts a discussion), " +
      "time (one short sentence: a good time to post for a Muslim audience in Africa and the UK). Same language as the video.\n" +
      'JSON: {"titles":["","",""],"desc":"","chapters":[{"t":0,"title":""}],"tags":"","youtube":"","pinned":"","time":""}';
  }
  if (b.mode === "kit") {
    return "Write what to post with this short video. What's said in it:\n\"" + String(b.text || "").slice(0, 4000) + "\"\nIts working title: \"" + String(b.title || "").slice(0, 120) + "\"\n" +
      "Give: titles (3 options, max 70 characters each, curiosity without lying), desc (2-3 short sentences ending with a question to drive comments), " +
      "youtube (5-8 hashtags in one string, include #shorts), tiktok (5-8 hashtags in one string, mix broad and niche), instagram (8-12 hashtags in one string), " +
      "time (one short sentence: a good time of day to post for a Muslim audience in Africa and the UK, and why). Same language as the video.\n" +
      'JSON: {"titles":["","",""],"desc":"","youtube":"","tiktok":"","instagram":"","time":""}';
  }
  if (b.mode === "script") {
    const secs = Math.max(15, Math.min(1200, +b.secs || 45)), words = Math.round(secs * 2.4);
    if (secs > 120) return "Write an outline and script for a " + Math.round(secs / 60) + "-minute YouTube video about: \"" + String(b.idea || "").slice(0, 600) + "\".\n" +
      "Give: hook (the first 15 seconds: why they must watch to the end), script (an intro of 2-3 sentences, then 3-6 sections each starting with a short heading line in capitals followed by the points to say as short sentences; " +
      "if you mention a verse or hadith give its reference and only if you are sure it is authentic), cta (the closing: a recap line and the next step for the viewer), title (max 70 characters). Same language as the idea.\n" +
      'JSON: {"hook":"","script":"","cta":"","title":""}';
    return "Write a script for a " + secs + "-second vertical video (about " + words + " words spoken) about: \"" + String(b.idea || "").slice(0, 600) + "\".\n" +
      "Structure: hook (one sentence, said in the first 2 seconds, makes people stay: a question, a surprising fact, or a bold statement), " +
      "script (the body: short sentences, one idea, concrete, easy to say out loud; if you mention a verse or hadith give its reference and only if you are sure it is authentic), " +
      "cta (one line: a question for the comments, or a reason to follow), title (max 70 characters). Same language as the idea.\n" +
      'JSON: {"hook":"","script":"","cta":"","title":""}';
  }
  if (b.mode === "ideas") {
    const n = Math.max(3, Math.min(15, +b.n || 10));
    return "Give " + n + " ideas for Shorts for a channel about: \"" + String(b.topic || "").slice(0, 300) + "\". Mix formats: myths vs facts, common mistakes, " +
      "'3 things', quick lessons, questions people ask, stories with a lesson, word of the day; and some longer YouTube videos (full lessons, explainers, series). " +
      "Each: fmt (\"short\" or \"long\"; about a third long), title (max 60 characters) and hook (max 10 words, the first line said). Same language as the topic.\n" +
      'JSON: {"ideas":[{"fmt":"short","title":"","hook":""}]}';
  }
  return null;
}

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
  // paid tools are yours alone (and your own media team's, when you allow it)
  const w = await fetch(url + "/rest/v1/rpc/whoami", { method: "POST", headers: { apikey: anon, authorization: auth, "content-type": "application/json" }, body: "{}" }).then(r => (r.ok ? r.json() : null)).catch(() => null);
  if (!w || !(w.owner === true || w.paid === true || (w.owner === undefined && w.teacher === true))) return json({ error: "owner only" }, 403);
  let b = {};
  try { b = await req.json(); } catch (e) { return json({ error: "bad body" }, 400); }
  const p = prompt(b);
  if (!p) return json({ error: "bad mode" }, 400);
  const maxOut = b.mode === "moments" ? 1400 : b.mode === "ideas" ? 1000 : b.mode === "kit" && b.long ? 1400 : b.mode === "script" && +b.secs > 120 ? 2400 : 700;
  let reply = "", fail = null;
  if (openai) {
    const model = env("SHORTS_MODEL") || "gpt-4.1-mini", thinking = /^(gpt-5|o\d)/.test(model);
    const body = { model, messages: [{ role: "system", content: RULES }, { role: "user", content: p }], response_format: { type: "json_object" } };
    if (thinking) { body.max_completion_tokens = maxOut + 1500; body.reasoning_effort = "minimal"; } else { body.max_tokens = maxOut; body.temperature = 0.7; }
    const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { authorization: "Bearer " + openai, "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) fail = { who: "ChatGPT", status: r ? r.status : 0, msg: (d.error && d.error.message) || "" };
    else reply = ((d.choices || [])[0] || {}).message ? d.choices[0].message.content || "" : "";
  } else {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": claude, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: env("SHORTS_MODEL") || "claude-sonnet-5-5", max_tokens: maxOut, system: RULES, messages: [{ role: "user", content: p }] }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) fail = { who: "Claude", status: r ? r.status : 0, msg: (d.error && d.error.message) || "" };
    else reply = (d.content || []).map(c => c.text || "").join("");
  }
  if (fail) return json({ error: "ai", who: fail.who, status: fail.status, msg: String(fail.msg).slice(0, 200) }, 502);
  let o = {};
  try { o = JSON.parse(reply.slice(reply.indexOf("{"), reply.lastIndexOf("}") + 1)); } catch (e) { return json({ error: "ai", msg: "unreadable reply" }, 502); }
  const S = (x, n) => String(x == null ? "" : x).slice(0, n);
  if (b.mode === "moments") return json({ moments: (Array.isArray(o.moments) ? o.moments : []).slice(0, 10).map(m => ({ start: +m.start || 0, end: +m.end || 0, score: +m.score || 0, hook: S(m.hook, 90), title: S(m.title, 100), why: S(m.why, 140), desc: S(m.desc, 500), tags: S(m.tags, 300) })) });
  if (b.mode === "kit" && b.long) return json({ titles: (Array.isArray(o.titles) ? o.titles : []).slice(0, 3).map(t => S(t, 100)), desc: S(o.desc, 1500), chapters: (Array.isArray(o.chapters) ? o.chapters : []).slice(0, 20).map(c => ({ t: Math.max(0, +c.t || 0), title: S(c.title, 60) })).sort((x, y) => x.t - y.t).map((c, i) => (i === 0 ? Object.assign(c, { t: 0 }) : c)), tags: S(o.tags, 500), youtube: S(o.youtube, 200), pinned: S(o.pinned, 400), time: S(o.time, 200) });
  if (b.mode === "kit") return json({ titles: (Array.isArray(o.titles) ? o.titles : []).slice(0, 3).map(t => S(t, 100)), desc: S(o.desc, 800), youtube: S(o.youtube, 300), tiktok: S(o.tiktok, 300), instagram: S(o.instagram, 500), time: S(o.time, 200) });
  if (b.mode === "script") return json({ hook: S(o.hook, 300), script: S(o.script, 9000), cta: S(o.cta, 200), title: S(o.title, 100) });
  return json({ ideas: (Array.isArray(o.ideas) ? o.ideas : []).slice(0, 15).map(x => ({ fmt: x.fmt === "long" ? "long" : "short", title: S(x.title, 100), hook: S(x.hook, 120) })) });
};
