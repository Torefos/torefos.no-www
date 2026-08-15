// Musikkspiller. Bruker YouTube sitt IFrame-API, men holder videoen skjult –
// vi er bare ute etter lyden.

import { TRACKS } from './config.js';

let apiPromise = null;

function loadApi() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prev) prev();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return apiPromise;
}

export function parseYouTube(input) {
  const v = input.trim();
  if (!v) return null;
  if (/^[\w-]{11}$/.test(v)) return { id: v };
  try {
    const u = new URL(v.startsWith('http') ? v : 'https://' + v);
    const list = u.searchParams.get('list');
    const id = u.searchParams.get('v') || (u.hostname.includes('youtu.be') ? u.pathname.slice(1) : null)
      || (u.pathname.startsWith('/live/') ? u.pathname.split('/')[2] : null)
      || (u.pathname.startsWith('/embed/') ? u.pathname.split('/')[2] : null);
    if (id || list) return { id, list };
  } catch { /* ikke en URL */ }
  return null;
}

// YouTube sine feilkoder, oversatt til noe som faktisk sier hva som er galt.
const ERRORS = {
  2: 'Ugyldig video-ID',
  5: 'Avspilleren klarte ikke denne videoen',
  100: 'Videoen finnes ikke lenger',
  101: 'Denne strømmen tillater ikke innbygging',
  150: 'Denne strømmen tillater ikke innbygging',
};

export class Player {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.tracks = TRACKS.slice();
    this.index = 0;
    this.volume = 45;
    this.playing = false;
    this.yt = null;
    this.ready = false;
    this.pendingPlay = false;
    this.wantPlay = false;
    this.blocked = new Set(); // strømmer som avviste innbygging
  }

  get track() { return this.tracks[this.index]; }

  emit(msg) {
    this.onUpdate({
      title: this.track ? this.track.title : '—',
      sub: msg || (this.track ? this.track.sub : ''),
      playing: this.playing,
    });
  }

  async ensure() {
    if (this.yt) return this.yt;
    const YT = await loadApi();
    this.yt = new YT.Player('ytPlayer', {
      height: '1',
      width: '1',
      videoId: this.track.id,
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, origin: location.origin },
      events: {
        onReady: () => {
          this.ready = true;
          this.yt.setVolume(this.volume);
          if (this.pendingPlay) { this.pendingPlay = false; this.yt.playVideo(); }
        },
        onStateChange: (e) => {
          this.playing = e.data === 1;
          document.body.classList.toggle('playing', this.playing);
          if (e.data === 0) this.next(); // ferdig → neste
          this.emit();
        },
        onError: (e) => this.fail(e.data),
      },
    });
    return this.yt;
  }

  /**
   * Bygg spilleren allerede ved oppstart. Uten dette havner første klikk på play
   * utenfor brukerhandlingen — spilleren er ikke klar ennå, så avspillingen må
   * utsettes til onReady, og da blokkerer nettleseren lyden.
   */
  prepare() {
    this.ensure().catch(() => this.emit('Fikk ikke kontakt med YouTube'));
  }

  /** En strøm avviste oss. Hopp videre til noe som faktisk lar seg spille. */
  fail(code) {
    const msg = ERRORS[code] || `Avspillingsfeil ${code}`;
    const cannotEmbed = code === 101 || code === 150;
    if (cannotEmbed) this.blocked.add(this.track.id);

    const next = this.tracks.findIndex((tr, i) => i !== this.index && !this.blocked.has(tr.id));
    if (cannotEmbed && this.wantPlay && next !== -1) {
      this.emit(`${msg} — hopper videre`);
      this.select(next);
      return;
    }
    this.playing = false;
    this.wantPlay = false;
    document.body.classList.remove('playing');
    this.emit(next === -1 ? `${msg} — lim inn en egen lenke i innstillinger` : msg);
  }

  async toggle() {
    if (this.playing) { this.wantPlay = false; this.yt.pauseVideo(); return; }
    this.wantPlay = true;
    await this.ensure();
    if (!this.ready) { this.pendingPlay = true; this.emit('Kobler til…'); return; }
    this.yt.playVideo();
  }

  async select(i, autoplay = true) {
    this.index = ((i % this.tracks.length) + this.tracks.length) % this.tracks.length;
    if (autoplay) this.wantPlay = true;
    this.emit();
    await this.ensure();
    if (!this.ready) { this.pendingPlay = autoplay; return; }
    if (autoplay) this.yt.loadVideoById(this.track.id);
    else this.yt.cueVideoById(this.track.id);
  }

  next() { this.select(this.index + 1); }
  prev() { this.select(this.index - 1); }

  setVolume(v) {
    this.volume = v;
    if (this.ready) this.yt.setVolume(v);
  }

  /** Legger til en egen lenke øverst i lista og spiller den. */
  async custom(input) {
    const p = parseYouTube(input);
    if (!p) { this.emit('Fant ingen video-ID i lenka'); return false; }
    this.tracks.unshift({ id: p.id, list: p.list, title: 'Egen strøm', sub: p.id || p.list });
    this.index = 0;
    this.wantPlay = true;
    this.emit();
    await this.ensure();
    const go = () => {
      if (p.list) this.yt.loadPlaylist({ list: p.list, listType: 'playlist' });
      else this.yt.loadVideoById(p.id);
    };
    if (this.ready) go(); else this.pendingPlay = true;
    return true;
  }
}
