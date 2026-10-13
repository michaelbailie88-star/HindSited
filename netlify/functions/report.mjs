// A report by its private id: progress while running, the full scan when done.
// Anyone with the link can view it (share links), never who ran it.
import { json } from "../lib/guard.mjs";
import { sessionEmail } from "../lib/session.mjs";
import { reports } from "../lib/store.mjs";

export default async (req) => {
  const id = (new URL(req.url).searchParams.get("id") || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  if (!id) return json({ error: "Missing report id." }, 400);
  const r = await reports().get(id, { type: "json" });
  if (!r) return json({ state: "missing" }, 404);
  const { owner, ...pub } = r;
  const me = await sessionEmail(req);
  return json({ ...pub, mine: !!me && me === owner });
};

export const config = { path: "/api/report", method: "GET" };
