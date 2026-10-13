// Drives the real UI end to end and saves screenshots.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { serve } from "./run.mjs";
import { startDev } from "./dev.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
process.env.HS_ALLOW_LOCAL = "1";
const target = process.argv[2] || "bad";
const port = { bad: 8101, clean: 8102, bad2: 8103 }[target];
const fx = await serve(path.join(here, "fixtures", target), port);
const dev = await startDev(8100);
const b = await puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
fs.mkdirSync(path.join(here, "out"), { recursive: true });
const errors = [];
for (const [w, h, tag] of [[1200, 900, "desk"], [400, 860, "phone"]]) {
  const p = await b.newPage();
  p.on("pageerror", (e) => errors.push(tag + ": " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !/fonts\.g|ERR_TUNNEL|ERR_CONNECTION|net::ERR/.test(m.text())) errors.push(tag + " console: " + m.text()); });
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await p.goto("http://127.0.0.1:8100/", { waitUntil: "domcontentloaded" });
  await p.screenshot({ path: path.join(here, "out", `home-${tag}.png`), fullPage: true });
  await p.type("#url", `http://127.0.0.1:${port}/`);
  await p.click("#go");
  await new Promise((r) => setTimeout(r, 1500));
  await p.screenshot({ path: path.join(here, "out", `progress-${tag}.png`) });
  await p.waitForSelector("#report:not([hidden]) .rep-head, #report:not([hidden]) .err-box", { timeout: 240000 });
  await new Promise((r) => setTimeout(r, 500));
  const sw = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  if (sw[0] > sw[1]) errors.push(tag + ": horizontal scroll " + sw.join(">"));
  await p.screenshot({ path: path.join(here, "out", `report-${target}-${tag}.png`), fullPage: true });
  const summary = await p.evaluate(() => ({ title: document.querySelector(".rep-title h2")?.textContent, fixes: document.querySelectorAll(".fix").length, canv: document.querySelectorAll(".fix canvas").length, cats: document.querySelectorAll("details.cat").length, passed: document.querySelectorAll(".pass").length }));
  console.log(tag, JSON.stringify(summary));
  await p.close();
}
await b.close(); fx.close(); dev.close();
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no page errors");
