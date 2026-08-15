// Tore. Tegnet parametrisk fra et lite skjelett, slik at han kan puste,
// taste, drikke kaffe og kaste ut snøret uten å bytte sprite-ark.
//
// Lokalt koordinatsystem: føttene i (0, 0), oppover er negativ y.
// Full høyde ≈ 68 px, som tilsvarer to høydeenheter i isometrien (TZ = 34).

import { rrect } from './iso.js';

export const SKIN = {
  skin: '#f2caa6',
  skinDark: '#dba97f',
  hair: '#e8cb70',
  hairDark: '#c4a548',
  hairLight: '#f6e3a4',
  shirt: '#3f74ad',      // blå piqué
  shirtDark: '#2c5480',
  shirtLight: '#5a90c8',
  collar: '#eef4fa',
  pants: '#dcc79e',      // beige bukser
  pantsDark: '#b8a175',
  shoe: '#4a3f36',
  eye: '#4f9d5d',        // grønne øyne
  brow: '#b8933f',
  mouth: '#b8785f',
  line: 'rgba(40,32,26,0.45)',
};

const L = {
  hip: 30,     // hoftehøyde over gulv når han står
  torso: 21,
  neck: 4,
  headR: 8.2,
  thigh: 15,
  shin: 15,
  upperArm: 13,
  foreArm: 12.5,
  shoulder: 6.5,
};

/* ---------- byggeklosser ---------- */

function segment(ctx, x, y, ang, len, w1, w2, color) {
  const ex = x + Math.sin(ang) * len;
  const ey = y + Math.cos(ang) * len;
  const nx = Math.cos(ang);
  const ny = -Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(x + nx * w1, y + ny * w1);
  ctx.lineTo(ex + nx * w2, ey + ny * w2);
  ctx.arc(ex, ey, w2, Math.atan2(ny, nx), Math.atan2(-ny, -nx), false);
  ctx.lineTo(x - nx * w1, y - ny * w1);
  ctx.arc(x, y, w1, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  return [ex, ey];
}

function limb(ctx, x, y, a1, a2, len1, len2, w, color1, color2) {
  const [mx, my] = segment(ctx, x, y, a1, len1, w, w * 0.86, color1);
  const [ex, ey] = segment(ctx, mx, my, a2, len2, w * 0.86, w * 0.7, color2);
  return { elbow: [mx, my], end: [ex, ey] };
}

function foot(ctx, x, y, ang, facing, color) {
  ctx.save();
  ctx.translate(x, y + 1);
  ctx.rotate(-ang * 0.35);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(facing * 1.6, 0, 5.2, 2.9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function hand(ctx, x, y, r = 3.1) {
  ctx.fillStyle = SKIN.skin;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function head(ctx, cx, cy, tilt, t, blink) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  const R = L.headR;

  // hals-skygge under haka
  ctx.fillStyle = SKIN.skinDark;
  ctx.beginPath();
  ctx.ellipse(0, R * 0.75, R * 0.55, R * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  // ansikt
  ctx.fillStyle = SKIN.skin;
  ctx.beginPath();
  ctx.ellipse(0, 0, R * 0.94, R, 0, 0, Math.PI * 2);
  ctx.fill();

  // øre bak
  ctx.fillStyle = SKIN.skinDark;
  ctx.beginPath();
  ctx.ellipse(-R * 0.85, R * 0.1, 1.8, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // hår: kort, blondt, sidesveis
  ctx.fillStyle = SKIN.hair;
  ctx.beginPath();
  ctx.ellipse(0, -R * 0.22, R * 1.0, R * 0.86, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-R * 1.0, -R * 0.2);
  ctx.quadraticCurveTo(-R * 0.6, R * 0.5, -R * 0.72, R * 0.05);
  ctx.lineTo(-R * 1.0, -R * 0.4);
  ctx.closePath();
  ctx.fill();
  // pannelugg som legger seg mot høyre
  ctx.beginPath();
  ctx.moveTo(-R * 0.9, -R * 0.42);
  ctx.quadraticCurveTo(R * 0.1, -R * 1.12, R * 0.98, -R * 0.28);
  ctx.quadraticCurveTo(R * 0.45, -R * 0.52, -R * 0.1, -R * 0.34);
  ctx.quadraticCurveTo(-R * 0.5, -R * 0.26, -R * 0.9, -R * 0.42);
  ctx.closePath();
  ctx.fill();
  // glans
  ctx.fillStyle = SKIN.hairLight;
  ctx.beginPath();
  ctx.ellipse(R * 0.1, -R * 0.62, R * 0.42, R * 0.13, -0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = SKIN.hairDark;
  ctx.beginPath();
  ctx.ellipse(-R * 0.62, -R * 0.5, R * 0.3, R * 0.12, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // øyne (grønne)
  const open = blink ? 0.12 : 1;
  for (const ex of [-0.2, 0.46]) {
    const x = ex * R * 1.05;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, R * 0.06, 1.9, 2.1 * open, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = SKIN.eye;
    ctx.beginPath();
    ctx.ellipse(x + 0.35, R * 0.06, 1.25, 1.5 * open, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20301f';
    ctx.beginPath();
    ctx.ellipse(x + 0.45, R * 0.06, 0.6, 0.85 * open, 0, 0, Math.PI * 2);
    ctx.fill();
    // bryn
    ctx.strokeStyle = SKIN.brow;
    ctx.lineWidth = 1.05;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 1.7, -R * 0.28);
    ctx.quadraticCurveTo(x, -R * 0.42, x + 1.8, -R * 0.3);
    ctx.stroke();
  }

  // nese og munn
  ctx.strokeStyle = SKIN.skinDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(R * 0.66, R * 0.16);
  ctx.lineTo(R * 0.74, R * 0.36);
  ctx.stroke();
  ctx.strokeStyle = SKIN.mouth;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(R * 0.16, R * 0.54);
  ctx.quadraticCurveTo(R * 0.42, R * 0.68, R * 0.62, R * 0.5);
  ctx.stroke();

  ctx.restore();
}

/* ---------- selve figuren ---------- */

/**
 * @param rig  { hipY, lean, headTilt, legNear, legFar, armNear, armFar,
 *               facing, rotate, scale, props }
 *   Vinkler er absolutte og måles fra rett ned; positiv dreier framover.
 */
export function drawTore(ctx, sx, sy, rig, t) {
  const r = {
    hipY: L.hip, lean: 0.03, headTilt: 0, facing: 1, rotate: 0, scale: 1,
    legNear: [0.05, 0.03], legFar: [-0.05, 0.05],
    armNear: [0.16, 0.12], armFar: [-0.14, 0.14],
    ...rig,
  };

  const blink = (t % 4.7) < 0.12 || (t % 4.7) > 4.62;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(r.scale * r.facing, r.scale);
  if (r.rotate) ctx.rotate(r.rotate);

  const px = 0;
  const py = -r.hipY;

  // torso-akse
  const neckX = px + Math.sin(r.lean) * L.torso;
  const neckY = py - Math.cos(r.lean) * L.torso;
  const shX = px + Math.sin(r.lean) * (L.torso - 3);
  const shY = py - Math.cos(r.lean) * (L.torso - 3);

  // --- bakre arm og bein ---
  const armF = limb(ctx, shX - L.shoulder * 0.3, shY, r.armFar[0], r.armFar[1],
    L.upperArm, L.foreArm, 3.4, SKIN.shirtDark, SKIN.skinDark);
  const legF = limb(ctx, px - 3, py, r.legFar[0], r.legFar[1],
    L.thigh, L.shin, 4.4, SKIN.pantsDark, SKIN.pantsDark);
  foot(ctx, legF.end[0], legF.end[1], r.legFar[0] + r.legFar[1], 1, '#3b332c');
  hand(ctx, armF.end[0], armF.end[1], 2.9);

  // --- fremre bein ---
  const legN = limb(ctx, px + 3, py, r.legNear[0], r.legNear[1],
    L.thigh, L.shin, 4.7, SKIN.pants, SKIN.pants);
  foot(ctx, legN.end[0], legN.end[1], r.legNear[0] + r.legNear[1], 1, SKIN.shoe);

  // --- overkropp: piqué ---
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(r.lean);
  const tw = 9.6;
  const grad = ctx.createLinearGradient(-tw, 0, tw, 0);
  grad.addColorStop(0, SKIN.shirtDark);
  grad.addColorStop(0.45, SKIN.shirt);
  grad.addColorStop(1, SKIN.shirtLight);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-tw * 0.82, 2);
  ctx.quadraticCurveTo(-tw * 1.02, -L.torso * 0.55, -tw * 0.78, -L.torso + 1);
  ctx.quadraticCurveTo(0, -L.torso - 3.2, tw * 0.78, -L.torso + 1);
  ctx.quadraticCurveTo(tw * 1.02, -L.torso * 0.55, tw * 0.82, 2);
  ctx.quadraticCurveTo(0, 4.5, -tw * 0.82, 2);
  ctx.closePath();
  ctx.fill();

  // knappelist og krage
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(1.5, -L.torso + 2);
  ctx.lineTo(1.5, -L.torso * 0.5);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath(); ctx.arc(1.5, -L.torso * 0.72, 0.75, 0, 6.3); ctx.fill();
  ctx.beginPath(); ctx.arc(1.5, -L.torso * 0.56, 0.75, 0, 6.3); ctx.fill();

  ctx.fillStyle = SKIN.collar;
  ctx.beginPath();
  ctx.moveTo(-5.4, -L.torso + 0.5);
  ctx.lineTo(0, -L.torso + 4.2);
  ctx.lineTo(5.4, -L.torso + 0.5);
  ctx.quadraticCurveTo(0, -L.torso - 2.6, -5.4, -L.torso + 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // hals
  segment(ctx, neckX, neckY + 1, r.lean, L.neck, 3, 2.8, SKIN.skinDark);

  // --- hode ---
  const hx = neckX + Math.sin(r.lean + r.headTilt) * (L.neck + L.headR * 0.72);
  const hy = neckY - Math.cos(r.lean + r.headTilt) * (L.neck + L.headR * 0.72);
  head(ctx, hx, hy, r.lean * 0.5 + r.headTilt, t, blink);

  // --- fremre arm ---
  const armN = limb(ctx, shX + L.shoulder * 0.5, shY, r.armNear[0], r.armNear[1],
    L.upperArm, L.foreArm, 3.7, SKIN.shirt, SKIN.skin);
  hand(ctx, armN.end[0], armN.end[1]);

  const joints = { hipX: px, hipY: py, neck: [neckX, neckY], head: [hx, hy], armN, armF, legN, legF };
  if (r.props) r.props(ctx, joints, t);

  ctx.restore();
  return { hx, hy };
}

/* ---------- positurer ---------- */

const breathe = (t, amp = 1) => Math.sin(t * 1.5) * 0.012 * amp;

export function poseStanding(t) {
  const b = Math.sin(t * 1.4);
  return {
    hipY: L.hip + b * 0.4,
    lean: 0.04 + breathe(t),
    headTilt: Math.sin(t * 0.55) * 0.05,
    legNear: [0.07, 0.02],
    legFar: [-0.07, 0.06],
    armNear: [0.18 + b * 0.03, 0.16],
    armFar: [-0.16 - b * 0.03, 0.2],
  };
}

/** Står med kaffekopp i fremre hånd. */
export function poseCoffee(t, drawMug) {
  const sip = Math.max(0, Math.sin(t * 0.42 - 1.2)) ** 6; // sjelden, myk slurk
  const p = poseStanding(t);
  p.armNear = [0.38 + sip * 0.25, 1.72 + sip * 0.62];
  p.armFar = [-0.1, 0.55];
  p.headTilt = -sip * 0.16 + Math.sin(t * 0.5) * 0.04;
  p.props = (ctx, j, tt) => drawMug && drawMug(ctx, j.armN.end[0], j.armN.end[1], tt);
  return p;
}

/** Sitter og taster. seat = setehøyde i piksler. */
export function poseTyping(t, seat = 19, intensity = 1) {
  const clack = Math.sin(t * 9.5) * 0.05 * intensity;
  const clack2 = Math.sin(t * 9.5 + 2.1) * 0.05 * intensity;
  const think = Math.sin(t * 0.31) * 0.5 + 0.5;
  return {
    hipY: seat,
    lean: 0.16 + breathe(t, 0.6) + think * 0.03,
    headTilt: -0.06 - think * 0.05,
    legNear: [1.42, 0.06],
    legFar: [1.36, 0.02],
    armNear: [0.72, 1.32 + clack],
    armFar: [0.62, 1.36 + clack2],
  };
}

/** Står og fisker. drawRod tegner stang og snøre fra hånda. */
export function poseFishing(t, drawRod) {
  const cast = Math.max(0, Math.sin(t * 0.16 - 0.6)) ** 10; // kaster av og til
  const b = Math.sin(t * 1.2);
  return {
    hipY: L.hip + b * 0.3,
    lean: -0.05 + breathe(t) - cast * 0.22,
    headTilt: 0.06 + Math.sin(t * 0.4) * 0.05,
    legNear: [0.28, 0.05],
    legFar: [-0.3, 0.14],
    armNear: [0.85 + cast * 0.7, 1.42 - cast * 0.5],
    armFar: [0.62 + cast * 0.5, 1.5 - cast * 0.4],
    props: (ctx, j, tt) => drawRod && drawRod(ctx, j.armN.end[0], j.armN.end[1], tt, cast),
  };
}

/** Ligger og sover. Tegnes liggende mot venstre, hodet på puta. */
export function poseSleeping(t) {
  const br = Math.sin(t * 0.85);
  return {
    rotate: -Math.PI / 2,
    hipY: L.hip * 0.55,
    lean: 0.1 + br * 0.02,
    headTilt: -0.28,
    legNear: [0.1, 0.16],
    legFar: [0.02, 0.1],
    armNear: [0.42, 0.5],
    armFar: [0.2, 0.42],
  };
}

/* ---------- rekvisitter ---------- */

export function drawMug(ctx, x, y, t) {
  ctx.save();
  ctx.translate(x + 1.5, y - 1);
  ctx.fillStyle = '#f4f1ea';
  rrect(ctx, -3.1, -4.4, 6.2, 6.4, 1.3);
  ctx.fill();
  ctx.strokeStyle = '#e2ded4';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(4.1, -1.4, 2.1, -1.3, 1.3);
  ctx.stroke();
  ctx.fillStyle = '#5b3a24';
  ctx.beginPath();
  ctx.ellipse(0, -4.2, 2.9, 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  // damp
  ctx.strokeStyle = 'rgba(255,255,255,0.34)';
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const o = t * 1.1 + i * 1.7;
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(o);
    ctx.beginPath();
    ctx.moveTo(-1.4 + i * 2.6, -6);
    ctx.quadraticCurveTo(-3.4 + i * 2.6 + Math.sin(o) * 2, -10, -1.6 + i * 2.6 + Math.sin(o + 1) * 1.4, -14);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawRod(ctx, x, y, t, cast) {
  const len = 54;
  const ang = -0.62 - cast * 0.5;
  const tipX = x + Math.cos(ang) * len;
  const tipY = y + Math.sin(ang) * len;

  ctx.strokeStyle = '#6b4a2e';
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(ang) * 9, y - Math.sin(ang) * 9);
  ctx.quadraticCurveTo((x + tipX) / 2, (y + tipY) / 2 - 3, tipX, tipY);
  ctx.stroke();

  // snøret ned i vannet, med litt slark
  const bob = Math.sin(t * 1.6) * 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.quadraticCurveTo(tipX + 14, tipY + 26 + bob, tipX + 26, tipY + 52 + bob);
  ctx.stroke();
}
