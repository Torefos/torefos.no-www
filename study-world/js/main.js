// Limet: tid, tilstand, brukerflate og bildeløkka.

import { World } from './world.js';
import { Player } from './player.js';
import { ACTIVITIES, SCHEDULE, DAY, hhmm, activityAt, nextChange } from './config.js';

const $ = (id) => document.getElementById(id);

/* ---------- lagrede valg ---------- */

// localStorage kan kaste helt av seg selv – i en iframe fra et annet domene, eller
// når nettleseren blokkerer tredjeparts lagring. Da skal siden fortsatt starte.
function readOpts() {
  try {
    return JSON.parse(localStorage.getItem('toreverden') || '{}');
  } catch {
    return {};
  }
}

const DEFAULTS = { parallax: true, particles: true, hud: true, vignette: true, zoom: 1, volume: 45 };
const opts = { ...DEFAULTS, ...readOpts() };
const save = () => {
  try {
    localStorage.setItem('toreverden', JSON.stringify(opts));
  } catch { /* valgene lever da bare ut økta */ }
};

/* ---------- tid ---------- */

const time = { real: true, manual: 8 * 60 };

function nowMinutes() {
  if (!time.real) return time.manual;
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/* ---------- verden ---------- */

const world = new World($('world'), opts);

/* ---------- spiller ---------- */

const player = new Player(({ title, sub, playing }) => {
  $('trackTitle').textContent = title;
  $('trackSub').textContent = sub;
  document.body.classList.toggle('playing', playing);
});
player.setVolume(opts.volume);
player.emit('Trykk play for å starte');
player.prepare();

$('btnPlay').addEventListener('click', () => player.toggle());
$('btnNext').addEventListener('click', () => player.next());
$('btnPrev').addEventListener('click', () => player.prev());
$('vol').value = opts.volume;
$('vol').addEventListener('input', (e) => {
  opts.volume = +e.target.value;
  player.setVolume(opts.volume);
  save();
});
$('btnLoadUrl').addEventListener('click', async () => {
  if (await player.custom($('customUrl').value)) $('customUrl').value = '';
});
$('customUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnLoadUrl').click(); });

/* ---------- panel ---------- */

const panel = $('panel');
$('btnSettings').addEventListener('click', () => { panel.hidden = !panel.hidden; });
$('btnClose').addEventListener('click', () => { panel.hidden = true; });

// Fullskjerm kan være nektet når siden ligger i en iframe uten allowfullscreen.
// Da skjuler vi knappen i stedet for å la den gjøre ingenting.
$('btnFull').addEventListener('click', () => {
  if (document.fullscreenElement) { document.exitFullscreen(); return; }
  const go = document.documentElement.requestFullscreen?.();
  if (go) go.catch(() => { $('btnFull').hidden = true; });
});
if (document.fullscreenEnabled === false) $('btnFull').hidden = true;

function bindToggle(id, key, apply) {
  const el = $(id);
  el.checked = opts[key];
  apply?.(opts[key]);
  el.addEventListener('change', () => {
    opts[key] = el.checked;
    apply?.(el.checked);
    save();
  });
}

bindToggle('optParallax', 'parallax');
bindToggle('optParticles', 'particles');
bindToggle('optVignette', 'vignette');
bindToggle('optHud', 'hud', (v) => document.body.classList.toggle('hud-hidden', !v));

$('optZoom').value = Math.round(opts.zoom * 100);
$('zoomOut').textContent = opts.zoom.toFixed(2) + '×';
$('optZoom').addEventListener('input', (e) => {
  opts.zoom = +e.target.value / 100;
  $('zoomOut').textContent = opts.zoom.toFixed(2) + '×';
  save();
});

$('useRealTime').addEventListener('change', (e) => {
  time.real = e.target.checked;
  if (!time.real) time.manual = nowMinutes();
  $('timeSlider').value = Math.round(time.manual);
});
$('timeSlider').addEventListener('input', (e) => {
  time.real = false;
  $('useRealTime').checked = false;
  time.manual = +e.target.value;
});

/* ---------- dagsplan i panelet ---------- */

const planItems = SCHEDULE.map((slot) => {
  const li = document.createElement('li');
  li.innerHTML = `<b>${hhmm(slot.start)}–${hhmm(slot.end)}</b><span>${ACTIVITIES[slot.act].label}</span>`;
  $('planList').appendChild(li);
  return { li, act: slot.act };
});

/* ---------- hurtigtaster ---------- */

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
  if (e.key === 'f') $('btnFull').click();
  if (e.key === 'h') { $('optHud').checked = !$('optHud').checked; $('optHud').dispatchEvent(new Event('change')); }
  if (e.key === 's') $('btnSettings').click();
});

/* ---------- løkka ---------- */

let last = performance.now();
let clock = 0;
let shownAct = null;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;

  const minutes = nowMinutes();
  const act = activityAt(minutes);
  world.setActivity(act);
  world.render(minutes, clock, dt);

  // tekst-overlegg
  $('clock').textContent = hhmm(minutes);
  const nx = nextChange(minutes);
  const mins = Math.max(0, Math.round(nx.in));
  const rest = mins >= 60 ? `${Math.floor(mins / 60)} t ${mins % 60} min` : `${mins} min`;
  $('clockSub').textContent = `${ACTIVITIES[nx.act].label.toLowerCase()} om ${rest}`;

  if (act !== shownAct) {
    shownAct = act;
    const a = ACTIVITIES[act];
    $('placeName').textContent = a.place;
    $('activityName').textContent = a.label;
    $('activitySub').textContent = a.sub;
    planItems.forEach((p) => p.li.classList.toggle('now', p.act === act));
  }

  if (!panel.hidden) {
    $('timeSlider').value = Math.round(((minutes % DAY) + DAY) % DAY);
    $('timeOut').textContent = hhmm(minutes);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

// Hjelpemiddel: still bilde av en gitt scene uten å vente på klokka.
window.__cap = (w, h, minutes, t = 6) => {
  world.forced = { w, h };
  world.resize();
  world.scene = null;
  world.setActivity(activityAt(minutes));
  world.fade = 0;
  world.render(minutes, t, 1 / 60);
  const url = $('world').toDataURL('image/png');
  world.forced = null;
  world.resize();
  return url;
};
