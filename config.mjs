// Netlify Function: tells every phone which Supabase project this class uses, so nobody ever has to
// connect by hand. Set SUPABASE_URL and SUPABASE_KEY (the publishable or anon key, which is public by
// design) in Netlify's environment variables.
// It also says WHICH optional settings the website can see (yes/no only, never the values), so the
// app's "Website setup" check can show what's missing.
export default async () => {
  const env = k => (process.env[k] || "").trim();
  const url = env("SUPABASE_URL").replace(/\/+$/, "");
  const key = env("SUPABASE_KEY");
  const vapid = env("VAPID_PUBLIC_KEY");   // for phone notifications (optional)
  const setup = {
    SUPABASE_URL: !!url, SUPABASE_KEY: !!key,
    VAPID_PUBLIC_KEY: !!vapid, VAPID_PRIVATE_KEY: !!env("VAPID_PRIVATE_KEY"), VAPID_SUBJECT: !!env("VAPID_SUBJECT"),
    OPENAI_API_KEY: !!env("OPENAI_API_KEY"), ANTHROPIC_API_KEY: !!env("ANTHROPIC_API_KEY"),
    CF_TURN_KEY_ID: !!env("CF_TURN_KEY_ID"), CF_TURN_API_TOKEN: !!env("CF_TURN_API_TOKEN"),
  };
  const out = url && key ? Object.assign({ url, key }, vapid ? { vapid } : {}) : {};
  out.setup = setup;
  return new Response(JSON.stringify(out), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
