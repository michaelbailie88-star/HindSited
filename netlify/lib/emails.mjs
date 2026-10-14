// Shared look for HindSited's account emails.
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FOOT = "HindSited by The Lazy Creator Company · Guelph, ON, Canada · thelazycreatorco@gmail.com";

export function layout({ heading, paras = [], button, after = [] }) {
  const p = (t) => `<p style="font-size:16px;line-height:1.55;margin:0 0 14px">${t}</p>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#14161b">
    <p style="font-size:20px;font-weight:800;margin:0 0 18px">Hind<span style="color:#e5461d">Sited</span></p>
    <p style="font-size:20px;font-weight:800;margin:0 0 12px">${esc(heading)}</p>
    ${paras.map(p).join("")}
    ${button ? `<p style="margin:22px 0"><a href="${esc(button.href)}" style="background:#e5461d;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;display:inline-block">${esc(button.label)}</a></p>` : ""}
    ${after.map((t) => `<p style="font-size:13px;line-height:1.5;color:#676b74;margin:0 0 8px">${t}</p>`).join("")}
    <p style="font-size:12px;color:#8a8e96;border-top:1px solid #e5e0d6;padding-top:12px;margin-top:22px">${FOOT}</p>
  </div>`;
  const strip = (t) => String(t).replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const text = [heading, "", ...paras.map(strip), button ? `${button.label}: ${button.href}` : "", "", ...after.map(strip), "", FOOT].join("\n");
  return { html, text };
}
