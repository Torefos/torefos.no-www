// Lerret, kamera, partikler og overgang mellom scener.

import { iso, rand } from './iso.js';
import { light, drawSky, drawGrade } from './sky.js';
import { SCENES } from './scenes.js';
import { activityAt, ACTIVITIES } from './config.js';

const FADE = 0.8; // sekunder

export class World {
  constructor(canvas, opts) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts;
    this.dpr = 1;
    this.w = 0;
    this.h = 0;

    this.diorama = document.createElement('canvas');
    this.dctx = this.diorama.getContext('2d');
    this.snap = document.createElement('canvas');
    this.sctx = this.snap.getContext('2d');

    this.scene = null;
    this.fade = 0;

    this.mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    this.particles = Array.from({ length: 70 }, (_, i) => ({
      x: rand(i * 3.1),
      y: rand(i * 7.7),
      z: 0.3 + rand(i * 5.3) * 0.7,
      r: 0.6 + rand(i * 2.9) * 1.9,
      sp: 0.1 + rand(i * 9.1) * 0.5,
      ph: rand(i * 4.4) * 6.3,
    }));

    this._resize = this.resize.bind(this);
    window.addEventListener('resize', this._resize);
    // Ligger siden i en ramme som skjules med display:none — for eksempel en fane —
    // får vinduet her inne ingen resize-hendelse mens det er borte. Blir vinduet
    // endret i mellomtiden, våkner vi opp med feil mål. ResizeObserver ser det uansett.
    if (window.ResizeObserver) {
      new ResizeObserver(this._resize).observe(document.documentElement);
    }
    window.addEventListener('pointermove', (e) => {
      this.mouse.tx = (e.clientX / this.w - 0.5) * 2;
      this.mouse.ty = (e.clientY / this.h - 0.5) * 2;
    });
    this.resize();
  }

  resize() {
    const dpr = this.forced ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const w = this.forced ? this.forced.w : window.innerWidth;
    const h = this.forced ? this.forced.h : window.innerHeight;
    // ResizeObserver fyrer også når ingenting egentlig endret seg. Da skal vi
    // verken tømme lerretene på nytt eller avbryte en overgang som er i gang.
    if (w === this.w && h === this.h && dpr === this.dpr) return;

    this.dpr = dpr;
    this.w = w;
    this.h = h;
    for (const c of [this.cv, this.diorama, this.snap]) {
      c.width = Math.round(this.w * this.dpr);
      c.height = Math.round(this.h * this.dpr);
    }
    this.cv.style.width = this.w + 'px';
    this.cv.style.height = this.h + 'px';
    this.fade = 0; // et frosset øyeblikksbilde ville ikke passet lenger
  }

  setActivity(act) {
    const name = ACTIVITIES[act].scene;
    if (this.scene === name) return;
    if (this.scene) {
      // frys forrige diorama og ton det ut
      this.sctx.setTransform(1, 0, 0, 1, 0, 0);
      this.sctx.clearRect(0, 0, this.snap.width, this.snap.height);
      this.sctx.drawImage(this.diorama, 0, 0);
      this.fade = FADE;
    }
    this.scene = name;
  }

  camera(ctx, scene) {
    // Store dioramaer skal ikke sprenge rammen, så målestokken følger scenens størrelse.
    const span = scene.W + scene.D;
    const fit = Math.min(this.w / (span * 36 + 190), this.h / (span * 21 + 300));
    const scale = Math.max(0.35, Math.min(2.4, fit)) * this.opts.zoom;
    const c = iso(scene.W / 2, scene.D / 2, 0.7);
    const px = this.opts.parallax ? this.mouse.x * 26 : 0;
    const py = this.opts.parallax ? this.mouse.y * 16 : 0;
    ctx.translate(this.w / 2 + px, this.h * 0.5 + py);
    ctx.scale(scale, scale);
    ctx.translate(-c.x, -c.y);
  }

  drawParticles(ctx, lt, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const p of this.particles) {
      const y = ((p.y - t * p.sp * 0.012) % 1 + 1) % 1;
      const x = (p.x + Math.sin(t * 0.25 * p.sp + p.ph) * 0.03 + 1) % 1;
      ctx.globalAlpha = (0.10 + 0.30 * (0.5 + 0.5 * Math.sin(t * 1.1 + p.ph))) * p.z;
      ctx.fillStyle = lt.stars > 0.4 ? '#9fb6ff' : '#fff3d0';
      ctx.beginPath();
      ctx.arc(x * this.w, y * this.h, p.r * p.z * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  render(minutes, t, dt) {
    const { ctx, dctx } = this;
    const lt = light(minutes);
    const scene = SCENES[this.scene] || SCENES.bedroom;

    // myk kamerabevegelse
    this.mouse.x += (this.mouse.tx - this.mouse.x) * Math.min(1, dt * 3);
    this.mouse.y += (this.mouse.ty - this.mouse.y) * Math.min(1, dt * 3);

    // 1) himmel
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    drawSky(ctx, this.w, this.h, lt, t);

    // 2) diorama i eget lag (gjør overgangen enkel)
    dctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    dctx.clearRect(0, 0, this.w, this.h);
    dctx.save();
    this.camera(dctx, scene);
    dctx.save();
    scene.draw(dctx, { t, minutes, lt, opts: this.opts });
    dctx.restore();
    dctx.restore();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.fade > 0) {
      this.fade = Math.max(0, this.fade - dt);
      const p = this.fade / FADE;
      ctx.globalAlpha = 1 - p;
      ctx.drawImage(this.diorama, 0, 0);
      ctx.globalAlpha = p;
      ctx.drawImage(this.snap, 0, 0);
      ctx.globalAlpha = 1;
    } else {
      ctx.drawImage(this.diorama, 0, 0);
    }

    // 3) atmosfære
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.opts.particles) this.drawParticles(ctx, lt, t);
    drawGrade(ctx, this.w, this.h, lt, this.opts);
  }
}

export { activityAt };
