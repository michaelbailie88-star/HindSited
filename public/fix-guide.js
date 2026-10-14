// "Start your new website": where to recover a domain account. Links go to
// each registrar's own help home.
export const STUDIO_EMAIL = "thelazycreatorco@gmail.com";

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

// what the new site needs to do (shown as tick boxes)
export const WANTS = ["Get calls and quote requests", "Online booking", "Show my Google reviews", "Photo gallery or portfolio", "Sell products online", "Menu or price list"];
