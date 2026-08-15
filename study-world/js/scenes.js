// Dioramaene. Fem små verdener, alle tegnet i samme isometriske rom.
// Tegnerekkefølgen er bakerst → forrest (økende x + y).

import { iso, tile, box, wallX, wallY, shadow, cyl, shade, mix, rgba, rand, TW, TH, TZ } from './iso.js';
import { drawTore, poseCoffee, poseTyping, poseFishing, poseSleeping, drawMug, drawRod } from './character.js';

const CHAR = 1.25;   // Tores målestokk i verdenen
const WALL = 3.7;    // vegghøyde i høydeenheter

/* ================= felles verktøy ================= */

/** Tegn på planet y = konstant (flaten vender skrått ned mot venstre). */
function faceX(ctx, x, y, z) {
  const o = iso(x, y, z);
  ctx.translate(o.x, o.y);
  ctx.transform(TW / 2, TH / 2, 0, -TZ, 0, 0);
}

/** Tegn på planet x = konstant (flaten vender skrått ned mot høyre). */
function faceY(ctx, x, y, z) {
  const o = iso(x, y, z);
  ctx.translate(o.x, o.y);
  ctx.transform(-TW / 2, TH / 2, 0, -TZ, 0, 0);
}

/** Den svevende jordklumpen under dioramaet. */
function base(ctx, W, D, top = '#6b5a48', deep = '#3a2f26') {
  box(ctx, 0, 0, -1.1, W, D, 1.1, top, { top: 'rgba(0,0,0,0)' });

  const drop = 1.1 + (W + D) * 0.30 + 1.1;
  const bl = iso(0, D, -1.1);
  const bm = iso(W, D, -1.1);
  const br = iso(W, 0, -1.1);
  const tip = iso(W * 0.46, D * 0.46, -drop);

  const faces = [[bl, bm, shade(deep, 1.2)], [br, bm, shade(deep, 0.78)]];
  for (const [a, b, col] of faces) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(tip.x, tip.y);
    ctx.closePath(); ctx.fill();
  }

  // steinkanter som bryter opp flatene
  for (let f = 0; f < 2; f++) {
    const [a, b] = faces[f];
    for (let i = 0; i < 5; i++) {
      const k = f * 7 + i;
      let u = rand(k * 3.1) * 0.85;
      let v = rand(k * 7.7) * 0.75;
      if (u + v > 0.9) { u *= 0.6; v *= 0.6; }
      const x = b.x + u * (a.x - b.x) + v * (tip.x - b.x);
      const y = b.y + u * (a.y - b.y) + v * (tip.y - b.y);
      ctx.fillStyle = shade(deep, (f ? 0.62 : 1.4) + rand(k * 5) * 0.22);
      ctx.beginPath();
      ctx.ellipse(x, y, 9 + rand(k) * 10, 5 + rand(k * 5) * 5, rand(k * 9) * 1.2 - 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Gulv, to vegger og listverk. */
function shell(ctx, W, D, pal) {
  base(ctx, W, D, pal.base || '#6b5a48', pal.deep || '#3a2f26');

  wallX(ctx, 0, 0, 0, W, WALL, pal.wallA);
  wallY(ctx, 0, 0, 0, D, WALL, pal.wallB);

  for (let x = 0; x < W; x++) {
    for (let y = 0; y < D; y++) {
      tile(ctx, x, y, 0, 1, 1, (x + y) % 2 === 0 ? pal.floorA : pal.floorB);
    }
  }
  box(ctx, 0, 0, 0, W, 0.12, 0.24, pal.trim);
  box(ctx, 0, 0, 0, 0.12, D, 0.24, pal.trim);
}

/** Vindu i bakveggen (planet y = 0). */
function window0(ctx, x, z, w, h, view) {
  ctx.save();
  faceX(ctx, x, 0.01, z);
  if (view) view(ctx, w, h);
  ctx.strokeStyle = '#f2ece2';
  ctx.lineWidth = 0.1;
  ctx.strokeRect(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
  ctx.moveTo(0, h * 0.52); ctx.lineTo(w, h * 0.52);
  ctx.lineWidth = 0.055;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.13)';
  ctx.beginPath();
  ctx.moveTo(0, h); ctx.lineTo(w * 0.55, h); ctx.lineTo(0, h * 0.18);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function plant(ctx, x, y, z, s = 1, potColor = '#b9704f') {
  cyl(ctx, x, y, z, 0.34 * s, 0.42 * s, potColor);
  const p = iso(x, y, z + 0.42 * s);
  ctx.save();
  ctx.translate(p.x, p.y);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.38;
    const len = (26 + rand(i * 3.3 + x) * 16) * s;
    ctx.fillStyle = i % 2 ? '#3f7d4a' : '#4f9a5b';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.cos(a) * len * 0.6 - 6, Math.sin(a) * len * 0.7, Math.cos(a) * len, Math.sin(a) * len);
    ctx.quadraticCurveTo(Math.cos(a) * len * 0.6 + 6, Math.sin(a) * len * 0.7, 0, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function glow(ctx, x, y, z, r, color, alpha) {
  if (alpha <= 0.001) return;
  const p = iso(x, y, z);
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = g;
  ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  ctx.restore();
}

function place(ctx, x, y, z, rig, t, facing = 1, scale = CHAR) {
  const p = iso(x, y, z);
  shadow(ctx, x, y, z, 0.55, 0.55, 0.3);
  drawTore(ctx, p.x, p.y, { ...rig, facing, scale }, t);
}

/** Skrivebord med plate, bein og stol. Returnerer platehøyden. */
function desk(ctx, x, y, w, d, body, top, legColor) {
  box(ctx, x, y, 0, w, d, 0.95, body);
  box(ctx, x - 0.1, y - 0.08, 0.95, w + 0.2, d + 0.16, 0.1, top);
  box(ctx, x + 0.15, y + 0.2, 0, 0.14, 0.14, 0.95, legColor);
  box(ctx, x + w - 0.29, y + 0.2, 0, 0.14, 0.14, 0.95, legColor);
  return 1.05;
}

function chair(ctx, x, y, seatColor, backColor) {
  box(ctx, x + 0.05, y + 0.05, 0, 0.85, 0.85, 0.68, seatColor);
  box(ctx, x, y, 0.68, 0.13, 0.95, 0.8, backColor);
}

/** Rullende «kode» på en skjerm. */
function codeScreen(ctx, w, h, t, tint = '#7fd8ff', bg = '#101a24') {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  const rows = 11;
  for (let i = 0; i < rows; i++) {
    const y = (i * (h / rows) + (t * 0.05) % (h / rows)) % h;
    const seed = Math.floor(i + t * 0.05 / (h / rows));
    ctx.fillStyle = rgba(i % 4 === 0 ? '#ffd479' : tint, 0.42 + rand(seed * 7.3) * 0.5);
    ctx.fillRect(w * 0.07, y, w * (0.12 + rand(seed * 3.1) * 0.66) * 0.86, h / rows * 0.32);
  }
  ctx.fillStyle = rgba('#ffffff', 0.35 + 0.4 * Math.sin(t * 4));
  ctx.fillRect(w * 0.07, h * 0.5, w * 0.03, h / rows * 0.4);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.beginPath();
  ctx.moveTo(0, h); ctx.lineTo(w * 0.5, h); ctx.lineTo(0, h * 0.3);
  ctx.closePath(); ctx.fill();
}

/** Skjerm som står på et bord og vender mot betrakteren. */
function monitor(ctx, x, y, z, w, h, t, drawContent) {
  box(ctx, x + w * 0.35, y + 0.06, z, w * 0.3, 0.26, 0.08, '#2b3038');
  box(ctx, x + w * 0.45, y + 0.12, z + 0.08, w * 0.1, 0.1, 0.3, '#343a44');
  box(ctx, x, y, z + 0.38, w, 0.12, h, '#1e232b');
  ctx.save();
  faceX(ctx, x + 0.05, y + 0.125, z + 0.44);
  (drawContent || codeScreen)(ctx, w - 0.1, h - 0.12, t);
  ctx.restore();
  glow(ctx, x + w / 2, y + 0.2, z + 0.38 + h / 2, 66, '#7fd8ff', 0.11);
}

/* ================= 1. Soverommet ================= */

export const bedroom = {
  W: 7, D: 7,
  draw(ctx, s) {
    const t = s.t;
    shell(ctx, 7, 7, {
      wallA: '#454a63', wallB: '#3b4056', floorA: '#544437', floorB: '#4d3e33',
      trim: '#333750', base: '#5a4b3c', deep: '#332a22',
    });

    window0(ctx, 4.2, 1.5, 2.0, 1.6, (c, w, h) => {
      const g = c.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, '#243063'); g.addColorStop(1, '#0d1436');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 22; i++) {
        c.fillStyle = `rgba(255,255,255,${0.4 + rand(i * 9.1) * 0.5})`;
        c.fillRect(rand(i * 2.3) * w, rand(i * 5.1) * h * 0.75, 0.045, 0.045);
      }
      c.fillStyle = '#eef2ff';
      c.beginPath(); c.arc(w * 0.7, h * 0.62, 0.2, 0, 6.3); c.fill();
      c.fillStyle = 'rgba(18,24,52,0.92)';
      c.beginPath();
      c.moveTo(0, h * 0.2); c.lineTo(w * 0.3, h * 0.44); c.lineTo(w * 0.55, h * 0.22);
      c.lineTo(w * 0.82, h * 0.42); c.lineTo(w, h * 0.26);
      c.lineTo(w, 0); c.lineTo(0, 0); c.closePath(); c.fill();
    });
    glow(ctx, 4.9, 0.4, 1.9, 200, '#9fb8ff', 0.16);

    tile(ctx, 1.3, 4.4, 0.01, 3.0, 2.0, 'rgba(126,86,74,0.5)');

    // seng
    box(ctx, 0.55, 1.0, 0, 0.3, 2.4, 1.55, '#6b4c34');            // hodegjerde
    box(ctx, 0.85, 1.0, 0, 3.3, 2.4, 0.45, '#7a5739');            // ramme
    box(ctx, 0.87, 1.05, 0.45, 3.26, 2.3, 0.3, '#f4f0e6');        // madrass
    box(ctx, 1.1, 1.25, 0.75, 1.2, 1.9, 0.22, '#eae4d4');         // pute

    // Tore sover
    const p = iso(3.6, 2.2, 0.78);
    shadow(ctx, 2.6, 2.2, 0.78, 0.8, 0.5, 0.14);
    drawTore(ctx, p.x, p.y, { ...poseSleeping(t), rotate: -1.107, scale: CHAR * 0.94 }, t);

    // dyne over underkroppen
    const dz = 0.79;
    const c1 = iso(2.75, 1.05, dz), c2 = iso(4.13, 1.05, dz), c3 = iso(4.13, 3.35, dz), c4 = iso(2.75, 3.35, dz);
    ctx.fillStyle = '#7d93c8';
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(40,50,80,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y); ctx.lineTo(c4.x, c4.y);
    ctx.stroke();

    // Zzz over puta
    ctx.save();
    const hp = iso(1.6, 2.2, 1.5);
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.3 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8;
      ctx.fillStyle = '#e3e9ff';
      ctx.font = `${12 + k * 11}px sans-serif`;
      ctx.fillText('z', hp.x - 4 + k * 26, hp.y - 4 - k * 48);
    }
    ctx.restore();

    // nattbord med lampe
    box(ctx, 5.0, 1.2, 0, 1.0, 1.1, 0.9, '#6b4c34');
    cyl(ctx, 5.5, 1.75, 0.9, 0.16, 0.45, '#c9b48f');
    box(ctx, 5.22, 1.5, 1.35, 0.55, 0.5, 0.42, '#ffd9a0');
    glow(ctx, 5.5, 1.75, 1.6, 190, '#ffbe6a', 0.16 + 0.4 * s.lt.lampGlow);

    plant(ctx, 6.2, 5.4, 0, 1.1);
    box(ctx, 0.6, 5.8, 0, 0.5, 0.9, 0.14, '#8a6a4a');
    box(ctx, 1.2, 5.8, 0, 0.5, 0.9, 0.14, '#8a6a4a');
  },
};

/* ================= 2. Kjøkkenet / morgenkaffen ================= */

export const kitchen = {
  W: 7, D: 7,
  draw(ctx, s) {
    const t = s.t;
    shell(ctx, 7, 7, {
      wallA: '#e7dbc8', wallB: '#ddd0bb', floorA: '#c9a578', floorB: '#c09c6f',
      trim: '#f4eee4', base: '#6b5a48', deep: '#3a2f26',
    });

    window0(ctx, 4.2, 1.6, 2.2, 1.7, (c, w, h) => {
      const g = c.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, '#ffcf94'); g.addColorStop(0.5, '#ffb987'); g.addColorStop(1, '#8fb6e0');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = '#fff4d0';
      c.beginPath(); c.arc(w * 0.34, h * 0.36, 0.24, 0, 6.3); c.fill();
      c.fillStyle = 'rgba(74,96,74,0.6)';
      c.beginPath();
      c.moveTo(0, h * 0.44); c.lineTo(w * 0.35, h * 0.68); c.lineTo(w * 0.62, h * 0.42);
      c.lineTo(w, h * 0.64); c.lineTo(w, 0); c.lineTo(0, 0); c.closePath(); c.fill();
    });
    glow(ctx, 4.9, 0.4, 2.2, 230, '#ffd9a0', 0.2);

    // overskap
    box(ctx, 0.4, 0.15, 2.05, 2.4, 0.7, 1.1, '#f5efe4');
    ctx.save(); faceX(ctx, 0.5, 0.86, 2.15);
    ctx.strokeStyle = 'rgba(130,110,88,0.45)'; ctx.lineWidth = 0.045;
    ctx.strokeRect(0, 0, 1.05, 0.9); ctx.strokeRect(1.15, 0, 1.05, 0.9);
    ctx.restore();

    // kjøkkenbenk
    box(ctx, 0.35, 0.2, 0, 3.6, 1.2, 1.0, '#f1e8d8');
    box(ctx, 0.3, 0.15, 1.0, 3.7, 1.3, 0.1, '#4c4640');
    ctx.save(); faceX(ctx, 0.45, 1.41, 0.1);
    ctx.strokeStyle = 'rgba(150,128,104,0.4)'; ctx.lineWidth = 0.04;
    for (let i = 0; i < 3; i++) ctx.strokeRect(i * 1.12, 0, 1.0, 0.8);
    ctx.restore();

    // kaffemaskin
    box(ctx, 2.55, 0.45, 1.1, 0.75, 0.7, 0.8, '#2f333b');
    box(ctx, 2.62, 0.5, 1.14, 0.6, 0.6, 0.28, '#454b55');
    ctx.save();
    const mp = iso(2.9, 0.8, 1.9);
    ctx.fillStyle = `rgba(255,90,70,${0.5 + 0.5 * Math.sin(t * 2.4)})`;
    ctx.beginPath(); ctx.arc(mp.x + 8, mp.y - 2, 2.1, 0, 6.3); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const o = t * 0.9 + i * 2;
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(o);
      ctx.beginPath();
      ctx.moveTo(mp.x - 4 + i * 5, mp.y - 4);
      ctx.quadraticCurveTo(mp.x - 12 + i * 5 + Math.sin(o) * 5, mp.y - 26, mp.x - 5 + i * 5 + Math.sin(o + 1) * 4, mp.y - 50);
      ctx.stroke();
    }
    ctx.restore();
    glow(ctx, 2.9, 0.8, 1.6, 100, '#ffb066', 0.18 * s.lt.lampGlow);

    // kjøkkenbord
    box(ctx, 4.5, 3.5, 0, 1.9, 1.9, 0.9, '#a9784f');
    box(ctx, 4.4, 3.4, 0.9, 2.1, 2.1, 0.1, '#c99464');
    plant(ctx, 5.45, 4.45, 1.0, 0.55, '#e2d8c8');
    box(ctx, 6.1, 5.2, 0, 0.9, 0.9, 0.95, '#b98a5c'); // krakk

    // Tore med kaffe
    place(ctx, 2.7, 3.4, 0, poseCoffee(t, drawMug), t, 1);

    plant(ctx, 0.7, 5.6, 0, 1.15);
    tile(ctx, 2.9, 5.5, 0.01, 2.2, 1.3, 'rgba(158,126,94,0.4)');
  },
};

/* ================= 3. Kontoret på IKT Agder ================= */

export const office = {
  W: 7, D: 7,
  draw(ctx, s) {
    const t = s.t;
    shell(ctx, 7, 7, {
      wallA: '#dde2ea', wallB: '#d0d7e1', floorA: '#909ba7', floorB: '#8a95a1',
      trim: '#f0f4f9', base: '#5c6470', deep: '#333a44',
    });

    // whiteboard med nettverksskisse
    ctx.save();
    faceY(ctx, 0.02, 2.4, 1.5);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, 3.0, 1.5);
    ctx.strokeStyle = '#c3ccd6'; ctx.lineWidth = 0.05; ctx.strokeRect(0, 0, 3.0, 1.5);
    ctx.strokeStyle = '#3a6ea5'; ctx.lineWidth = 0.045;
    const nodes = [[0.5, 1.1], [1.5, 1.2], [2.5, 1.05], [1.0, 0.5], [2.0, 0.45]];
    for (const [a, b] of [[0, 1], [1, 2], [0, 3], [1, 3], [1, 4], [2, 4], [3, 4]]) {
      ctx.beginPath();
      ctx.moveTo(nodes[a][0], nodes[a][1]);
      ctx.lineTo(nodes[b][0], nodes[b][1]);
      ctx.stroke();
    }
    for (const n of nodes) { ctx.fillStyle = '#3a6ea5'; ctx.fillRect(n[0] - 0.11, n[1] - 0.07, 0.22, 0.14); }
    ctx.fillStyle = '#c0563f';
    ctx.fillRect(0.35, 0.16, 1.5, 0.06);
    ctx.fillRect(0.35, 0.28, 1.05, 0.06);
    ctx.restore();

    window0(ctx, 3.4, 1.6, 2.8, 1.8, (c, w, h) => {
      const g = c.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, '#d6ecf8'); g.addColorStop(1, '#5f9ad6');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(96,118,138,0.45)';
      for (let i = 0; i < 8; i++) {
        c.fillRect(i * 0.35 + 0.05, h * (0.4 + rand(i * 2.7) * 0.22), 0.2 + rand(i * 4.1) * 0.16, h);
      }
      c.fillStyle = 'rgba(126,168,190,0.5)';
      c.fillRect(0, h * 0.76, w, h * 0.24);
    });

    // serverrack
    box(ctx, 0.35, 4.3, 0, 1.0, 1.6, 2.5, '#2a2f36');
    ctx.save();
    faceY(ctx, 1.352, 4.4, 0.14);
    for (let u = 0; u < 11; u++) {
      const y = u * 0.21;
      ctx.fillStyle = '#3a4049';
      ctx.fillRect(0.06, y + 0.02, 1.32, 0.17);
      for (let d = 0; d < 6; d++) {
        const on = Math.sin(t * (2 + d * 0.9 + u) + u * 2.3 + d) > (d % 3 === 0 ? 0.1 : -0.4);
        ctx.fillStyle = on
          ? (d % 4 === 0 ? 'rgba(255,180,70,0.95)' : 'rgba(110,240,160,0.95)')
          : 'rgba(60,70,80,0.9)';
        ctx.fillRect(0.17 + d * 0.15, y + 0.07, 0.075, 0.065);
      }
    }
    ctx.restore();
    glow(ctx, 1.35, 5.1, 1.3, 120, '#5fe0a0', 0.14);

    // pult mot bakveggen
    const top = desk(ctx, 2.7, 0.5, 3.5, 1.8, '#c8cdd4', '#e8ecf1', '#9aa3ad');
    monitor(ctx, 2.95, 0.72, top, 1.35, 0.85, t);
    monitor(ctx, 4.5, 0.72, top, 1.35, 0.85, t, (c, w, h, tt) => {
      c.fillStyle = '#0d1512'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        c.fillStyle = `rgba(120,240,160,${i === 8 ? 0.9 : 0.55})`;
        c.fillRect(0.07, i * (h / 9) + 0.03, w * (0.1 + rand(i + Math.floor(tt * 0.7)) * 0.75), h / 9 * 0.3);
      }
    });
    box(ctx, 3.95, 1.75, top, 0.9, 0.5, 0.05, '#eceff3');   // tastatur
    box(ctx, 5.1, 1.8, top, 0.24, 0.32, 0.07, '#dfe3e8');   // mus
    cyl(ctx, 5.7, 1.5, top, 0.2, 0.3, '#e8e2d6');           // kopp
    tile(ctx, 2.85, 1.5, top + 0.01, 0.55, 0.4, '#fbfaf6'); // papir

    chair(ctx, 3.5, 2.05, '#3a4048', '#434a53');
    place(ctx, 3.95, 2.5, 0, poseTyping(t, 19, 1), t, 1);

    plant(ctx, 6.3, 4.3, 0, 1.2);
    box(ctx, 5.7, 5.5, 0, 1.1, 1.1, 0.7, '#b9bfc7');
    tile(ctx, 2.0, 4.6, 0.01, 2.6, 1.8, 'rgba(74,94,116,0.25)');

    glow(ctx, 3.5, 3.0, 3.0, 300, '#ffffff', 0.08);
  },
};

/* ================= 4. Venneslafjorden ================= */

export const fjord = {
  W: 10, D: 10,
  draw(ctx, s) {
    const t = s.t;
    const W = 10, D = 10;
    base(ctx, W, D, '#4a5a52', '#2b3a38');

    // vannflate
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < D; y++) {
        tile(ctx, x, y, 0, 1.02, 1.02, mix('#2f6f8a', '#17394f', Math.min(1, (x + y) / (W + D) * 0.9 + rand(x * 3 + y * 7) * 0.05)));
      }
    }

    // fjell bak, som en fjern kulisse som toner ut mot vannet
    ctx.save();
    const hz = iso(1.7, 1.7, 0.2);
    ctx.translate(hz.x, hz.y);
    for (let k = 0; k < 2; k++) {
      const g = ctx.createLinearGradient(0, -130, 0, 34);
      g.addColorStop(0, k ? 'rgba(78,100,116,0.62)' : 'rgba(56,76,92,0.72)');
      g.addColorStop(0.72, k ? 'rgba(96,120,136,0.34)' : 'rgba(74,96,114,0.4)');
      g.addColorStop(1, 'rgba(150,175,190,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-330 + k * 30, 34);
      for (let i = 0; i <= 9; i++) {
        const x = -330 + k * 30 + i * 74;
        ctx.lineTo(x - 37, -(34 + rand(i * 3.1 + k * 9) * 68));
        ctx.lineTo(x, -(10 + rand(i * 7.7 + k) * 30));
      }
      ctx.lineTo(350, 34);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // land i det bakre hjørnet
    ctx.save();
    ctx.beginPath();
    const land = [[0, 0], [4.6, 0], [3.8, 1.6], [2.4, 2.4], [1.4, 3.6], [0, 4.4]];
    land.forEach(([x, y], i) => {
      const p = iso(x, y, 0.14);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    });
    ctx.closePath();
    ctx.strokeStyle = '#7d6a4a';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#4f7a45';
    ctx.fill();
    ctx.restore();

    // siv langs stranda
    ctx.strokeStyle = '#7f9a52';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let i = 0; i < 30; i++) {
      const x = 0.3 + rand(i * 2.3) * 4.4;
      const y = 0.3 + rand(i * 5.9) * 4.4;
      const sum = x + y;
      if (sum > 5.6 || sum < 3.4) continue;
      const p = iso(x, y, 0.16);
      const sway = Math.sin(t * 1.1 + i) * 5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(p.x + sway * 0.5, p.y - 14, p.x + sway, p.y - 26 - rand(i * 3) * 12);
      ctx.stroke();
    }

    // furutrær
    for (const [x, y, sc] of [[0.7, 0.8, 1.3], [2.2, 0.6, 1.05], [1.0, 2.4, 1.15], [3.4, 0.4, 0.9], [0.4, 3.4, 1.0]]) {
      cyl(ctx, x, y, 0.14, 0.13 * sc, 0.8 * sc, '#63472f');
      const p = iso(x, y, 0.14 + 0.8 * sc);
      for (let k = 0; k < 3; k++) {
        const r = (46 - k * 12) * sc;
        ctx.fillStyle = k === 0 ? '#2f5c39' : k === 1 ? '#376a41' : '#41794c';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - r * 1.5 - k * 27 * sc);
        ctx.lineTo(p.x + r, p.y - k * 27 * sc);
        ctx.lineTo(p.x - r, p.y - k * 27 * sc);
        ctx.closePath();
        ctx.fill();
      }
    }

    // brygge
    box(ctx, 3.4, 3.4, -0.05, 4.4, 1.5, 0.34, '#9a7550');
    for (let i = 0; i < 9; i++) {
      tile(ctx, 3.45 + i * 0.48, 3.45, 0.3, 0.42, 1.4, i % 2 ? '#b0885d' : '#a67e55');
    }
    for (const [px, py] of [[3.6, 4.75], [5.2, 4.75], [6.8, 4.75], [7.6, 4.75]]) {
      cyl(ctx, px, py, -0.5, 0.14, 0.85, '#6b5236');
    }

    cyl(ctx, 4.2, 4.15, 0.29, 0.26, 0.4, '#5f8f9f');       // bøtte
    box(ctx, 5.0, 3.75, 0.29, 0.6, 0.45, 0.26, '#c05f4a');  // utstyrsboks

    place(ctx, 6.9, 4.15, 0.29, poseFishing(t, drawRod), t, 1);

    // ringer og dupp
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 4; i++) {
      const k = (t * 0.35 + i / 4) % 1;
      const p = iso(8.9, 4.6, 0);
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 8 + k * 46, (8 + k * 46) * (TH / TW), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    const fp = iso(8.9, 4.6, 0);
    ctx.fillStyle = '#e05a4a';
    ctx.beginPath();
    ctx.arc(fp.x, fp.y - 3 + Math.sin(t * 1.6) * 2, 3.6, 0, 6.3);
    ctx.fill();

    // glitrende bølger
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 40; i++) {
      const wx = rand(i * 1.7) * W;
      const wy = rand(i * 4.3) * D;
      if (wx + wy < 5.4 && wx < 4.6) continue;
      const p = iso(wx, wy, 0);
      const ph = Math.sin(t * 1.4 + i * 1.3);
      ctx.globalAlpha = 0.14 + 0.3 * Math.max(0, ph);
      ctx.beginPath();
      ctx.moveTo(p.x - 11, p.y + ph * 1.5);
      ctx.quadraticCurveTo(p.x, p.y - 3 + ph * 1.5, p.x + 11, p.y + ph * 1.5);
      ctx.stroke();
    }
    ctx.restore();

    // fugl
    const bt = (t * 0.08) % 1;
    if (bt < 0.7) {
      ctx.save();
      ctx.strokeStyle = 'rgba(40,50,60,0.55)';
      ctx.lineWidth = 2;
      const bx = -300 + bt * 860;
      const by = -230 + Math.sin(bt * 6) * 26;
      for (let i = 0; i < 2; i++) {
        const f = Math.sin(t * 6 + i) * 5;
        ctx.beginPath();
        ctx.moveTo(bx + i * 30 - 8, by + i * 12);
        ctx.quadraticCurveTo(bx + i * 30, by + i * 12 - f, bx + i * 30 + 8, by + i * 12);
        ctx.stroke();
      }
      ctx.restore();
    }
  },
};

/* ================= 5. Studieplassen hjemme ================= */

export const study = {
  W: 7, D: 7,
  draw(ctx, s) {
    const t = s.t;
    shell(ctx, 7, 7, {
      wallA: '#514539', wallB: '#473c32', floorA: '#7a5a3d', floorB: '#725439',
      trim: '#362e27', base: '#5a4b3c', deep: '#332a22',
    });

    window0(ctx, 0.9, 1.7, 1.8, 1.6, (c, w, h) => {
      const g = c.createLinearGradient(0, h, 0, 0);
      g.addColorStop(0, '#f0a06a'); g.addColorStop(0.45, '#a06a8e'); g.addColorStop(1, '#2b3a72');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(26,32,54,0.88)';
      c.beginPath();
      c.moveTo(0, h * 0.5); c.lineTo(w * 0.32, h * 0.72); c.lineTo(w * 0.6, h * 0.46);
      c.lineTo(w, h * 0.66); c.lineTo(w, 0); c.lineTo(0, 0); c.closePath(); c.fill();
      for (let i = 0; i < 10; i++) {
        c.fillStyle = `rgba(255,214,128,${0.45 + 0.45 * Math.sin(i * 2.1)})`;
        c.fillRect(0.1 + rand(i * 3.1) * (w - 0.2), h * (0.56 + rand(i * 7) * 0.18), 0.05, 0.05);
      }
    });

    // bokhylle på venstre vegg
    box(ctx, 0.2, 3.3, 0, 0.7, 2.6, 2.3, '#6b4c34');
    ctx.save();
    faceY(ctx, 0.902, 3.4, 0.12);
    ctx.fillStyle = '#4a3526';
    ctx.fillRect(0, 0, 2.4, 2.1);
    for (let sh = 0; sh < 4; sh++) {
      const y = sh * 0.52;
      ctx.fillStyle = '#7a5739';
      ctx.fillRect(0, y, 2.4, 0.06);
      let bx = 0.08, i = 0;
      while (bx < 2.25) {
        const bw = 0.08 + rand((sh * 13 + i) * 3.1) * 0.09;
        const bh = 0.27 + rand((sh * 7 + i) * 5.3) * 0.15;
        const cols = ['#c0563f', '#3a6ea5', '#4f8f5b', '#d0a24a', '#8a5f9a', '#d8d2c4'];
        ctx.fillStyle = cols[Math.floor(rand((sh * 5 + i) * 9.1) * cols.length)];
        ctx.fillRect(bx, y + 0.06, bw, bh);
        bx += bw + 0.018;
        i++;
      }
    }
    ctx.restore();

    // pult
    const top = desk(ctx, 2.8, 0.5, 3.4, 1.8, '#8a6240', '#a8794f', '#6b4c34');
    monitor(ctx, 3.4, 0.72, top, 1.6, 0.95, t, (c, w, h, tt) => {
      c.fillStyle = '#f8f5ee'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3a6ea5'; c.fillRect(0.06, 0.06, w * 0.42, 0.09);
      c.fillStyle = 'rgba(58,110,165,0.22)';
      c.fillRect(0.06, 0.24 + Math.floor((tt * 0.5) % 8) * 0.085 - 0.012, w * 0.7, 0.068);
      for (let i = 0; i < 8; i++) {
        c.fillStyle = `rgba(72,66,60,${0.3 + rand(i + Math.floor(tt * 0.3)) * 0.4})`;
        c.fillRect(0.06, 0.24 + i * 0.085, w * (0.25 + rand(i * 3.3) * 0.62), 0.045);
      }
    });

    // skrivebordslampe
    cyl(ctx, 5.65, 1.1, top, 0.18, 0.06, '#3d3630');
    ctx.save();
    const lb = iso(5.65, 1.1, top + 0.06);
    ctx.strokeStyle = '#3d3630'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lb.x, lb.y);
    ctx.quadraticCurveTo(lb.x + 7, lb.y - 38, lb.x - 14, lb.y - 52);
    ctx.stroke();
    ctx.fillStyle = '#e0b56a';
    ctx.beginPath();
    ctx.moveTo(lb.x - 27, lb.y - 45); ctx.lineTo(lb.x - 3, lb.y - 57);
    ctx.lineTo(lb.x + 2, lb.y - 43); ctx.lineTo(lb.x - 20, lb.y - 33);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    glow(ctx, 5.3, 1.4, top + 0.6, 170, '#ffc472', 0.3 + 0.25 * s.lt.lampGlow);

    box(ctx, 3.95, 1.75, top, 0.95, 0.5, 0.05, '#3d3630');    // tastatur
    tile(ctx, 2.95, 1.4, top + 0.01, 0.7, 0.5, '#f6f1e4');    // notatbok
    cyl(ctx, 5.2, 1.85, top, 0.19, 0.3, '#c9d9d2');           // kopp

    chair(ctx, 3.5, 2.05, '#5f4630', '#6b4c34');
    place(ctx, 3.95, 2.5, 0, poseTyping(t, 19, 0.75), t, 1);

    plant(ctx, 6.3, 4.4, 0, 1.15);
    box(ctx, 1.4, 5.5, 0, 1.4, 1.1, 0.45, '#6b4c34');
    box(ctx, 1.55, 5.65, 0.45, 0.8, 0.6, 0.12, '#c0563f');
    box(ctx, 1.6, 5.7, 0.57, 0.7, 0.55, 0.1, '#3a6ea5');
    tile(ctx, 2.4, 3.9, 0.01, 2.8, 2.0, 'rgba(158,118,86,0.32)');
  },
};

export const SCENES = { bedroom, kitchen, office, fjord, study };
