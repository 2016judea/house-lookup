import { lookup } from "../lib/lookup.js";

export default async function handler(req, res) {
  const address = String(req.query?.address ?? "").trim().slice(0, 200);
  if (!address) return res.status(400).json({ found: false, error: "Pass ?address=" });
  try {
    const r = await lookup(address);
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(r.found ? 200 : 404).json(r);
  } catch (e) {
    res.status(502).json({ found: false, error: "Upstream lookup failed: " + e.message });
  }
}
