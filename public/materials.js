// Printable review materials, drawn as SVG at real print sizes (72 units per
// inch). Uses the bundled QR library (window.qrcode).

const PT = 72;
const escX = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

export function qr(text) {
  const q = window.qrcode(0, "M");
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
  return { n, d };
}
// QR placed at x,y with side s (with a white quiet zone)
function qrAt(code, x, y, s) {
  const q = 2, scale = s / (code.n + q * 2);
  return `<g transform="translate(${x} ${y})"><rect width="${s}" height="${s}" fill="#fff"/><path transform="scale(${scale}) translate(${q} ${q})" d="${code.d}" fill="#111"/></g>`;
}
function stars(x, y, size, color) {
  const pts = (cx, cy, r) => Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`; }).join(" ");
  return Array.from({ length: 5 }, (_, i) => `<polygon points="${pts(x + i * size * 1.15 + size / 2, y + size / 2, size / 2)}" fill="${color}"/>`).join("");
}
function brandTop(k, x, y, w, h, onColor) {
  if (k.logo) return `<image href="${k.logo}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`;
  const size = Math.min(h * 0.7, (w / Math.max(6, k.name.length)) * 1.7);
  return `<text x="${x + w / 2}" y="${y + h / 2 + size * 0.35}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${size.toFixed(1)}" fill="${onColor}">${escX(k.name)}</text>`;
}
const T = (x, y, size, txt, opts = {}) => `<text x="${x}" y="${y}" ${opts.anchor ? `text-anchor="${opts.anchor}"` : 'text-anchor="middle"'} font-family="Arial, Helvetica, sans-serif" font-weight="${opts.weight || 400}" font-size="${size}" fill="${opts.fill || "#14161b"}">${escX(txt)}</text>`;

// ---- single pieces
function counterCard(k, code) {
  const W = 4 * PT, H = 6 * PT;
  return { w: 4, h: 6, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#fff"/><rect width="${W}" height="${1.25 * PT}" fill="${k.color}"/>
    <rect x="${0.3 * PT}" y="${0.2 * PT}" width="${W - 0.6 * PT}" height="${0.85 * PT}" rx="8" fill="${k.logo ? "#fff" : "none"}"/>
    ${brandTop(k, 0.4 * PT, 0.25 * PT, W - 0.8 * PT, 0.75 * PT, k.logo ? "#14161b" : "#fff")}
    ${T(W / 2, 1.85 * PT, 25, "Happy with us?", { weight: 700 })}
    ${T(W / 2, 2.2 * PT, 13.5, "Scan to leave a quick Google review")}
    ${stars(W / 2 - 1.15 * 0.28 * PT * 2.5 + 0.02 * PT, 2.36 * PT, 0.28 * PT, k.color)}
    ${qrAt(code, (W - 2.3 * PT) / 2, 2.8 * PT, 2.3 * PT)}
    ${T(W / 2, 5.45 * PT, 11.5, "Takes about 30 seconds. Thank you!", { fill: "#3a3e47" })}
    <rect x="${0.75}" y="${0.75}" width="${W - 1.5}" height="${H - 1.5}" fill="none" stroke="#d9d3c6" stroke-width="1.5"/>
  </svg>` };
}
function tentPanel(k, code, W, H) {
  return `<rect width="${W}" height="${H}" fill="#fff"/><rect width="${0.35 * PT}" height="${H}" fill="${k.color}"/>
    <g>${k.logo ? `<image href="${k.logo}" x="${0.8 * PT}" y="${0.55 * PT}" width="${4.8 * PT}" height="${0.9 * PT}" preserveAspectRatio="xMinYMid meet"/>` : T(0.8 * PT, 1.15 * PT, 26, k.name, { anchor: "start", weight: 700, fill: k.color })}</g>
    ${T(0.8 * PT, 2.05 * PT, 34, "Enjoying your visit?", { anchor: "start", weight: 700 })}
    ${T(0.8 * PT, 2.55 * PT, 18, "Scan the code to leave us a Google review.", { anchor: "start" })}
    ${stars(0.8 * PT, 2.85 * PT, 0.32 * PT, k.color)}
    ${T(0.8 * PT, 3.75 * PT, 13, "It takes 30 seconds and helps a local business. Thank you!", { anchor: "start", fill: "#3a3e47" })}
    ${qrAt(code, W - 3.6 * PT, (H - 3.0 * PT) / 2, 3.0 * PT)}`;
}
function tableTent(k, code) {
  const W = 11 * PT, H = 8.5 * PT, half = H / 2;
  return { w: 11, h: 8.5, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <g transform="rotate(180 ${W / 2} ${half / 2})">${tentPanel(k, code, W, half)}</g>
    <g transform="translate(0 ${half})">${tentPanel(k, code, W, half)}</g>
    <line x1="0" y1="${half}" x2="${W}" y2="${half}" stroke="#bbb" stroke-dasharray="6 6"/>
    ${T(W / 2, half - 6, 8, "fold here", { fill: "#999" })}
  </svg>` };
}
function sticker(k, code, S) {
  return `<rect width="${S}" height="${S}" rx="${0.18 * PT}" fill="#fff" stroke="${k.color}" stroke-width="2"/>
    ${T(S / 2, 0.3 * PT, 10.5, "Review us on Google", { weight: 700, fill: k.color })}
    ${qrAt(code, (S - 1.3 * PT) / 2, 0.4 * PT, 1.3 * PT)}
    ${T(S / 2, 1.88 * PT, 8.5, k.name.length > 26 ? k.name.slice(0, 25) + "…" : k.name, { fill: "#3a3e47" })}`;
}
function stickerSheet(k, code) {
  const W = 8.5 * PT, H = 11 * PT, S = 2 * PT, cols = 3, rows = 4;
  const gx = (W - cols * S) / (cols + 1), gy = (H - rows * S) / (rows + 1);
  let out = "";
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out += `<g transform="translate(${gx + c * (S + gx)} ${gy + r * (S + gy)})">${sticker(k, code, S)}</g>`;
  return { w: 8.5, h: 11, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${out}</svg>` };
}
function cardBack(k, code, W, H) {
  return `<rect width="${W}" height="${H}" fill="#fff" stroke="#ccc" stroke-width=".5" stroke-dasharray="3 3"/>
    <rect width="${0.12 * PT}" height="${H}" fill="${k.color}"/>
    ${T(0.3 * PT, 0.55 * PT, 13, "Enjoyed working", { anchor: "start", weight: 700 })}
    ${T(0.3 * PT, 0.78 * PT, 13, "with us?", { anchor: "start", weight: 700 })}
    ${T(0.3 * PT, 1.12 * PT, 9, "Scan to leave a", { anchor: "start", fill: "#3a3e47" })}
    ${T(0.3 * PT, 1.28 * PT, 9, "quick Google review.", { anchor: "start", fill: "#3a3e47" })}
    ${stars(0.3 * PT, 1.45 * PT, 0.17 * PT, k.color)}
    ${qrAt(code, W - 1.55 * PT, (H - 1.45 * PT) / 2, 1.45 * PT)}`;
}
function cardSheet(k, code) {
  const W = 8.5 * PT, H = 11 * PT, cw = 3.5 * PT, ch = 2 * PT, mx = 0.75 * PT, my = 0.5 * PT;
  let out = "";
  for (let r = 0; r < 5; r++) for (let c = 0; c < 2; c++) out += `<g transform="translate(${mx + c * cw} ${my + r * ch})">${cardBack(k, code, cw, ch)}</g>`;
  return { w: 8.5, h: 11, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${out}</svg>` };
}

export const MATERIALS = [
  { id: "counter", name: "Counter card", size: "4 × 6 in", note: "Stand it by the till or front desk.", make: counterCard },
  { id: "tent", name: "Table tent", size: "Letter, fold in half", note: "Print, fold along the line, stand it on tables.", make: tableTent },
  { id: "stickers", name: "Stickers", size: "12 per Letter sheet, 2 × 2 in", note: "For bags, boxes, receipts and invoices.", make: stickerSheet },
  { id: "cards", name: "Business-card backs", size: "10 per Letter sheet", note: "Print on the back of your cards, or on card stock and cut.", make: cardSheet }
];

export function printSvg(m) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escX(m.title || "Review materials")}</title>
    <style>@page{size:${m.w}in ${m.h}in;margin:0}html,body{margin:0;padding:0;background:#fff}svg{width:${m.w}in;height:${m.h}in;display:block}</style></head>
    <body>${m.svg}<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
  w.document.close();
  return true;
}
export function downloadPng(m, filename) {
  return new Promise((resolve) => {
    const dpi = 200, img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.round(m.w * dpi); c.height = Math.round(m.h * dpi);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); resolve(true); }, "image/png");
    };
    img.onerror = () => resolve(false);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(m.svg);
  });
}
