// Transactional email through Brevo's API (free plan: 300 emails a day).
export const outbox = []; // tests only
export async function sendMail({ to, subject, html, text }) {
  if (process.env.HS_LOCAL_MAIL === "1") { outbox.push({ to, subject, text }); return; }
  const key = Netlify.env.get("BREVO_API_KEY");
  if (!key) throw new Error("mail-not-configured");
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { name: "HindSited", email: Netlify.env.get("MAIL_FROM") || "thelazycreatorco@gmail.com" },
      to: [{ email: to }], subject, htmlContent: html, textContent: text,
      tags: ["hindsited-signin"]
    }),
    signal: AbortSignal.timeout(10000)
  });
  if (!res.ok) throw new Error("mail-failed " + res.status + " " + (await res.text()).slice(0, 200));
}
