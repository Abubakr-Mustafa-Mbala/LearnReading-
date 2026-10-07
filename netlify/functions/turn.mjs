// Voice relay for the reading class. Hands the app short-lived Cloudflare TURN credentials so calls
// connect on mobile data. Set CF_TURN_KEY_ID and CF_TURN_API_TOKEN in Netlify (Environment variables).
export default async (req) => {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return new Response("Not allowed", { status: 403 });
  const id = process.env.CF_TURN_KEY_ID;
  const token = process.env.CF_TURN_API_TOKEN;
  if (!id || !token) return Response.json({ iceServers: [], relay: false, reason: "not set up" });
  try {
    const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${id}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: 86400 }),
    });
    if (!r.ok) return Response.json({ iceServers: [], relay: false, reason: "cloudflare " + r.status }, { status: 502 });
    const data = await r.json();
    const iceServers = (data.iceServers || [])
      .map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53\?/.test(u)) }))
      .filter((s) => s.urls.length);
    return Response.json({ iceServers, relay: true }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return Response.json({ iceServers: [], relay: false, reason: "network" }, { status: 502 });
  }
};
