// Shared test steps for the password accounts.
export const PW = "Correct-horse-9";
let ipN = 10;
// each page gets its own pretend internet connection (for the free-scan daily limit)
export async function freshIp(page) { await page.setExtraHTTPHeaders({ "x-test-ip": "10.0.0." + ipN++ }); }

export async function signUp(page, base, { email, name = "Test Owner", business = "Test Business", website = "", password = PW, next = "" } = {}) {
  await page.goto(base + "/account?mode=signup" + (next ? "&next=" + encodeURIComponent(next) : ""));
  await page.waitForSelector('.auth-form input[name="business"]');
  await page.type('.auth-form input[name="name"]', name);
  await page.type('.auth-form input[name="business"]', business);
  if (website) await page.type('.auth-form input[name="website"]', website);
  await page.type('.auth-form input[name="email"]', email);
  await page.type('.auth-form input[name="password"]', password);
  await Promise.all([page.waitForNavigation(), page.click(".auth-go")]);
}
export async function signIn(page, base, { email, password = PW, next = "" } = {}) {
  await page.goto(base + "/account" + (next ? "?next=" + encodeURIComponent(next) : ""));
  await page.waitForSelector('.auth-form input[name="email"]');
  await page.type('.auth-form input[name="email"]', email);
  await page.type('.auth-form input[name="password"]', password);
  await Promise.all([page.waitForNavigation(), page.click(".auth-go")]);
}
export async function signOut(page) {
  await page.waitForSelector("#acctBtn");
  await page.click("#acctBtn");
  await page.waitForSelector("#acctPop:not([hidden]) #signOut");
  await Promise.all([page.waitForNavigation(), page.click("#signOut")]);
  await page.waitForSelector("#acct .acct-signin");
}
// create an account straight through the API (for tests that only need a session)
export async function apiSignUp(base, email, extra = {}) {
  const r = await fetch(base + "/api/auth/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Api User", business: "Api Biz", email, password: PW, ...extra }) });
  return { status: r.status, cookie: (r.headers.get("set-cookie") || "").split(";")[0], data: await r.json() };
}
