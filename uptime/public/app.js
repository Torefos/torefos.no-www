/* =================================================================
   IKT Agder Oppetid - klientlogikk
   ================================================================= */
'use strict';

const KONF = {
  wsIntervall: 1000,      // ekkokall over WebSocket
  wsTidsfrist: 4000,      // uten svar innen dette regnes målingen som tapt
  lastIntervall: 3000,    // sideinnlasting mot /health
  lastTidsfrist: 5000,
  sendIntervall: 2000,    // hvor ofte klienten leverer målinger til serveren
  rosterIntervall: 2500,  // hvor ofte vi henter andres målinger
  maksStolper: 220,       // synlige stolper pr. stripe
  tregMs: 250,            // over dette blir stolpen gul
  maksHoyde: 44,          // px, høyeste grønne stolpe
  maksSkala: 1000,        // ms som gir full høyde
  bufferTak: 4000,        // maks antall målinger i kø ved lengre brudd
  histMaks: 20,           // rader i testhistorikk (eldste purges fra visningen)
  // /uptime på torefos.no; tom basis når backend serverer rot lokalt (node :8080)
  base: (location.pathname === '/uptime' || location.pathname.startsWith('/uptime/'))
    ? '/uptime' : '',
};

const LAGER_TESTER = 'iao.tester';
const LAGER_TEMA = 'iao.tema';

/* ------------------------------------------------------------ småverktøy */

const $ = (sel) => document.querySelector(sel);
const to = (n) => String(n).padStart(2, '0');

function klokkeslett(ms, medMs = false) {
  const d = new Date(ms);
  const base = `${to(d.getHours())}:${to(d.getMinutes())}:${to(d.getSeconds())}`;
  return medMs ? `${base}.${String(d.getMilliseconds()).padStart(3, '0')}` : base;
}

function dato(ms) {
  const d = new Date(ms);
  return `${to(d.getDate())}.${to(d.getMonth() + 1)}`;
}

function varighet(ms) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${to(s % 60)} s`;
  const t = Math.floor(m / 60);
  if (t < 24) return `${t} t ${to(m % 60)} min`;
  return `${Math.floor(t / 24)} d ${t % 24} t`;
}

function lagKode() {
  const tegn = 'abcdefghijkmnpqrstuvwxyz23456789';
  let ut = '';
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  for (const b of bytes) ut += tegn[b % tegn.length];
  return ut;
}

function lagId(navn) {
  const stamme = (navn || 'maling')
    .toLowerCase()
    .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'oe').replace(/[å]/g, 'aa')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'maling';
  return `${stamme}-${lagKode()}`;
}

function lesLager(nokkel, fallback) {
  try {
    const v = localStorage.getItem(nokkel);
    return v === null ? fallback : JSON.parse(v);
  } catch { return fallback; }
}

function skrivLager(nokkel, verdi) {
  try { localStorage.setItem(nokkel, JSON.stringify(verdi)); } catch {}
}

function el(tag, klasse, tekst) {
  const n = document.createElement(tag);
  if (klasse) n.className = klasse;
  if (tekst !== undefined) n.textContent = tekst;
  return n;
}

/* ------------------------------------------------------------------ tema */

const temaBryter = $('#temaBryter');
const temaTekst = $('#temaTekst');
const temaIkon = $('#temaIkon');

const MAANE = '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"></path>';
const SOL = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>';

function settTema(tema) {
  document.documentElement.dataset.tema = tema;
  const mork = tema === 'mørk';
  temaTekst.textContent = mork ? 'Lys' : 'Mørk';
  temaIkon.innerHTML = mork ? SOL : MAANE;
  temaBryter.setAttribute('aria-pressed', String(mork));
  temaBryter.title = mork ? 'Bytt til lys visning' : 'Bytt til mørk visning';
  skrivLager(LAGER_TEMA, tema);
}

settTema(
  lesLager(LAGER_TEMA, null) ||
  (matchMedia('(prefers-color-scheme: dark)').matches ? 'mørk' : 'lys')
);

temaBryter.addEventListener('click', () => {
  settTema(document.documentElement.dataset.tema === 'mørk' ? 'lys' : 'mørk');
});

/* ---------------------------------------------------------------- klokke */

const klokkeEl = $('#klokke');
setInterval(() => { klokkeEl.textContent = klokkeslett(Date.now()); }, 1000);
klokkeEl.textContent = klokkeslett(Date.now());

/* -------------------------------------------------------- stripetegning */

function stolpeHoyde(rtt) {
  const andel = Math.log10(1 + Math.max(0, rtt)) / Math.log10(1 + KONF.maksSkala);
  return Math.max(3, Math.min(KONF.maksHoyde, 3 + andel * (KONF.maksHoyde - 3)));
}

function lagStolpe(prove, animer) {
  const [t, rtt] = prove;
  const b = el('i', 'bar');
  b.dataset.t = t;
  b.dataset.r = rtt;
  if (rtt < 0) {
    b.classList.add('feil');
  } else {
    b.classList.add('ok');
    if (rtt >= KONF.tregMs) b.classList.add('treg');
    b.style.setProperty('--h', `${stolpeHoyde(rtt).toFixed(1)}px`);
  }
  if (animer) {
    b.classList.add('ny');
    b.addEventListener('animationend', () => b.classList.remove('ny'), { once: true });
  }
  return b;
}

/** Tegner stripen. `fra` = indeks i `prover` som ikke er tegnet ennå. */
function tegnStripe(spor, prover, fra) {
  if (fra === 0) spor.replaceChildren();
  const frag = document.createDocumentFragment();
  for (let i = fra; i < prover.length; i++) {
    frag.appendChild(lagStolpe(prover[i], fra > 0));
  }
  spor.appendChild(frag);
  while (spor.childElementCount > KONF.maksStolper) spor.removeChild(spor.firstElementChild);
}

/* ------------------------------------------------------------ verktøytips */

const tipsEl = $('#tips');
let tipsSkjul = null;

document.addEventListener('mousemove', (e) => {
  const bar = e.target.closest?.('.bar');
  if (!bar) {
    if (tipsEl.classList.contains('vis')) {
      clearTimeout(tipsSkjul);
      tipsSkjul = setTimeout(() => tipsEl.classList.remove('vis'), 60);
    }
    return;
  }
  clearTimeout(tipsSkjul);

  const t = Number(bar.dataset.t);
  const r = Number(bar.dataset.r);
  const kilde = bar.closest('.stripe')?.dataset.kilde || '';
  const status = r < 0
    ? `<span class="tips-feil">Ingen svar</span>`
    : `<span class="tips-ok">Svar på <b>${r} ms</b></span>`;
  tipsEl.innerHTML = `<b>${klokkeslett(t, true)}</b> &nbsp;${dato(t)}<br>${status}<br>${kilde}`;

  const boks = tipsEl.getBoundingClientRect();
  const x = Math.min(Math.max(8, e.clientX - boks.width / 2), innerWidth - boks.width - 8);
  const y = e.clientY - boks.height - 14;
  tipsEl.style.left = `${x}px`;
  tipsEl.style.top = `${y < 8 ? e.clientY + 18 : y}px`;
  tipsEl.classList.add('vis');

  const markor = bar.closest('.stripe')?.querySelector('.markor');
  if (markor) markor.style.left = `${bar.offsetLeft}px`;
});

/* ---------------------------------------------------------------- analyse */

function analyser(wsProver, lastProver, intervall) {
  const alle = wsProver.concat(lastProver);
  const svar = alle.filter((p) => p[1] >= 0);
  const rtts = svar.map((p) => p[1]).sort((a, b) => a - b);
  return {
    total: alle.length,
    ok: svar.length,
    tapt: alle.length - svar.length,
    oppetid: alle.length ? (svar.length / alle.length) * 100 : null,
    median: rtts.length ? rtts[Math.floor(rtts.length / 2)] : null,
    p95: rtts.length ? rtts[Math.min(rtts.length - 1, Math.floor(rtts.length * 0.95))] : null,
    siste: alle.length ? alle[alle.length - 1] : null,
    brudd: finnBrudd(wsProver, intervall || KONF.wsIntervall),
  };
}

function finnBrudd(prover, intervall) {
  const ut = [];
  let start = null;
  let forrige = null;
  for (const [t, r] of prover) {
    if (r < 0) {
      if (start === null) start = t;
      forrige = t;
    } else if (start !== null) {
      ut.push({ start, slutt: forrige + intervall, apen: false });
      start = null;
    }
  }
  if (start !== null) ut.push({ start, slutt: forrige + intervall, apen: true });
  return ut;
}

/* ------------------------------------------------------------------ kort */

function byggKort(egen) {
  const kort = el('article', `kort ${egen ? 'egen' : 'andres'}`);

  const topp = el('header', 'kort-topp');
  const navnEl = el('span', 'kort-navn');
  const idEl = el('span', 'kort-id');
  const status = el('span', 'merkelapp');
  status.appendChild(el('span', 'prikk'));
  const statusTekst = el('span', '', 'Starter');
  status.appendChild(statusTekst);
  topp.append(navnEl, idEl, status);

  // Egen rad under header — ikke gjemt i smal header på mobil
  const verktoy = el('div', 'kort-verktoy');
  const aksjoner = el('div', 'kort-aksjoner');
  aksjoner.appendChild(verktoy);

  const tall = el('dl', 'tall-rad');
  const felt = {};
  for (const [nokkel, etikett] of [
    ['oppetid', 'Oppetid'],
    ['median', 'Median svar'],
    ['p95', '95-persentil'],
    ['brudd', 'Brudd'],
    ['tapt', 'Tapte kall'],
    ['gaar', 'Måler i'],
  ]) {
    const rute = el('div', 'tall');
    rute.appendChild(el('dt', '', etikett));
    const dd = el('dd', '', '–');
    rute.appendChild(dd);
    tall.appendChild(rute);
    felt[nokkel] = dd;
  }

  function stripe(tittel, kilde, skala) {
    const blokk = el('section', 'stripe-blokk');
    const hode = el('div', 'stripe-hode');
    hode.appendChild(el('span', '', tittel));
    hode.appendChild(el('span', 'skala', skala));
    const ramme = el('div', 'stripe');
    ramme.dataset.kilde = kilde;
    const spor = el('div', 'spor');
    const markor = el('div', 'markor');
    const tom = el('div', 'stripe-tom', 'venter på første måling …');
    ramme.append(spor, markor, tom);
    blokk.append(hode, ramme);
    return { blokk, spor, tom };
  }

  const sWs = stripe('Nettverk · ekkokall hvert sekund', 'Ekkokall over WebSocket', 'høyde = svartid, log-skala 0–1000 ms');
  const sLast = stripe('Sideinnlasting · hvert 3. sekund', 'Sideinnlasting av /uptime/health', 'høyde = svartid, log-skala 0–1000 ms');

  const bruddBlokk = el('section', 'brudd-liste');
  const bruddHode = el('div', 'stripe-hode');
  bruddHode.appendChild(el('span', '', 'Bruddprotokoll'));
  bruddBlokk.appendChild(bruddHode);
  const bruddInnhold = el('div');
  bruddBlokk.appendChild(bruddInnhold);

  kort.append(topp, aksjoner, tall, sWs.blokk, sLast.blokk, bruddBlokk);
  return { kort, navnEl, idEl, status, statusTekst, verktoy, aksjoner, felt, sWs, sLast, bruddInnhold };
}

function oppdaterTall(felt, s, siden) {
  felt.oppetid.textContent = s.oppetid === null ? '–' : `${s.oppetid.toFixed(2)} %`;
  felt.oppetid.className = s.oppetid === null ? '' : s.oppetid >= 99.9 ? 'god' : s.oppetid < 99 ? 'darlig' : '';
  felt.median.innerHTML = s.median === null ? '–' : `${s.median} <small>ms</small>`;
  felt.p95.innerHTML = s.p95 === null ? '–' : `${s.p95} <small>ms</small>`;
  felt.brudd.textContent = String(s.brudd.length);
  felt.brudd.className = s.brudd.length ? 'darlig' : 'god';
  felt.tapt.textContent = String(s.tapt);
  felt.gaar.textContent = varighet(Date.now() - siden);
}

function tegnBrudd(vert, brudd) {
  vert.replaceChildren();
  if (!brudd.length) {
    vert.appendChild(el('p', 'ingen-brudd', 'Ingen tapte kall registrert i denne perioden.'));
    return;
  }
  for (const b of brudd.slice(-8).reverse()) {
    const rad = el('div', 'brudd-rad');
    rad.appendChild(el('span', 'tid', klokkeslett(b.start, true)));
    rad.appendChild(el('span', 'pil', '→'));
    rad.appendChild(el('span', 'tid', b.apen ? 'pågår' : klokkeslett(b.slutt, true)));
    rad.appendChild(el('span', 'kilde', dato(b.start)));
    rad.appendChild(el('span', 'varighet', varighet(b.slutt - b.start)));
    vert.appendChild(rad);
  }
}

/* -------------------------------------------------------------- måleøkt */

const mineVert = $('#mine');
const mineTomt = $('#mineTomt');
const andreVert = $('#andre');
const andreTomt = $('#andreTomt');

/** @type {Map<string, Maling>} */
const mine = new Map();

class Maling {
  constructor(id, navn) {
    this.id = id;
    this.navn = navn;
    this.siden = Date.now();
    this.ws = [];
    this.last = [];
    this.ko = { ws: [], last: [] };
    this.tegnetWs = 0;
    this.tegnetLast = 0;
    this.sokkel = null;
    this.seq = 0;
    this.venter = new Map();
    this.tilkoblet = false;
    this.avsluttet = false;
    this.forsok = 0;

    const d = byggKort(true);
    for (const n of ['kort', 'status', 'statusTekst', 'felt', 'sWs', 'sLast', 'bruddInnhold', 'verktoy']) {
      this[n] = d[n];
    }
    d.navnEl.textContent = navn;
    d.idEl.textContent = id;

    const lastJson = el('button', 'knapp-liten', '↓ JSON');
    lastJson.title = 'Last ned full historikk fra teststart (JSON)';
    lastJson.addEventListener('click', () => this.lastNedHistorikk('json', lastJson));
    d.verktoy.appendChild(lastJson);

    const lastCsv = el('button', 'knapp-liten', '↓ CSV');
    lastCsv.title = 'Last ned full historikk fra teststart (CSV)';
    lastCsv.addEventListener('click', () => this.lastNedHistorikk('csv', lastCsv));
    d.verktoy.appendChild(lastCsv);

    const stopp = el('button', 'knapp-liten knapp-fare', 'Stopp måling');
    stopp.addEventListener('click', () => this.stopp());
    d.verktoy.appendChild(stopp);

    mineVert.appendChild(this.kort);
    this.koble();
    this.tikkWs = setInterval(() => this.proveWs(), KONF.wsIntervall);
    this.tikkLast = setInterval(() => this.proveLast(), KONF.lastIntervall);
    this.tikkSend = setInterval(() => this.send(), KONF.sendIntervall);
    this.tikkTegn = setInterval(() => this.tegn(), 500);
    this.proveLast();
  }

  /* ---- forbindelse ---- */

  koble() {
    if (this.avsluttet) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let s;
    try {
      s = new WebSocket(`${proto}://${location.host}${KONF.base}/ws`);
    } catch {
      return this.kobleIgjen();
    }
    this.sokkel = s;

    s.addEventListener('open', () => {
      this.tilkoblet = true;
      this.forsok = 0;
      s.send(JSON.stringify({ t: 'hello', id: this.id, name: this.navn }));
    });

    s.addEventListener('message', (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') {
        // Historikk fra serveren legges foran det vi har målt lokalt.
        if (Array.isArray(m.ws) && m.ws.length) {
          const nye = m.ws.filter((p) => !this.ws.length || p[0] < this.ws[0][0]);
          this.ws = nye.concat(this.ws);
          this.tegnetWs = 0;
        }
        if (Array.isArray(m.load) && m.load.length) {
          const nye = m.load.filter((p) => !this.last.length || p[0] < this.last[0][0]);
          this.last = nye.concat(this.last);
          this.tegnetLast = 0;
        }
        if (m.since) this.siden = Math.min(this.siden, m.since);
        this.tegn();
      } else if (m.t === 'pong') {
        const v = this.venter.get(m.s);
        if (!v) return;
        clearTimeout(v.frist);
        this.venter.delete(m.s);
        this.noter('ws', v.sendt, Math.max(0, performance.now() - v.start));
      }
    });

    const dott = () => {
      if (this.sokkel !== s) return;
      this.tilkoblet = false;
      this.kobleIgjen();
    };
    s.addEventListener('close', dott);
    s.addEventListener('error', dott);
  }

  kobleIgjen() {
    if (this.avsluttet) return;
    this.forsok++;
    const vent = Math.min(8000, 700 * Math.min(6, this.forsok));
    clearTimeout(this.igjen);
    this.igjen = setTimeout(() => this.koble(), vent);
  }

  /* ---- målinger ---- */

  noter(type, tid, rtt) {
    const rad = [tid, rtt < 0 ? -1 : Math.round(rtt)];
    const liste = type === 'ws' ? this.ws : this.last;
    const ko = type === 'ws' ? this.ko.ws : this.ko.last;
    liste.push(rad);
    ko.push(rad);
    if (liste.length > 4000) liste.splice(0, liste.length - 4000);
    if (ko.length > KONF.bufferTak) ko.splice(0, ko.length - KONF.bufferTak);
  }

  proveWs() {
    if (this.avsluttet) return;
    const na = Date.now();
    if (!this.sokkel || this.sokkel.readyState !== WebSocket.OPEN) {
      this.noter('ws', na, -1);
      return;
    }
    const s = ++this.seq;
    const start = performance.now();
    try {
      this.sokkel.send(JSON.stringify({ t: 'ping', s }));
    } catch {
      this.noter('ws', na, -1);
      return;
    }
    const frist = setTimeout(() => {
      this.venter.delete(s);
      this.noter('ws', na, -1);
    }, KONF.wsTidsfrist);
    this.venter.set(s, { sendt: na, start, frist });
  }

  async proveLast() {
    if (this.avsluttet) return;
    const na = Date.now();
    const start = performance.now();
    const avbryt = new AbortController();
    const frist = setTimeout(() => avbryt.abort(), KONF.lastTidsfrist);
    try {
      const svar = await fetch(`${KONF.base}/health?t=${na}&id=${encodeURIComponent(this.id)}`, {
        cache: 'no-store',
        signal: avbryt.signal,
      });
      await svar.text();
      clearTimeout(frist);
      this.noter('last', na, svar.ok ? performance.now() - start : -1);
    } catch {
      clearTimeout(frist);
      this.noter('last', na, -1);
    }
  }

  send() {
    if (this.avsluttet) return;
    if (!this.sokkel || this.sokkel.readyState !== WebSocket.OPEN) return;
    if (!this.ko.ws.length && !this.ko.last.length) return;
    const nyttelast = { t: 'samples', id: this.id, ws: this.ko.ws, load: this.ko.last };
    try {
      this.sokkel.send(JSON.stringify(nyttelast));
      this.ko.ws = [];
      this.ko.last = [];
    } catch { /* forsøkes på nytt ved neste runde */ }
  }

  /* ---- tegning ---- */

  tegn() {
    if (this.avsluttet) return;

    if (this.ws.length > this.tegnetWs) {
      tegnStripe(this.sWs.spor, this.ws, this.tegnetWs);
      this.tegnetWs = this.ws.length;
      this.sWs.tom.classList.add('skjult');
    }
    if (this.last.length > this.tegnetLast) {
      tegnStripe(this.sLast.spor, this.last, this.tegnetLast);
      this.tegnetLast = this.last.length;
      this.sLast.tom.classList.add('skjult');
    }

    const s = analyser(this.ws, this.last, KONF.wsIntervall);
    oppdaterTall(this.felt, s, this.siden);
    tegnBrudd(this.bruddInnhold, s.brudd);

    const nedeNa = s.siste && s.siste[1] < 0;
    this.status.className = `merkelapp ${nedeNa ? 'brudd' : 'kjorer'}`;
    this.statusTekst.textContent = nedeNa
      ? 'Ingen kontakt'
      : this.tilkoblet ? 'Måler' : 'Kobler til';
  }

  /* ---- eksport av historikk ---- */

  async lastNedHistorikk(format, btn) {
    const forrige = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Henter …';
    }
    // Flush lokal kø først slik at serveren har nyeste punkter
    try { this.send(); } catch {}

    const url =
      `${KONF.base}/api/tests/${encodeURIComponent(this.id)}/export` +
      `?format=${encodeURIComponent(format)}`;

    try {
      const svar = await fetch(url, { cache: 'no-store' });
      if (!svar.ok) {
        // Fallback: bygg fra det klienten har (kan mangle eldre serverdata)
        this.lastNedLokal(format);
        return;
      }
      const blob = await svar.blob();
      let filnavn = `oppetid-${this.id}.${format === 'csv' ? 'csv' : 'json'}`;
      const cd = svar.headers.get('content-disposition');
      if (cd) {
        const m = cd.match(/filename="([^"]+)"/);
        if (m) filnavn = m[1];
      }
      this.lagreBlob(blob, filnavn);
    } catch {
      this.lastNedLokal(format);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = forrige || 'Last ned historikk';
      }
    }
  }

  lastNedLokal(format) {
    const alleWs = this.ws.slice();
    const alleLoad = this.last.slice();
    const s = analyser(alleWs, alleLoad, KONF.wsIntervall);
    const payload = {
      exportedAt: Date.now(),
      exportedAtIso: new Date().toISOString(),
      id: this.id,
      name: this.navn,
      since: this.siden,
      sinceIso: new Date(this.siden).toISOString(),
      source: 'browser-local-fallback',
      note: 'Eksportert fra nettleseren fordi serverhistorikk ikke var tilgjengelig. Kan mangle eldre punkter.',
      summary: {
        total: alleWs.length + alleLoad.length,
        ok: (alleWs.concat(alleLoad)).filter((p) => p[1] >= 0).length,
        fails: s.tapt,
        median: s.median,
        p95: s.p95,
        uptimePct: s.oppetid,
      },
      samples: {
        ws: alleWs,
        load: alleLoad,
        format: '[timestamp_ms, rtt_ms] — rtt_ms = -1 betyr tapt kall',
      },
      outages: s.brudd.map((b) => ({
        start: b.start,
        end: b.slutt,
        startIso: new Date(b.start).toISOString(),
        endIso: new Date(b.slutt).toISOString(),
        durationMs: b.slutt - b.start,
        open: !!b.apen,
      })),
    };

    if (format === 'csv') {
      const lines = ['timestamp_iso,timestamp_ms,type,rtt_ms,ok'];
      const rows = [];
      for (const [ts, rtt] of alleWs) rows.push([ts, 'ws', rtt]);
      for (const [ts, rtt] of alleLoad) rows.push([ts, 'load', rtt]);
      rows.sort((a, b) => a[0] - b[0]);
      for (const [ts, type, rtt] of rows) {
        lines.push(
          `${new Date(ts).toISOString()},${ts},${type},${rtt >= 0 ? rtt : ''},${rtt >= 0 ? 1 : 0}`
        );
      }
      this.lagreBlob(
        new Blob([lines.join('\n') + '\n'], { type: 'text/csv;charset=utf-8' }),
        `oppetid-${this.id}-lokal.csv`
      );
      return;
    }

    this.lagreBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
      `oppetid-${this.id}-lokal.json`
    );
  }

  lagreBlob(blob, filnavn) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filnavn;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1500);
  }

  /* ---- avslutning ---- */

  stopp() {
    if (this.avsluttet) return;
    this.avsluttet = true;
    clearInterval(this.tikkWs);
    clearInterval(this.tikkLast);
    clearInterval(this.tikkSend);
    clearInterval(this.tikkTegn);
    clearTimeout(this.igjen);
    for (const v of this.venter.values()) clearTimeout(v.frist);
    this.venter.clear();

    if (this.sokkel && this.sokkel.readyState === WebSocket.OPEN) {
      try {
        if (this.ko.ws.length || this.ko.last.length) {
          this.sokkel.send(JSON.stringify({ t: 'samples', id: this.id, ws: this.ko.ws, load: this.ko.last }));
        }
        this.sokkel.send(JSON.stringify({ t: 'stop', id: this.id }));
      } catch {}
    }
    try { this.sokkel?.close(); } catch {}

    // Behold kortet slik at historikk fortsatt kan lastes ned
    this.status.className = 'merkelapp';
    this.statusTekst.textContent = 'Stoppet — last ned historikk ved behov';
    // Fjern Stopp-knapp, legg til «Fjern kort»
    this.verktoy.querySelectorAll('.knapp-fare').forEach((b) => b.remove());
    if (!this.verktoy.querySelector('[data-fjern]')) {
      const fjern = el('button', 'knapp-liten', 'Fjern kort');
      fjern.dataset.fjern = '1';
      fjern.addEventListener('click', () => {
        this.kort.remove();
        mine.delete(this.id);
        lagreMine();
        oppdaterTomme();
      });
      this.verktoy.appendChild(fjern);
    }
    // Ikke gjenoppta ved reload; oppdater historikk-listen
    lagreMine();
    oppdaterTomme();
    hentRosterOgHistorikk();
  }
}

/* ------------------------------------------------------------- oppstart */

function lagreMine() {
  // Kun aktive (ikke stoppede) gjenopptas ved sidelasting
  skrivLager(
    LAGER_TESTER,
    [...mine.values()]
      .filter((m) => !m.avsluttet)
      .map((m) => ({ id: m.id, navn: m.navn }))
  );
}

function oppdaterTomme() {
  // Vis «tom» bare når det ikke er noen kort i det hele tatt
  mineTomt.classList.toggle('skjult', mine.size > 0);
}

function startMaling(navn, id) {
  const m = new Maling(id || lagId(navn), navn);
  mine.set(m.id, m);
  lagreMine();
  oppdaterTomme();
  return m;
}

const navnFelt = $('#navnFelt');
const startKnapp = $('#startKnapp');

function forsokStart() {
  const navn = navnFelt.value.trim();
  if (!navn) {
    navnFelt.focus();
    navnFelt.placeholder = 'Gi målingen et navn først';
    return;
  }
  startMaling(navn);
  navnFelt.value = '';
}

startKnapp.addEventListener('click', forsokStart);
navnFelt.addEventListener('keydown', (e) => { if (e.key === 'Enter') forsokStart(); });

// Gjenoppta det som lå lagret i denne nettleseren.
for (const t of lesLager(LAGER_TESTER, [])) {
  if (t && t.id && t.navn) startMaling(t.navn, t.id);
}
oppdaterTomme();

window.addEventListener('beforeunload', () => {
  for (const m of mine.values()) m.send();
});

/* ------------------------------------------------------- andres + historikk */

const andreKort = new Map();

/** Last ned historikk for en vilkårlig test-id fra serveren. */
async function lastNedServerTest(id, navn, format, btn) {
  const forrige = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Henter …'; }
  const url =
    `${KONF.base}/api/tests/${encodeURIComponent(id)}/export` +
    `?format=${encodeURIComponent(format)}`;
  try {
    const svar = await fetch(url, { cache: 'no-store' });
    if (!svar.ok) throw new Error('HTTP ' + svar.status);
    const blob = await svar.blob();
    let filnavn = `oppetid-${id}.${format === 'csv' ? 'csv' : 'json'}`;
    const cd = svar.headers.get('content-disposition');
    if (cd) {
      const m = cd.match(/filename="([^"]+)"/);
      if (m) filnavn = m[1];
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filnavn;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  } catch (err) {
    console.warn('Eksport feilet', id, err);
    alert('Klarte ikke hente historikk for «' + (navn || id) + '». Er serveren oppe?');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = forrige; }
  }
}

const historikkVert = $('#historikk');
const historikkTomt = $('#historikkTomt');
const histMaksTekst = $('#histMaksTekst');
if (histMaksTekst) histMaksTekst.textContent = String(KONF.histMaks);

/** Oppdater «Andre målinger» + «Testhistorikk» fra samme API-kall. */
async function hentRosterOgHistorikk() {
  let data;
  try {
    const svar = await fetch(`${KONF.base}/api/tests`, { cache: 'no-store' });
    if (!svar.ok) return;
    data = await svar.json();
  } catch { return; }

  const tester = data.tests || [];
  oppdaterAndre(tester);
  oppdaterHistorikk(tester);
}

function oppdaterAndre(tester) {
  const aktive = tester.filter((t) => t.active && !mine.has(t.id));
  const sett = new Set(aktive.map((t) => t.id));

  for (const [id, kort] of andreKort) {
    if (!sett.has(id)) {
      kort.kort.remove();
      andreKort.delete(id);
    }
  }

  for (const t of aktive) {
    let k = andreKort.get(t.id);
    if (!k) {
      k = byggKort(false);
      k.sLast.blokk.remove();
      k.navnEl.textContent = t.name;
      k.idEl.textContent = t.id;
      const lastJson = el('button', 'knapp-liten', '↓ JSON');
      lastJson.addEventListener('click', () => lastNedServerTest(t.id, t.name, 'json', lastJson));
      k.verktoy.appendChild(lastJson);
      const lastCsv = el('button', 'knapp-liten', '↓ CSV');
      lastCsv.addEventListener('click', () => lastNedServerTest(t.id, t.name, 'csv', lastCsv));
      k.verktoy.appendChild(lastCsv);
      andreVert.appendChild(k.kort);
      andreKort.set(t.id, k);
    }

    const prover = t.recent || [];
    tegnStripe(k.sWs.spor, prover, 0);
    k.sWs.tom.classList.toggle('skjult', prover.length > 0);

    const s = analyser(prover, [], KONF.wsIntervall);
    s.oppetid = t.total ? (t.ok / t.total) * 100 : null;
    s.median = t.median;
    s.p95 = t.p95;
    s.tapt = t.fails;
    oppdaterTall(k.felt, s, t.since);
    tegnBrudd(k.bruddInnhold, s.brudd);

    const nedeNa = prover.length && prover[prover.length - 1][1] < 0;
    k.status.className = `merkelapp ${nedeNa ? 'brudd' : 'kjorer'}`;
    k.statusTekst.textContent = nedeNa ? 'Ingen kontakt' : 'Måler';
  }

  andreTomt.classList.toggle('skjult', aktive.length > 0);
}

function oppdaterHistorikk(tester) {
  if (!historikkVert) return;

  // Stoppede/inaktive, ikke de som fortsatt vises som «mine» (aktive i denne fanen)
  const aktiveMine = new Set([...mine.values()].filter((m) => !m.avsluttet).map((m) => m.id));
  let liste = tester
    .filter((t) => !t.active && !aktiveMine.has(t.id))
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    .slice(0, KONF.histMaks);

  // Inkluder også nettopp stoppede i denne fanen (finnes kanskje fortsatt som active:false)
  for (const m of mine.values()) {
    if (!m.avsluttet) continue;
    if (liste.some((t) => t.id === m.id)) continue;
    liste.unshift({
      id: m.id,
      name: m.navn,
      since: m.siden,
      lastSeen: Date.now(),
      active: false,
      total: m.ws.length + m.last.length,
      ok: m.ws.concat(m.last).filter((p) => p[1] >= 0).length,
      fails: m.ws.concat(m.last).filter((p) => p[1] < 0).length,
      median: null,
      p95: null,
    });
  }
  liste = liste
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    .slice(0, KONF.histMaks);

  historikkVert.replaceChildren();
  if (!liste.length) {
    historikkTomt.classList.remove('skjult');
    return;
  }
  historikkTomt.classList.add('skjult');

  for (const t of liste) {
    const rad = el('div', 'hist-rad');
    const meta = el('div', 'hist-meta');
    meta.appendChild(el('div', 'hist-navn', t.name || t.id));
    meta.appendChild(el('div', 'hist-id', t.id));
    const det = el('div', 'hist-detalj');
    det.appendChild(el('span', '', 'Start: ' + (t.since ? dato(t.since) + ' ' + klokkeslett(t.since) : '–')));
    det.appendChild(el('span', '', 'Sist: ' + (t.lastSeen ? dato(t.lastSeen) + ' ' + klokkeslett(t.lastSeen) : '–')));
    if (t.total != null) {
      const pct = t.total ? ((t.ok / t.total) * 100).toFixed(2) + ' %' : '–';
      det.appendChild(el('span', '', 'Oppetid: ' + pct));
      det.appendChild(el('span', '', 'Kall: ' + t.total + ' (tap ' + (t.fails || 0) + ')'));
    }
    if (t.median != null) det.appendChild(el('span', '', 'Median: ' + t.median + ' ms'));
    meta.appendChild(det);

    const aks = el('div', 'hist-aksjoner');
    const bj = el('button', 'knapp-liten', '↓ JSON');
    bj.addEventListener('click', () => lastNedServerTest(t.id, t.name, 'json', bj));
    const bc = el('button', 'knapp-liten', '↓ CSV');
    bc.addEventListener('click', () => lastNedServerTest(t.id, t.name, 'csv', bc));
    aks.append(bj, bc);

    rad.append(meta, aks);
    historikkVert.appendChild(rad);
  }
}

hentRosterOgHistorikk();
setInterval(hentRosterOgHistorikk, KONF.rosterIntervall);
