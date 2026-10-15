// What the customer sees after a build payment link (or the card page).
const q = new URLSearchParams(location.search);
const k = q.get("k") || "";
const already = q.get("already") === "1";
const M = {
  deposit: ["Deposit received", already ? "This deposit is already paid. Thank you!" : "Thank you! Your 50% deposit is in, and Michael is starting your new website.", ["You'll get an email receipt from Stripe and a confirmation from Michael.", "Your new site is usually ready in 1 to 2 weeks. Your current site stays up the whole time.", "When it's ready, you'll get a preview link and the final payment link by email."]],
  launch: ["You're all set", already ? "This payment is already done. Thank you!" : "Thank you! Your final payment and first month of hosting are in.", ["Michael will email you the two settings to change in your domain account so your web address points to your new site.", "From now on, $25 CAD is charged to the same card once a month for hosting and updates.", "For a small change to your site, just reply to any of Michael's emails."]],
  card: ["Card details saved", "Your hosting billing is up to date with whatever you changed.", ["If a payment was waiting, Stripe charges the new card automatically.", "You can open the same link again any time to change your card or see invoices."]],
  cancelled: ["No payment was made", "You left the payment page before paying, so nothing was charged.", ["Use the same link from your email whenever you're ready. It doesn't expire."]],
  needdeposit: ["The deposit comes first", "This link is for the final payment, but the 50% deposit hasn't been paid yet.", ["Use the deposit link in your first email from Michael, or reply to it and he'll resend it."]],
  nohosting: ["Hosting hasn't started yet", "There's no hosting to update yet. It starts when the final payment is made.", []],
  pending: ["Payment still processing", "Stripe hasn't confirmed this payment yet. Some banks take a few minutes.", ["You'll get an email receipt from Stripe once it's through. Nothing else is needed from you."]],
  error: ["Something went wrong", "We couldn't open the payment page. Nothing was charged.", ["Try the link again in a minute, or reply to Michael's email and he'll sort it out."]],
  bad: ["This link isn't valid", "It may have been copied incompletely. Nothing was charged.", ["Use the button in your email from Michael, or reply to it for a new link."]]
};
const [h, lead, list] = M[k] || M.bad;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
document.title = h + " | HindSited";
document.getElementById("paid").innerHTML = `<p class="eyebrow">Your new website</p><h1 class="legal-h">${esc(h)}</h1><p class="lede-s">${esc(lead)}</p>
  ${list.length ? `<h2>What happens next</h2><ul>${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  <p>How payments, hosting and your web address work: <a href="/help#new-site">Help: your new website</a>. Questions? Email <a href="mailto:thelazycreatorco@gmail.com">thelazycreatorco@gmail.com</a>.</p>`;
