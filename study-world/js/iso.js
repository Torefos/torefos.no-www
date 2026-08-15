// Isometrisk tegneverktøy: projeksjon, farger og enkle 3D-primitiver.

export const TW = 64; // flisebredde på skjerm
export const TH = 32; // flisehøyde på skjerm
export const TZ = 34; // én høydeenhet i piksler

export function iso(x, y, z = 0) {
  return { x: (x - y) * (TW / 2), y: (x + y) * (TH / 2) - z * TZ };
}

/* ---------- farge ---------- */

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (v, a = 0, b = 255) => Math.max(a, Math.min(b, v));

/** amt > 1 lysner, < 1 mørkner. */
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${clamp(Math.round(r * amt))},${clamp(Math.round(g * amt))},${clamp(Math.round(b * amt))})`;
}

export function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/* ---------- primitiver ---------- */

function poly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

/** Flat flis (w × d) på høyde z. */
export function tile(ctx, x, y, z, w, d, color, stroke) {
  poly(ctx, [iso(x, y, z), iso(x + w, y, z), iso(x + w, y + d, z), iso(x, y + d, z)], color, stroke);
}

/**
 * Isometrisk boks. Tegner topp + de to synlige sideflatene.
 * opts: { top, left, right } overstyrer enkeltflater, { flat:true } dropper sidene.
 */
export function box(ctx, x, y, z, w, d, h, color, opts = {}) {
  const topC = opts.top || shade(color, 1.0);
  const leftC = opts.left || shade(color, 0.8);
  const rightC = opts.right || shade(color, 0.62);

  if (h > 0 && !opts.flat) {
    // venstre flate (y + d), vender ned-venstre på skjermen
    poly(ctx, [iso(x, y + d, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x, y + d, z)], leftC);
    // høyre flate (x + w)
    poly(ctx, [iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x + w, y + d, z), iso(x + w, y, z)], rightC);
  }
  poly(ctx, [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y + d, z + h), iso(x, y + d, z + h)], topC);
}

/** Loddrett flate langs x-aksen (en vegg som vender mot betrakteren fra nord). */
export function wallX(ctx, x, y, z, w, h, color) {
  poly(ctx, [iso(x, y, z + h), iso(x + w, y, z + h), iso(x + w, y, z), iso(x, y, z)], color);
}

/** Loddrett flate langs y-aksen. */
export function wallY(ctx, x, y, z, d, h, color) {
  poly(ctx, [iso(x, y, z + h), iso(x, y + d, z + h), iso(x, y + d, z), iso(x, y, z)], color);
}

/** Myk skygge på bakken under et objekt. */
export function shadow(ctx, x, y, z, rx = 0.45, ry = 0.45, alpha = 0.3) {
  const p = iso(x, y, z);
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rx * TW);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, (ry * TH) / (rx * TW));
  ctx.beginPath();
  ctx.arc(0, 0, rx * TW, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** Sylinder stående i z (krus, stolpe, trestamme). */
export function cyl(ctx, x, y, z, r, h, color) {
  const b = iso(x, y, z);
  const t = iso(x, y, z + h);
  const rx = r * (TW / 2);
  const ry = r * (TH / 2);
  ctx.fillStyle = shade(color, 0.7);
  ctx.beginPath();
  ctx.moveTo(b.x - rx, b.y);
  ctx.lineTo(t.x - rx, t.y);
  ctx.ellipse(t.x, t.y, rx, ry, 0, Math.PI, 0, true);
  ctx.lineTo(b.x + rx, b.y);
  ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI, false);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = shade(color, 1.05);
  ctx.beginPath();
  ctx.ellipse(t.x, t.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Rundet rektangel i skjermkoordinater. */
export function rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Deterministisk «tilfeldig» tall — samme frø gir samme verden hver gang. */
export function rand(seed) {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
