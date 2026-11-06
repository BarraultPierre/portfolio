// player.jsx — lecteur unifié (YouTube visible ou caché, MP3, vidéo HTML5).
// Une seule piste active à la fois : lancer une piste arrête la précédente.

const { useState: __useState, useEffect: __useEffect } = React;

const YT_VARS = { controls: 0, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, fs: 0, disablekb: 1 };
const YT_STATES = { "-1": "idle", 0: "ended", 1: "playing", 2: "paused", 3: "buffering", 5: "paused" };

const PPPlayer = {
  kind: null,            // 'youtube' | 'audio' | 'video'
  currentKey: null,
  state: "idle",
  volume: 70,
  muted: false,
  _pendingSeekFrac: null,

  yt: null,              // wrapper YouTube actif
  _hidden: null,         // lecteur YouTube caché (pièces libres)
  _ytHosts: {},          // key -> élément conteneur visible
  _ytByKey: {},          // key -> wrapper visible
  _ytQueue: [],
  audioEl: null,
  videoEl: null,
  _videoRegistry: {},
  _videoStack: {},
  _started: new Set(),   // vidéos HTML5 déjà lancées (miniature masquée)

  listeners: new Set(),
  playingSince: null,
  notify() {
    if (this.state === "playing") { if (!this.playingSince) this.playingSince = performance.now(); }
    else this.playingSince = null;
    this.listeners.forEach((fn) => fn());
  },
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },

  // ─── YouTube ────────────────────────────────────────────────────────────
  _apiReady() { return !!(window.YT && window.YT.Player); },
  _onApiReady() {
    if (!this._hidden) this._hidden = this._createYT("__yt-host");
    const q = this._ytQueue; this._ytQueue = [];
    q.forEach((fn) => fn());
  },
  _createYT(target, videoId) {
    const w = { player: null, ready: false, pendingId: videoId || null, loadedId: null };
    const init = () => {
      w.player = new window.YT.Player(target, {
        width: "100%", height: "100%",
        videoId: videoId || "",
        playerVars: { ...YT_VARS, autoplay: videoId ? 1 : 0 },
        events: {
          onReady: () => {
            w.ready = true;
            w.player.setVolume(this.volume);
            if (this.muted || this.volume === 0) w.player.mute();
            if (w.pendingId) {
              if (w.pendingId === videoId) w.player.playVideo();
              else w.player.loadVideoById(w.pendingId);
              w.loadedId = w.pendingId;
              w.pendingId = null;
            }
            this.notify();
          },
          onStateChange: (e) => {
            if (this.yt !== w || this.kind !== "youtube") return;
            this.state = YT_STATES[String(e.data)] || "idle";
            if (this.state !== "idle") this._applyPendingSeek();
            this.notify();
          },
          onError: () => { if (this.yt === w) { this.state = "idle"; this.notify(); } },
        },
      });
    };
    if (this._apiReady()) init(); else this._ytQueue.push(init);
    return w;
  },
  _allYT() { return [this._hidden, ...Object.values(this._ytByKey)].filter((w) => w && w.ready); },

  registerYTHost(key, el) { this._ytHosts[key] = el; },
  unregisterYTHost(key, el) {
    if (this._ytHosts[key] !== el) return;
    const w = this._ytByKey[key];
    if (w) {
      if (this.yt === w) { this.yt = null; this.kind = null; this.currentKey = null; this.state = "idle"; }
      try { w.player && w.player.destroy(); } catch (e) {}
      delete this._ytByKey[key];
    }
    delete this._ytHosts[key];
    this.notify();
  },

  // ─── HTML5 audio ────────────────────────────────────────────────────────
  _ensureAudio() {
    if (this.audioEl) return;
    const a = document.createElement("audio");
    a.preload = "metadata";
    a.volume = this.volume / 100;
    a.muted = this.muted;
    const on = (ev, fn) => a.addEventListener(ev, () => { if (this.kind === "audio") fn(); });
    on("playing", () => { this.state = "playing"; this.notify(); });
    on("pause", () => { if (!a.ended) { this.state = "paused"; this.notify(); } });
    on("ended", () => { this.state = "ended"; this.notify(); });
    on("waiting", () => { this.state = "buffering"; this.notify(); });
    on("loadedmetadata", () => { this._applyPendingSeek(); this.notify(); });
    on("canplay", () => this._applyPendingSeek());
    on("timeupdate", () => this.notify());
    on("error", () => { this.state = "idle"; this.notify(); });
    this.audioEl = a;
  },

  // ─── Vidéo HTML5 ────────────────────────────────────────────────────────
  registerVideo(key, el) {
    this._videoRegistry[key] = el;
    (this._videoStack[key] = this._videoStack[key] || []).push(el);
    el.volume = this.volume / 100;
    el.muted = this.muted;
    const mine = () => this.kind === "video" && this.videoEl === el;
    const h = {
      playing: () => { if (mine()) { this.state = "playing"; this.notify(); } },
      pause: () => { if (mine() && !el.ended) { this.state = "paused"; this.notify(); } },
      ended: () => { if (mine()) { this.state = "ended"; this.notify(); } },
      waiting: () => { if (mine()) { this.state = "buffering"; this.notify(); } },
      loadedmetadata: () => { if (mine()) { this._applyPendingSeek(); this.notify(); } },
      timeupdate: () => { if (mine()) this.notify(); },
      error: () => { if (mine()) { this.state = "idle"; this.notify(); } },
    };
    Object.entries(h).forEach(([ev, fn]) => el.addEventListener(ev, fn));
    el.__handlers = h;
  },
  unregisterVideo(key, el) {
    if (!el) return;
    if (this.videoEl === el) {
      try { el.pause(); } catch (e) {}
      this.videoEl = null;
      if (this.kind === "video") { this.kind = null; this.currentKey = null; this.state = "idle"; }
    }
    Object.entries(el.__handlers || {}).forEach(([ev, fn]) => el.removeEventListener(ev, fn));
    const stack = this._videoStack[key] || [];
    const i = stack.indexOf(el); if (i >= 0) stack.splice(i, 1);
    if (stack.length) this._videoRegistry[key] = stack[stack.length - 1];
    else delete this._videoRegistry[key];
    this.notify();
  },

  // Miniature masquée ?
  hasVisual(key) { return !!this._ytByKey[key] || this._started.has(key); },

  // ─── Actions ────────────────────────────────────────────────────────────
  _stopCurrent(nextKey) {
    if (!this.currentKey || this.currentKey === nextKey) return;
    if (this.kind === "youtube" && this.yt && this.yt.ready) {
      try { this.yt === this._hidden ? this.yt.player.stopVideo() : this.yt.player.pauseVideo(); } catch (e) {}
    }
    if (this.kind === "audio" && this.audioEl) this.audioEl.pause();
    if (this.kind === "video" && this.videoEl) { try { this.videoEl.pause(); } catch (e) {} }
  },

  _applyPendingSeek() {
    if (this._pendingSeekFrac == null) return;
    const d = this.getDuration();
    if (d > 0 && isFinite(d)) {
      const f = this._pendingSeekFrac;
      this._pendingSeekFrac = null;
      this.seek(f * d);
    }
  },

  loadAndPlay(source, opts = {}) {
    if (!source) return;
    const key = source.key;
    const isSame = this.currentKey === key;
    this._stopCurrent(key);
    this.kind = source.kind;
    this.currentKey = key;
    this.state = "loading";
    this._pendingSeekFrac = opts.seekFrac != null ? Math.max(0, Math.min(1, opts.seekFrac)) : null;

    if (source.kind === "youtube") {
      const host = this._ytHosts[key];
      let w;
      if (host) {
        w = this._ytByKey[key];
        if (!w) {
          const inner = document.createElement("div");
          host.innerHTML = "";
          host.appendChild(inner);
          w = this._createYT(inner, source.id);
          this._ytByKey[key] = w;
        }
      } else {
        if (!this._hidden) this._hidden = this._createYT("__yt-host");
        w = this._hidden;
      }
      this.yt = w;
      if (w.ready) {
        if (w.loadedId === source.id) {
          if (!isSame && w === this._hidden) w.player.seekTo(0, true);
          w.player.playVideo();
        } else {
          w.player.loadVideoById(source.id);
          w.loadedId = source.id;
        }
      } else {
        w.pendingId = source.id;
      }
    } else if (source.kind === "audio") {
      this._ensureAudio();
      if (isSame && this.audioEl.src.endsWith(source.src)) this.audioEl.play().catch(() => {});
      else {
        this.audioEl.src = source.src;
        this.audioEl.play().catch(() => { this.state = "paused"; this.notify(); });
      }
    } else if (source.kind === "video") {
      const el = this._videoRegistry[key];
      if (!el) { this.kind = null; this.currentKey = null; this.state = "idle"; this.notify(); return; }
      this.videoEl = el;
      this._started.add(key);
      el.volume = this.volume / 100;
      el.muted = this.muted;
      this._applyPendingSeek();
      el.play().catch(() => { this.state = "paused"; this.notify(); });
    }
    this.notify();
  },

  toggle() {
    if (this.kind === "youtube" && this.yt && this.yt.ready) {
      if (this.state === "playing") this.yt.player.pauseVideo(); else this.yt.player.playVideo();
    } else if (this.kind === "audio" && this.audioEl) {
      if (this.audioEl.paused) this.audioEl.play().catch(() => {}); else this.audioEl.pause();
    } else if (this.kind === "video" && this.videoEl) {
      if (this.videoEl.paused) this.videoEl.play().catch(() => {}); else this.videoEl.pause();
    }
  },

  pause() {
    if (this.kind === "youtube" && this.yt && this.yt.ready) this.yt.player.pauseVideo();
    if (this.kind === "audio" && this.audioEl) this.audioEl.pause();
    if (this.kind === "video" && this.videoEl) this.videoEl.pause();
  },

  seek(seconds) {
    const s = Math.max(0, seconds);
    if (this.kind === "youtube" && this.yt && this.yt.ready) this.yt.player.seekTo(s, true);
    else if (this.kind === "audio" && this.audioEl) this.audioEl.currentTime = s;
    else if (this.kind === "video" && this.videoEl) { try { this.videoEl.currentTime = s; } catch (e) {} }
    this.notify();
  },

  setVolume(v) {
    this.volume = Math.max(0, Math.min(100, v));
    if (this.muted && v > 0) this.muted = false;
    this._allYT().forEach((w) => {
      w.player.setVolume(this.volume);
      // YouTube ne coupe pas toujours à 0 : on force le mute
      if (this.muted || this.volume === 0) w.player.mute(); else w.player.unMute();
    });
    if (this.audioEl) { this.audioEl.volume = this.volume / 100; this.audioEl.muted = this.muted; }
    // garder le mute YouTube cohérent quand on relève le volume depuis 0
    Object.values(this._videoRegistry).forEach((el) => { el.volume = this.volume / 100; el.muted = this.muted; });
    this.notify();
  },

  toggleMute() {
    this.muted = !this.muted;
    this._allYT().forEach((w) => (this.muted || this.volume === 0 ? w.player.mute() : w.player.unMute()));
    if (this.audioEl) this.audioEl.muted = this.muted;
    Object.values(this._videoRegistry).forEach((el) => { el.muted = this.muted; });
    this.notify();
  },

  getTime() {
    if (this.kind === "youtube" && this.yt && this.yt.ready) return this.yt.player.getCurrentTime?.() || 0;
    if (this.kind === "audio" && this.audioEl) return this.audioEl.currentTime || 0;
    if (this.kind === "video" && this.videoEl) return this.videoEl.currentTime || 0;
    return 0;
  },

  getDuration() {
    if (this.kind === "youtube" && this.yt && this.yt.ready) return this.yt.player.getDuration?.() || 0;
    if (this.kind === "audio" && this.audioEl) return this.audioEl.duration || 0;
    if (this.kind === "video" && this.videoEl) return this.videoEl.duration || 0;
    return 0;
  },
};

window.__Audio = PPPlayer;
window.onYouTubeIframeAPIReady = () => PPPlayer._onApiReady();
if (PPPlayer._apiReady()) PPPlayer._onApiReady();

// Priorité : vidéo locale > MP3 > YouTube
function getSource(project) {
  if (!project) return null;
  if (project.video) return { kind: "video", src: project.video, key: "video:" + project.video };
  if (project.audio) return { kind: "audio", src: project.audio, key: "audio:" + project.audio };
  if (project.youtube) return { kind: "youtube", id: project.youtube, key: "youtube:" + project.youtube };
  return null;
}
window.getSource = getSource;

function usePlayer(project) {
  const source = getSource(project);
  const [, force] = __useState(0);
  __useEffect(() => PPPlayer.subscribe(() => force((n) => (n + 1) | 0)), []);

  const [, setTick] = __useState(0);
  __useEffect(() => {
    if (PPPlayer.state !== "playing" || !source || PPPlayer.currentKey !== source.key) return;
    let raf;
    const loop = () => { setTick((n) => (n + 1) | 0); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [PPPlayer.state, PPPlayer.currentKey, source?.key]);

  const isCurrent = !!source && PPPlayer.currentKey === source.key;
  const duration = isCurrent ? PPPlayer.getDuration() : 0;
  const time = isCurrent ? PPPlayer.getTime() : 0;

  return {
    available: !!source,
    key: source?.key,
    isCurrent,
    playing: isCurrent && PPPlayer.state === "playing",
    loading: isCurrent && (PPPlayer.state === "loading" || PPPlayer.state === "buffering"),
    time,
    duration,
    progress: duration > 0 ? time / duration : 0,
    playingFor: isCurrent && PPPlayer.playingSince ? performance.now() - PPPlayer.playingSince : 0,
    volume: PPPlayer.volume,
    muted: PPPlayer.muted,
    kind: source?.kind,
    toggle: () => {
      if (!source) return;
      if (isCurrent) PPPlayer.toggle(); else PPPlayer.loadAndPlay(source);
    },
    pause: () => PPPlayer.pause(),
    seekFrac: (f) => {
      if (!source) return;
      if (isCurrent && duration) PPPlayer.seek(Math.max(0, Math.min(1, f)) * duration);
      else PPPlayer.loadAndPlay(source, { seekFrac: f });
    },
    setVolume: (v) => PPPlayer.setVolume(v),
    toggleMute: () => PPPlayer.toggleMute(),
  };
}
window.usePlayer = usePlayer;

window.formatTime = function (s) {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
};
