// Netlify Function: tells every phone which Supabase project this class uses, so nobody ever has to
// connect by hand. Set SUPABASE_URL and SUPABASE_KEY (the publishable or anon key, which is public by
// design) in Netlify's environment variables.
export default async () => {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_KEY || "").trim();
  const vapid = (process.env.VAPID_PUBLIC_KEY || "").trim();   // for phone notifications (optional)
  return new Response(JSON.stringify(url && key ? Object.assign({ url, key }, vapid ? { vapid } : {}) : {}), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
