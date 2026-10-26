// Background: draw the share card for a report that doesn't have one yet
// (reports made before share cards existed). Started only by /api/card.
import { launchBrowser } from "../lib/browser.mjs";
import { reports, cards, appSecret } from "../lib/store.mjs";
import { makeCard, cardable } from "../lib/card.mjs";

export default async (req) => {
  if (req.headers.get("x-hs-key") !== (await appSecret())) return;
  const id = (new URL(req.url).searchParams.get("id") || "").replace(/[^a-f0-9-]/gi, "").slice(0, 40);
  if (!id || (await cards().get(id))) return;
  const r = await reports().get(id, { type: "json" });
  if (!cardable(r)) return;
  let browser;
  try { browser = await launchBrowser(); await makeCard(browser, id, r); }
  catch (e) { console.error("card-bg failed", String(e && e.message).slice(0, 200)); }
  finally { if (browser) await browser.close().catch(() => {}); }
};

export const config = { path: "/api/card-bg", background: true };
