// Launches Chromium: the serverless build in production, a local binary in tests.
import puppeteer from "puppeteer-core";

const PACK = "https://github.com/Sparticuz/chromium/releases/download/v153.0.0/chromium-v153.0.0-pack.x64.tar";

export async function launchBrowser() {
  if (process.env.HS_LOCAL_CHROME) {
    return puppeteer.launch({ executablePath: process.env.HS_LOCAL_CHROME, headless: true, protocolTimeout: 40000, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  }
  const { default: chromium } = await import("@sparticuz/chromium-min");
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(PACK),
    headless: "shell",
    protocolTimeout: 40000,
    defaultViewport: { width: 390, height: 844 }
  });
}
