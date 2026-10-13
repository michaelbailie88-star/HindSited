import { getStore } from "@netlify/blobs";
import { json } from "../lib/guard.mjs";

export default async (req) => {
  const id = (new URL(req.url).searchParams.get("id") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  if (!id) return json({ error: "Missing id." });
  const data = await getStore("checks").get(id, { type: "json", consistency: "strong" });
  return json(data || { state: "unknown", id });
};

export const config = { path: "/api/check" };
