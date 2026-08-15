'use strict';
/*
 * IKT Agder Oppetid - backend
 * Ingen eksterne avhengigheter. Krever Node.js 18 eller nyere.
 *
 *   node server/server.js
 *
 * Miljøvariabler:
 *   PORT        lytteport (standard 8080)
 *   HOST        lytteadresse (standard 127.0.0.1)
 *   DATA_FILE   hvor testhistorikk lagres (standard server/data/tests.json)
 *   SERVE_STATIC  sett til "0" hvis nginx serverer public/ direkte
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'tests.json');
const SERVE_STATIC = process.env.SERVE_STATIC !== '0';

const MAX_SAMPLES = 3000;          // pr. målingstype pr. test
const ACTIVE_TIMEOUT_MS = 45000;   // uten livstegn regnes testen som stoppet
const RETENTION_MS = 7 * 24 * 3600 * 1000;
const ROSTER_SAMPLES = 90;         // hvor mange målinger andres kort viser
const SAVE_INTERVAL_MS = 15000;

/* ---------------------------------------------------------------- lagring */

/** @type {Map<string, {id:string,name:string,since:number,lastSeen:number,stopped:boolean,ws:Array,load:Array}>} */
const tests = new Map();

function emptyTest(id, name) {
  return { id, name, since: Date.now(), lastSeen: Date.now(), stopped: false, ws: [], load: [] };
}

function load() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    const cutoff = Date.now() - RETENTION_MS;
    for (const t of raw.tests || []) {
      if (t.lastSeen < cutoff) continue;
      t.stopped = true;
      tests.set(t.id, t);
    }
    console.log(`[oppetid] lastet ${tests.size} lagrede tester fra ${DATA_FILE}`);
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[oppetid] klarte ikke lese datafil:', err.message);
  }
}

let saveTimer = null;
function save() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const payload = { savedAt: Date.now(), tests: [...tests.values()] };
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(payload));
    fs.renameSync(tmp, DATA_FILE);
  } catch (err) {
    console.warn('[oppetid] klarte ikke lagre:', err.message);
  }
}

/* --------------------------------------------------------------- statistikk */

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

function summarise(t) {
  const all = t.ws.concat(t.load);
  const ok = all.filter((s) => s[1] >= 0);
  const rtts = ok.map((s) => s[1]).sort((a, b) => a - b);
  const active = !t.stopped && Date.now() - t.lastSeen < ACTIVE_TIMEOUT_MS;
  return {
    id: t.id,
    name: t.name,
    since: t.since,
    lastSeen: t.lastSeen,
    active,
    total: all.length,
    ok: ok.length,
    fails: all.length - ok.length,
    median: percentile(rtts, 50),
    p95: percentile(rtts, 95),
    recent: t.ws.slice(-ROSTER_SAMPLES),
  };
}

function reap() {
  const now = Date.now();
  for (const t of tests.values()) {
    if (!t.stopped && now - t.lastSeen > ACTIVE_TIMEOUT_MS) t.stopped = true;
    if (now - t.lastSeen > RETENTION_MS) tests.delete(t.id);
  }
}

function appendSamples(t, key, rows) {
  if (!Array.isArray(rows)) return;
  const bucket = t[key];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const ts = Number(row[0]);
    const rtt = Number(row[1]);
    if (!Number.isFinite(ts) || !Number.isFinite(rtt)) continue;
    bucket.push([ts, rtt < 0 ? -1 : Math.round(rtt)]);
  }
  if (bucket.length > MAX_SAMPLES) t[key] = bucket.slice(-MAX_SAMPLES);
}

/* ------------------------------------------------------------ http-server */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(res, code, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': buf.length,
    'cache-control': 'no-store',
  });
  res.end(buf);
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Finner ikke siden');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Sideinnlastingsmåling: bevisst minimal, men går gjennom hele kjeden.
  if (url.pathname === '/health') {
    res.writeHead(200, {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'x-server-time': String(Date.now()),
    });
    res.end('ok');
    return;
  }

  if (url.pathname === '/api/tests') {
    reap();
    const list = [...tests.values()]
      .map(summarise)
      .sort((a, b) => Number(b.active) - Number(a.active) || b.lastSeen - a.lastSeen);
    sendJson(res, 200, { now: Date.now(), tests: list });
    return;
  }

  // Full historikk / eksport for én måling:
  //   GET /api/tests/<id>
  //   GET /api/tests/<id>/export?format=json|csv
  {
    const m = url.pathname.match(/^\/api\/tests\/([^/]+)(?:\/(export))?$/);
    if (m && req.method === 'GET') {
      reap();
      const id = decodeURIComponent(m[1]).replace(/[^a-zA-Z0-9æøåÆØÅ_-]/g, '').slice(0, 80);
      const wantExport = m[2] === 'export' || url.searchParams.get('download') === '1';
      const format = (url.searchParams.get('format') || 'json').toLowerCase();
      const t = id && tests.get(id);
      if (!t) {
        sendJson(res, 404, { error: 'Fant ikke måling', id });
        return;
      }

      const summary = summarise(t);
      const payload = {
        exportedAt: Date.now(),
        exportedAtIso: new Date().toISOString(),
        id: t.id,
        name: t.name,
        since: t.since,
        sinceIso: new Date(t.since).toISOString(),
        lastSeen: t.lastSeen,
        lastSeenIso: new Date(t.lastSeen).toISOString(),
        stopped: !!t.stopped,
        active: summary.active,
        summary: {
          total: summary.total,
          ok: summary.ok,
          fails: summary.fails,
          median: summary.median,
          p95: summary.p95,
          uptimePct: summary.total
            ? Math.round((summary.ok / summary.total) * 10000) / 100
            : null,
        },
        // Samples from test start (capped by MAX_SAMPLES server-side)
        samples: {
          ws: t.ws.slice(),
          load: t.load.slice(),
          format: '[timestamp_ms, rtt_ms] — rtt_ms = -1 betyr tapt kall',
        },
        outages: findOutages(t.ws, 1000),
      };

      if (!wantExport && format === 'json' && !url.searchParams.get('format')) {
        // JSON API uten Content-Disposition (for eventuell UI-bruk)
        sendJson(res, 200, payload);
        return;
      }

      const safeName = String(t.name || t.id)
        .replace(/[^\wæøåÆØÅ.-]+/g, '_')
        .slice(0, 40) || 'maling';
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

      if (format === 'csv') {
        const csv = buildCsvExport(payload);
        const buf = Buffer.from(csv, 'utf8');
        res.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-length': buf.length,
          'content-disposition': `attachment; filename="oppetid-${safeName}-${stamp}.csv"`,
          'cache-control': 'no-store',
        });
        res.end(buf);
        return;
      }

      // default json download
      const buf = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': buf.length,
        'content-disposition': `attachment; filename="oppetid-${safeName}-${stamp}.json"`,
        'cache-control': 'no-store',
      });
      res.end(buf);
      return;
    }
  }

  if (SERVE_STATIC) serveStatic(req, res, url.pathname);
  else res.writeHead(404).end();
});

/** Enkel brudd-deteksjon for eksport (rtt < 0 = tapt). */
function findOutages(samples, gapMs) {
  const out = [];
  let cur = null;
  for (const row of samples) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const ts = row[0];
    const rtt = row[1];
    if (rtt < 0) {
      if (!cur) cur = { start: ts, end: ts, samples: 1 };
      else {
        cur.end = ts;
        cur.samples += 1;
      }
    } else if (cur) {
      out.push({
        start: cur.start,
        end: cur.end,
        startIso: new Date(cur.start).toISOString(),
        endIso: new Date(cur.end).toISOString(),
        durationMs: Math.max(0, cur.end - cur.start),
        lostSamples: cur.samples,
      });
      cur = null;
    }
  }
  if (cur) {
    out.push({
      start: cur.start,
      end: cur.end,
      startIso: new Date(cur.start).toISOString(),
      endIso: new Date(cur.end).toISOString(),
      durationMs: Math.max(0, cur.end - cur.start),
      lostSamples: cur.samples,
      open: true,
    });
  }
  return out;
}

function buildCsvExport(payload) {
  const lines = [];
  lines.push('# Oppetid / linjemåling — historikk');
  lines.push(`# id,${csvEsc(payload.id)}`);
  lines.push(`# name,${csvEsc(payload.name)}`);
  lines.push(`# since,${payload.sinceIso}`);
  lines.push(`# exportedAt,${payload.exportedAtIso}`);
  lines.push(`# uptime_pct,${payload.summary.uptimePct ?? ''}`);
  lines.push(`# total,${payload.summary.total}`);
  lines.push(`# ok,${payload.summary.ok}`);
  lines.push(`# fails,${payload.summary.fails}`);
  lines.push(`# median_ms,${payload.summary.median ?? ''}`);
  lines.push(`# p95_ms,${payload.summary.p95 ?? ''}`);
  lines.push('#');
  lines.push('timestamp_iso,timestamp_ms,type,rtt_ms,ok');
  const rows = [];
  for (const [ts, rtt] of payload.samples.ws) {
    rows.push([ts, 'ws', rtt]);
  }
  for (const [ts, rtt] of payload.samples.load) {
    rows.push([ts, 'load', rtt]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  for (const [ts, type, rtt] of rows) {
    const ok = rtt >= 0 ? '1' : '0';
    const r = rtt >= 0 ? rtt : '';
    lines.push(`${new Date(ts).toISOString()},${ts},${type},${r},${ok}`);
  }
  if (payload.outages && payload.outages.length) {
    lines.push('#');
    lines.push('# outages');
    lines.push('outage_start_iso,outage_end_iso,duration_ms,lost_samples,open');
    for (const o of payload.outages) {
      lines.push(
        `${o.startIso},${o.endIso},${o.durationMs},${o.lostSamples},${o.open ? '1' : '0'}`
      );
    }
  }
  return lines.join('\n') + '\n';
}

function csvEsc(s) {
  const t = String(s ?? '');
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

/* ------------------------------------------------- websocket (RFC 6455) */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encodeFrame(payload, opcode = 0x1) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const len = body.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, body]);
}

class Socket {
  constructor(sock) {
    this.sock = sock;
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOp = 0;
    this.open = true;
    this.testId = null;
    sock.on('data', (chunk) => this.onData(chunk));
    sock.on('close', () => this.onClose());
    sock.on('error', () => this.onClose());
    sock.setNoDelay(true);
  }

  send(obj) {
    if (!this.open) return;
    try {
      this.sock.write(encodeFrame(JSON.stringify(obj)));
    } catch {
      this.onClose();
    }
  }

  close() {
    if (!this.open) return;
    try {
      this.sock.write(encodeFrame(Buffer.alloc(0), 0x8));
      this.sock.end();
    } catch {}
    this.onClose();
  }

  onClose() {
    if (!this.open) return;
    this.open = false;
    sockets.delete(this);
    try {
      this.sock.destroy();
    } catch {}
  }

  onData(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      const frame = this.readFrame();
      if (!frame) break;
      this.handleFrame(frame);
    }
    if (this.buf.length > 4 * 1024 * 1024) this.close(); // beskytt mot sløsing
  }

  readFrame() {
    const b = this.buf;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (b.length < offset + 2) return null;
      len = b.readUInt16BE(offset);
      offset += 2;
    } else if (len === 127) {
      if (b.length < offset + 8) return null;
      const big = b.readBigUInt64BE(offset);
      if (big > 4194304n) {
        this.close();
        return null;
      }
      len = Number(big);
      offset += 8;
    }
    let mask = null;
    if (masked) {
      if (b.length < offset + 4) return null;
      mask = b.subarray(offset, offset + 4);
      offset += 4;
    }
    if (b.length < offset + len) return null;
    const payload = Buffer.from(b.subarray(offset, offset + len));
    if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
    this.buf = b.subarray(offset + len);
    return { fin, opcode, payload };
  }

  handleFrame({ fin, opcode, payload }) {
    if (opcode === 0x8) return this.close();
    if (opcode === 0x9) {
      try {
        this.sock.write(encodeFrame(payload, 0xa));
      } catch {}
      return;
    }
    if (opcode === 0xa) return;

    if (opcode === 0x0) {
      this.fragments.push(payload);
    } else {
      this.fragments = [payload];
      this.fragmentOp = opcode;
    }
    if (!fin) return;

    const full = Buffer.concat(this.fragments);
    this.fragments = [];
    if (this.fragmentOp !== 0x1) return;

    let msg;
    try {
      msg = JSON.parse(full.toString('utf8'));
    } catch {
      return;
    }
    handleMessage(this, msg);
  }
}

const sockets = new Set();

function sanitiseName(name) {
  return String(name || 'test')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 60) || 'test';
}

function handleMessage(ws, msg) {
  if (!msg || typeof msg.t !== 'string') return;

  if (msg.t === 'hello') {
    const id = String(msg.id || '').replace(/[^a-zA-Z0-9æøåÆØÅ_-]/g, '').slice(0, 80);
    if (!id) return;
    ws.testId = id;
    let t = tests.get(id);
    if (!t) {
      t = emptyTest(id, sanitiseName(msg.name));
      tests.set(id, t);
    }
    t.stopped = false;
    t.lastSeen = Date.now();
    ws.send({
      t: 'welcome',
      id: t.id,
      name: t.name,
      since: t.since,
      serverTime: Date.now(),
      ws: t.ws.slice(-600),
      load: t.load.slice(-300),
    });
    return;
  }

  if (msg.t === 'ping') {
    ws.send({ t: 'pong', s: msg.s, serverTime: Date.now() });
    const t = ws.testId && tests.get(ws.testId);
    if (t) t.lastSeen = Date.now();
    return;
  }

  if (msg.t === 'samples') {
    const t = ws.testId && tests.get(ws.testId);
    if (!t) return;
    t.lastSeen = Date.now();
    t.stopped = false;
    appendSamples(t, 'ws', msg.ws);
    appendSamples(t, 'load', msg.load);
    return;
  }

  if (msg.t === 'stop') {
    const t = ws.testId && tests.get(ws.testId);
    if (t) t.stopped = true;
    save();
    ws.close();
    return;
  }

  if (msg.t === 'forget') {
    if (ws.testId) tests.delete(ws.testId);
    save();
    ws.close();
  }
}

server.on('upgrade', (req, sock, head) => {
  const url = new URL(req.url, 'http://localhost');
  const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/ws' || !key) {
    sock.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    sock.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );
  const client = new Socket(sock);
  sockets.add(client);
  if (head && head.length) client.onData(head);
});

/* ------------------------------------------------------------------ start */

load();
saveTimer = setInterval(() => {
  reap();
  save();
}, SAVE_INTERVAL_MS);
saveTimer.unref?.();

server.listen(PORT, HOST, () => {
  console.log(`[oppetid] lytter på http://${HOST}:${PORT}  (statiske filer: ${SERVE_STATIC ? 'på' : 'av'})`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`\n[oppetid] ${sig} - lagrer og avslutter`);
    save();
    for (const s of sockets) s.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
