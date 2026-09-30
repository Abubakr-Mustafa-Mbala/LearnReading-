// Netlify Function: tells every phone which Supabase project this class uses, so nobody ever has to
// connect by hand. Set SUPABASE_URL and SUPABASE_KEY (the publishable or anon key, which is public by
// design) in Netlify's environment variables.
export default async () => {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_KEY || "").trim();
  return new Response(JSON.stringify(url && key ? { url, key } : {}), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
};
