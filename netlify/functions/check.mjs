import { getStore } from "@netlify/blobs";
import { json } from "../lib/guard.mjs";

export default async (req) => {
  const id = (new URL(req.url).searchParams.get("id") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  if (!id) return json({ error: "Missing id." });
  const data = await getStore("checks").get(id, { type: "json", consistency: "strong" });
  if (!data) return json({ state: "unknown", id });
  // ?summary=1 leaves out the bulky scan data (for monitoring)
  if (new URL(req.url).searchParams.get("summary")) { const { scan, ...rest } = data; return json(rest); }
  return json(data);
};

export const config = { path: "/api/check" };
