// Døgnlys: himmelfarger, sol/måne og en fargetone som legges over hele verden.

import { mix, rand } from './iso.js';

// Nøkkelbilder gjennom døgnet. h = time (0–24).
const KEYS = [
  { h: 0,    top: '#0a1030', bot: '#1d2a52', key: '#6f8fd8', amb: '#2a3559', tint: '#122046', tintA: 0.42, stars: 1.0 },
  { h: 4.5,  top: '#101a44', bot: '#3a3a66', key: '#8f9ada', amb: '#3b4368', tint: '#1a2550', tintA: 0.36, stars: 0.75 },
  { h: 6,    top: '#2b3a72', bot: '#e08a62', key: '#ffb27a', amb: '#6d5f7a', tint: '#5b3f57', tintA: 0.26, stars: 0.18 },
  { h: 7.5,  top: '#5f9ad6', bot: '#ffd9a8', key: '#ffd9a0', amb: '#93a4b8', tint: '#f0c48c', tintA: 0.13, stars: 0 },
  { h: 10,   top: '#4d92dd', bot: '#bfe2f5', key: '#fff3d6', amb: '#b9cfe2', tint: '#cfe6ff', tintA: 0.06, stars: 0 },
  { h: 13,   top: '#3f86dd', bot: '#cdeaf8', key: '#fffaf0', amb: '#c6dbec', tint: '#dff0ff', tintA: 0.04, stars: 0 },
  { h: 16,   top: '#4b8fd2', bot: '#f2dcb4', key: '#ffe6b4', amb: '#bcc7cf', tint: '#f7dfb4', tintA: 0.10, stars: 0 },
  { h: 18.5, top: '#3b5f9e', bot: '#f0a06a', key: '#ffb877', amb: '#8f7f8c', tint: '#e89a68', tintA: 0.20, stars: 0 },
  { h: 20.5, top: '#22285e', bot: '#a05a72', key: '#c98ba8', amb: '#4e4a72', tint: '#6a3f66', tintA: 0.32, stars: 0.35 },
  { h: 22,   top: '#111842', bot: '#2b3260', key: '#8090cf', amb: '#333c62', tint: '#1a2450', tintA: 0.40, stars: 0.85 },
  { h: 24,   top: '#0a1030', bot: '#1d2a52', key: '#6f8fd8', amb: '#2a3559', tint: '#122046', tintA: 0.42, stars: 1.0 },
];

export function light(minutes) {
  const h = (((minutes / 60) % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (h - a.h) / (b.h - a.h);
  return {
    hour: h,
    top: mix(a.top, b.top, t),
    bot: mix(a.bot, b.bot, t),
    key: mix(a.key, b.key, t),
    amb: mix(a.amb, b.amb, t),
    tint: mix(a.tint, b.tint, t),
    tintA: a.tintA + (b.tintA - a.tintA) * t,
    stars: a.stars + (b.stars - a.stars) * t,
    // hvor sterkt innelys/lamper skal lyse
    lampGlow: Math.max(0, Math.min(1, (a.tintA + (b.tintA - a.tintA) * t - 0.08) / 0.3)),
  };
}

/** Himmel i skjermkoordinater — tegnes før dioramaet. */
export function drawSky(ctx, w, h, lt, t) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, lt.top);
  g.addColorStop(0.62, lt.bot);
  g.addColorStop(1, mix(lt.bot, '#2a2333', 0.35));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // stjerner
  if (lt.stars > 0.01) {
    ctx.save();
    for (let i = 0; i < 130; i++) {
      const x = rand(i * 2.1) * w;
      const y = rand(i * 3.7 + 9) * h * 0.62;
      const tw = 0.45 + 0.55 * Math.sin(t * 1.6 + i);
      ctx.globalAlpha = lt.stars * tw * (0.35 + rand(i * 5.3) * 0.65);
      ctx.fillStyle = '#fff';
      ctx.fillRect(x, y, 1.6, 1.6);
    }
    ctx.restore();
  }

  // sol eller måne
  const dayT = ((lt.hour - 5) / 15); // 5 → oppgang, 20 → nedgang
  const isDay = dayT > -0.05 && dayT < 1.05;
  const arcT = isDay ? dayT : ((lt.hour + 24 - 20) % 24) / 9;
  const cx = w * (0.12 + arcT * 0.76);
  const cy = h * (0.66 - Math.sin(Math.max(0, Math.min(1, arcT)) * Math.PI) * 0.52);
  const r = isDay ? 26 : 18;

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 7);
  glow.addColorStop(0, isDay ? 'rgba(255,244,214,0.55)' : 'rgba(200,215,255,0.30)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(cx - r * 7, cy - r * 7, r * 14, r * 14);

  ctx.fillStyle = isDay ? '#fff6dd' : '#eef2ff';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  if (!isDay) {
    ctx.fillStyle = 'rgba(190,200,225,0.5)';
    for (const [dx, dy, dr] of [[-0.34, -0.18, 0.26], [0.22, 0.3, 0.19], [0.34, -0.34, 0.13]]) {
      ctx.beginPath();
      ctx.arc(cx + r * dx, cy + r * dy, r * dr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // skyer — myke, lette bånd
  ctx.save();
  ctx.globalAlpha = 0.34 - lt.stars * 0.22;
  for (let i = 0; i < 6; i++) {
    const sp = 0.004 + rand(i * 11) * 0.008;
    const cxp = ((rand(i * 7.7) * 1.7 + t * sp) % 1.7 - 0.35) * w;
    const cyp = h * (0.05 + rand(i * 3.3) * 0.32);
    const sc = 0.7 + rand(i * 5.1) * 1.2;
    const g2 = ctx.createLinearGradient(0, cyp - 26 * sc, 0, cyp + 22 * sc);
    g2.addColorStop(0, mix('#ffffff', lt.bot, 0.12));
    g2.addColorStop(1, mix('#ffffff', lt.bot, 0.62));
    ctx.fillStyle = g2;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      ctx.ellipse(cxp + k * 40 * sc, cyp + Math.sin(k * 1.7 + i) * 6 * sc,
        52 * sc * (1 - Math.abs(k - 2) * 0.2), 13 * sc * (1 - Math.abs(k - 2) * 0.12), 0, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

/** Fargetone + vignett over det ferdige bildet. */
export function drawGrade(ctx, w, h, lt, opts) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = lt.tintA * 0.68;
  ctx.fillStyle = lt.tint;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = lt.key;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  if (opts.vignette) {
    const g = ctx.createRadialGradient(w / 2, h * 0.48, Math.min(w, h) * 0.34, w / 2, h * 0.5, Math.max(w, h) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
}
