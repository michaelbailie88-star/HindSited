// Platform-by-platform steps for the "Get your website ready to be fixed"
// guide. Invite steps follow each platform's official help (checked Oct 2026);
// links go to pages we confirmed exist or to the platform's help home.
export const STUDIO_EMAIL = "thelazycreatorco@gmail.com";

export const PLATFORMS = {
  Wix: {
    login: "https://www.wix.com",
    findIt: "Emails from Wix, or a Wix charge on your bank or card statement.",
    forgot: ["Go to the Wix log-in page and enter your email, then click Continue with Email.", "Click Forgot Password?, enter your email and click Send.", "Open the email from Wix (check spam) and set a new password."],
    forgotEmail: "Forgot which email you used? On the Wix log-in page click Forgot Email?, choose I forgot my login email, and enter your website address. Wix texts the email to your recovery phone, or asks for a photo of your ID if there isn't one.",
    recoverHelp: "https://support.wix.com/en/article/recovering-your-wix-account",
    owner: "Wix treats whoever's email is the account's login email as the owner. If a past designer's email owns it, ask them to transfer it to you. Wix can't hand it over for them.",
    ownerHelp: "https://support.wix.com/en/article/wix-account-and-site-ownership-disputes",
    invite: ["Open your site's dashboard and go to Settings, then Roles & Permissions.", "Click Invite Collaborators.", `In Emails, type ${STUDIO_EMAIL}.`, "Tick the Website Manager role (it can edit and publish your site, but can't touch billing or delete it).", "Click Send Invites."],
    note: "Your site includes one free collaborator seat. You can remove access any time from the same page.",
    inviteHelp: "https://support.wix.com/en/article/inviting-people-to-contribute-to-your-site"
  },
  Squarespace: {
    login: "https://www.squarespace.com",
    findIt: "Emails from Squarespace, or a Squarespace charge on your bank or card statement.",
    forgot: ["Go to the Squarespace log-in page and click Forgot password?", "Enter the email you think you used and follow the link in the email (check spam)."],
    recoverHelp: "https://support.squarespace.com/hc/en-us",
    owner: "If a past designer set the site up under their own login, ask them to transfer ownership to you, or contact Squarespace support with proof you own the business.",
    invite: ["Log in and open your site's Dashboard.", "Click the three dots (or Settings in the left menu) and choose Permissions.", "Click Invite Contributor.", `Enter the name The Lazy Creator Company and the email ${STUDIO_EMAIL}.`, "Turn on Administrator, then click Invite."],
    note: "Administrator can do everything except transfer ownership. Some Squarespace plans limit custom code, so we'll tell you if a plan change is needed before doing anything.",
    inviteHelp: "https://support.squarespace.com/hc/en-us"
  },
  Shopify: {
    login: "https://www.shopify.com",
    findIt: "Emails from Shopify, or a Shopify charge on your bank or card statement.",
    forgot: ["Go to the Shopify log-in page, enter your email and click Continue.", "Click Forgot password? and follow the link in the email (check spam)."],
    recoverHelp: "https://help.shopify.com",
    owner: "If the store is under someone else's login, the store owner can transfer it to you from Settings, then Users.",
    invite: ["In your Shopify admin, go to Settings, then Users.", "Click Users & permissions (or Users if your store is part of an organization), then Security.", "Click the 4-digit collaborator request code to copy it.", "Paste the code below. We use it to send you an access request.", "When the request arrives (you'll get an email), go to Settings, then Users, open the request and click Accept request."],
    needsCode: true,
    note: "Collaborator access lets us work on your store without using your password, and you choose exactly what we can see.",
    inviteHelp: "https://help.shopify.com/manual/your-account/staff-accounts/collaborator-accounts"
  },
  WordPress: {
    login: "",
    findIt: "Most WordPress sites log in at your-website-address/wp-admin. Also check emails from your web host (GoDaddy, Bluehost, HostGator, SiteGround, WordPress.com) or a hosting charge on your statement.",
    forgot: ["Go to your website's address followed by /wp-login.php (for example yourbusiness.com/wp-login.php).", "Click Lost your password?, enter your email and follow the link (check spam).", "If your site is on WordPress.com, log in at wordpress.com instead and use Lost your password?"],
    recoverHelp: "https://wordpress.org/documentation/",
    owner: "If nobody can log in, your web host can reset access for the account holder. Find your host in your billing emails.",
    invite: ["Log in to your WordPress dashboard (yourbusiness.com/wp-admin).", "Go to Users, then Add New User (on WordPress.com: Users, then Add a user or Invite).", `Enter the email ${STUDIO_EMAIL} and a username like lazycreator.`, "Set the Role to Administrator.", "Click Add New User (or Invite)."],
    note: "You can delete the user any time from Users once the work is done.",
    inviteHelp: "https://wordpress.org/documentation/"
  },
  Webflow: {
    login: "https://webflow.com",
    findIt: "Emails from Webflow, or a Webflow charge on your bank or card statement.",
    forgot: ["Go to the Webflow log-in page, click Forgot password? and follow the link in the email (check spam)."],
    recoverHelp: "https://help.webflow.com/",
    owner: "Webflow sites often live in the designer's Workspace. If so, ask them to transfer the site to your own Workspace.",
    invite: ["Open your site in Webflow.", "Click Share in the top bar.", `Enter ${STUDIO_EMAIL}.`, "Choose the Designer role (Webflow may ask you to buy a seat for this).", "Click Invite (or Pay & invite)."],
    note: "Webflow's free content-editor role can't add new features like a quote calculator, which is why the Designer role is needed. We'll let you know if a cheaper option works for your fixes.",
    inviteHelp: "https://help.webflow.com/hc/en-us/articles/33961254829843"
  },
  GoDaddy: {
    login: "https://www.godaddy.com",
    findIt: "Emails or receipts from GoDaddy, or a GoDaddy charge on your bank or card statement.",
    forgot: ["Go to the GoDaddy sign-in page and click Forgot password? (or Need to find your username or customer number?).", "Follow the email or text GoDaddy sends you."],
    recoverHelp: "https://www.godaddy.com/help",
    owner: "If your site is under someone else's GoDaddy account, ask them to move it to yours, or contact GoDaddy support with proof you own the business.",
    invite: ["Go to account.godaddy.com/access (GoDaddy's Delegate Access page) and sign in.", "Under People who can access my account, click Invite to Access.", `Enter the name The Lazy Creator Company and the email ${STUDIO_EMAIL}.`, "Choose the access level that lets a delegate work on your products (your website).", "Click Invite."],
    note: "Delegates can't see or change your payment methods or password, and you can remove access any time.",
    inviteHelp: "https://www.godaddy.com/help/allow-delegates-to-access-and-work-on-my-websites-marketing-site-42554"
  },
  "Square Online": {
    login: "https://squareup.com",
    findIt: "Emails from Square or Weebly, or a Square/Weebly charge on your statement. Older Weebly sites are now managed in Square.",
    forgot: ["Go to the Square sign-in page, click Forgot password? and follow the email (check spam)."],
    recoverHelp: "https://squareup.com/help",
    owner: "If the account is in someone else's name, ask them to add you, or contact Square support with proof you own the business.",
    invite: ["Sign in to your Square Dashboard.", "Go to Staff (Team), then Team members, and click Add team member.", `Enter the name The Lazy Creator Company and the email ${STUDIO_EMAIL}.`, "Give them a permission set that can edit your Online Store (for example Full Access).", "Save, which sends the invite."],
    note: "Square doesn't have a website-only permission yet, so this person can see your Dashboard. Remove them as soon as the work is done.",
    inviteHelp: "https://squareup.com/help"
  },
  Other: {
    login: "",
    findIt: "Look for emails or receipts from whoever built or hosts your website, or a monthly website charge on your bank or card statement. The company charging you is where your site lives.",
    forgot: ["Use the Forgot password link on that company's log-in page with every email your business has used.", "If a person built it by hand, ask them for access, or for the name of your hosting company."],
    recoverHelp: "",
    owner: "If you can't reach the person who built it, your domain is the key (see below): whoever controls the domain controls where your website points.",
    invite: [`Invite ${STUDIO_EMAIL} as an administrator or editor from your website's settings (often called Users, Team, Permissions or Collaborators).`, "If your site has no way to add people, choose I'm stuck below and we'll work out the safest way together."],
    note: "",
    inviteHelp: ""
  }
};
PLATFORMS.Weebly = PLATFORMS["Square Online"];
export const PLATFORM_CHOICES = ["Wix", "Squarespace", "Shopify", "WordPress", "Webflow", "GoDaddy", "Square Online", "Other"];

// registrar -> where to recover a domain account
export const REGISTRARS = [
  { match: /godaddy/i, name: "GoDaddy", url: "https://www.godaddy.com/help" },
  { match: /namecheap/i, name: "Namecheap", url: "https://www.namecheap.com/support/" },
  { match: /squarespace|google/i, name: "Squarespace Domains", url: "https://support.squarespace.com/hc/en-us" },
  { match: /wix/i, name: "Wix", url: "https://support.wix.com/en/article/recovering-your-wix-account" },
  { match: /tucows|hover/i, name: "Hover", url: "https://help.hover.com" },
  { match: /network solutions/i, name: "Network Solutions", url: "https://www.networksolutions.com" },
  { match: /ionos|1&1/i, name: "IONOS", url: "https://www.ionos.com/help/" },
  { match: /cloudflare/i, name: "Cloudflare", url: "https://www.cloudflare.com" },
  { match: /web\.com|register\.com/i, name: "Web.com", url: "https://www.web.com" }
];
export function registrarHelp(name) { const r = REGISTRARS.find((x) => x.match.test(name || "")); return r || null; }
export function platformKey(p) { if (!p) return null; if (/squarespace/i.test(p)) return "Squarespace"; if (/weebly|square\s*online|^square$/i.test(p)) return "Square Online"; return PLATFORMS[p] ? p : null; }
