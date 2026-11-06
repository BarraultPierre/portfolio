// app.jsx — Portfolio Pierre Barrault (Purple Pain)
// Architecture : un seul fichier, lisible de haut en bas.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// Données ─────────────────────────────────────────────────────────────────
const data = window.PORTFOLIO_DATA;
const gen = window.generateWaveform;
const t = window.t;

const accentVar = (hue) => `oklch(0.68 0.14 ${hue})`;
const accentSoft = (hue) => `oklch(0.68 0.14 ${hue} / 0.18)`;

// Langue persistante ──────────────────────────────────────────────────────
function useLang() {
  const [lang, setLang] = useState(() => {
    const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || "en").toLowerCase();
    const fallback = nav.startsWith("fr") ? "fr" : "en";
    try { return localStorage.getItem("pp_lang") || fallback; } catch { return fallback; }
  });
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const choose = (l) => { try { localStorage.setItem("pp_lang", l); } catch {} setLang(l); };
  return [lang, choose];
}

// Waveform + scrubber ─────────────────────────────────────────────────────
function Waveform({ seed, peaks, bars = 96, progress = 0, playing = false, height = 56, accent, onSeek, disabled = false, hint }) {
  const wfData = useMemo(() => {
    if (peaks && peaks.length) return window.resamplePeaks(peaks, bars);
    return gen(seed, bars);
  }, [seed, peaks, bars]);

  const [tick, setTick] = useState(0);
  const [hoverFrac, setHoverFrac] = useState(null);
  const [dragging, setDragging] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!playing) return;
    let raf;
    const loop = () => { setTick((n) => (n + 1) % 360); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const fracFromClient = (clientX) => {
    const r = ref.current.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  };
  const interactive = !!onSeek && !disabled;

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const f = fracFromClient(e.clientX);
      setHoverFrac(f);
      onSeek(f);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, onSeek]);

  const onDown = (e) => {
    if (!interactive) return;
    e.preventDefault();
    setDragging(true);
    const f = fracFromClient(e.clientX);
    setHoverFrac(f);
    onSeek(f);
  };

  return (
    <div
      ref={ref}
      className={
        "wf" +
        (interactive ? " wf--seek" : "") +
        (disabled ? " wf--off" : "") +
        (dragging ? " wf--drag" : "")
      }
      style={{ height, "--accent": accent }}
      onPointerDown={interactive ? onDown : undefined}
      onPointerMove={interactive ? (e) => !dragging && setHoverFrac(fracFromClient(e.clientX)) : undefined}
      onPointerLeave={interactive ? () => !dragging && setHoverFrac(null) : undefined}
      role={interactive ? "slider" : undefined}
      aria-valuemin={interactive ? 0 : undefined}
      aria-valuemax={interactive ? 100 : undefined}
      aria-valuenow={interactive ? Math.round(progress * 100) : undefined}
      aria-label={interactive ? hint : undefined}
    >
      <div className="wf-bars">
        {wfData.map((v, i) => {
          const f = i / bars;
          const played = f < progress;
          const hovered = hoverFrac != null && f < hoverFrac && !played;
          const pulse = playing && played ? 0.92 + 0.08 * Math.sin((tick + i * 7) * 0.18) : 1;
          return (
            <span
              key={i}
              className={"wf-bar" + (played ? " wf-bar--on" : "") + (hovered ? " wf-bar--hov" : "")}
              style={{ height: `${Math.max(4, v * height * pulse)}px` }}
            />
          );
        })}
      </div>
      {interactive && (
        <span className="wf-head" style={{ left: `${progress * 100}%` }} aria-hidden="true">
          <span className="wf-head-thumb" />
        </span>
      )}
      {interactive && hoverFrac != null && !dragging && (
        <span className="wf-hover" style={{ left: `${hoverFrac * 100}%` }} aria-hidden="true" />
      )}
    </div>
  );
}

// Volume compact ──────────────────────────────────────────────────────────
// 3 tailles : "lg" (player principal), "md" (project row), "sm" (loose card).
// L'icône clic = mute. Le slider fin se déploie au hover/focus.
function Volume({ value, onChange, muted, onToggleMute, size = "md", lang, open = false }) {
  const display = muted ? 0 : value;
  const Icon = muted || value === 0 ? VolMute : value < 50 ? VolLow : VolHigh;
  return (
    <div className={"volc volc--" + size + (open ? " volc--open" : "")} aria-hidden={!open}>
      <button
        className="volc-icon"
        onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
        tabIndex={open ? 0 : -1}
        aria-label={muted ? t(data.ui.player.unmute, lang) : t(data.ui.player.mute, lang)}
      >
        <Icon />
      </button>
      <input
        type="range"
        min="0" max="100"
        value={display}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        onClick={(e) => e.stopPropagation()}
        aria-label="Volume"
        tabIndex={open ? 0 : -1}
        className="volc-range"
        style={{ "--vol": `${display}%` }}
      />
    </div>
  );
}

// Play button — adaptable en taille via prop `size` ───────────────────────
function PlayButton({ player, accent, size = "lg", lang }) {
  return (
    <button
      className={"playbtn playbtn--" + size + (!player.available ? " playbtn--off" : "")}
      onClick={(e) => { e.stopPropagation(); player.toggle(); }}
      disabled={!player.available}
      aria-label={player.playing ? t(data.ui.player.pause, lang) : t(data.ui.player.play, lang)}
      title={player.available ? "" : t(data.ui.player.noAudio, lang)}
      style={{ "--accent": accent }}
    >
      {player.loading ? <Spinner /> : player.playing ? <PauseIcon /> : <PlayIcon />}
    </button>
  );
}

// SmartPoster : vidéo HTML5 visible si project.video, sinon miniature.
function SmartPoster({ project, visual = true }) {
  const videoRef = useRef(null);
  const src = window.getSource(project);
  const key = src && src.key;
  const isVideo = visual && !!project.video;

  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    const el = videoRef.current;
    window.__Audio.registerVideo(key, el);
    return () => window.__Audio.unregisterVideo(key, el);
  }, [key, isVideo]);

  if (isVideo) {
    const showThumb = !window.__Audio.hasVisual(key);
    return (
      <>
        <video ref={videoRef} src={project.video} poster={project.poster || undefined} playsInline preload="metadata" className="smart-poster smart-poster--video"></video>
        {showThumb && project.poster && <img src={project.poster} alt="" className="smart-poster smart-poster--cover" aria-hidden="true" />}
      </>
    );
  }
  return <SmartPosterImage project={project} />;
}

// Contrôles qui se réduisent en point pendant la lecture d'une vidéo.
// Réapparaissent au survol / mouvement, se masquent après 2,5 s d'inactivité.
function useAutoHide(active) {
  const [awake, setAwake] = useState(false);
  const timer = useRef(null);
  const wake = () => {
    setAwake(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setAwake(false), 2500);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  // Au lancement : l'interface reste visible, puis se masque après 2,5 s d'inactivité
  useEffect(() => {
    if (active) wake();
    else { setAwake(false); clearTimeout(timer.current); }
  }, [active]);
  const mini = active && !awake;
  return {
    mini,
    frameProps: {
      onPointerMove: active ? wake : undefined,
      onPointerDown: active ? wake : undefined,
      onPointerLeave: active ? () => { clearTimeout(timer.current); setAwake(false); } : undefined,
      onFocus: active ? wake : undefined,
    },
  };
}

// Image classique (YouTube thumbnail → poster local → art généré)
function SmartPosterImage({ project }) {
  const ytSrc = project.youtube ? window.ytThumb(project.youtube, "maxres") : null;
  const local = project.poster;
  const [src, setSrc] = useState(local || ytSrc || null);
  const [stage, setStage] = useState(local ? "local" : ytSrc ? "yt-max" : "art");

  useEffect(() => {
    const next = project.poster || (project.youtube ? window.ytThumb(project.youtube, "maxres") : null);
    setSrc(next);
    setStage(project.poster ? "local" : project.youtube ? "yt-max" : "art");
  }, [project.id]);

  const onError = () => {
    if (stage === "yt-max") { setStage("yt-hq"); setSrc(window.ytThumb(project.youtube, "hq")); return; }
    if (stage === "local" && project.youtube) { setStage("yt-max"); setSrc(window.ytThumb(project.youtube, "maxres")); return; }
    setStage("art"); setSrc(null);
  };

  if (src) {
    return <img src={src} alt="" loading="lazy" decoding="async" onError={onError} className="smart-poster" />;
  }
  return <PosterArt seed={project.id} hue={project.hue} />;
}

// Placeholder art quand pas d'image ────────────────────────────────────────
function PosterArt({ seed, hue }) {
  const bars = useMemo(() => gen(seed + "_poster", 28), [seed]);
  return (
    <div
      className="poster-art"
      style={{
        background: `linear-gradient(135deg, oklch(0.22 0.04 ${hue}) 0%, oklch(0.14 0.03 ${hue}) 60%, oklch(0.1 0.02 ${hue}) 100%)`,
      }}
    >
      <div className="poster-art-bars">
        {bars.map((v, i) => (
          <span key={i} style={{ height: `${v * 100}%`, background: `oklch(0.7 0.14 ${hue} / ${0.22 + v * 0.45})` }} />
        ))}
      </div>
    </div>
  );
}

// Hero ─────────────────────────────────────────────────────────────────────
function Hero({ accent, lang }) {
  const lines = data.hero.lines[lang];
  return (
    <section className="hero" data-screen-label="01 Hero">
      <div className="hero-bg" aria-hidden="true">
        <div className="hero-bg-grid" />
      </div>

      <div className="hero-grid">
        <div className="hero-left">
          <h1 className="display">
            {lines.map((line, i) => (
              <span key={i} className={"display-line" + (i % 2 === 1 ? " display-italic" : "")}>
                {line}
              </span>
            ))}
          </h1>


          <div className="hero-cta">
            <a className="btn btn--primary" href="#projets" style={{ "--accent": accent }}>
              <span>{t(data.hero.cta, lang)}</span>
              <Arrow />
            </a>
            <a className="btn btn--ghost" href="#contact">
              <span>{t(data.hero.ctaAlt, lang)}</span>
            </a>
          </div>
        </div>

        <div className="hero-right">
          <ShowreelPlayer project={data.showreel} accent={accent} lang={lang} />
        </div>
      </div>

    </section>
  );
}

// Featured player (hero) ──────────────────────────────────────────────────
function ShowreelPlayer({ project, accent, lang }) {
  const player = usePlayer(project);
  const hide = useAutoHide(player.playing && player.kind === "video");
  const fmt = window.formatTime;
  const open = player.isCurrent;
  return (
    <div className="player" style={{ "--accent": accent }}>
      <h2 className="player-title">{project.title}</h2>
      <div className={"player-poster" + (hide.mini ? " is-mini" : "")} {...hide.frameProps}>
        <SmartPoster project={project} />
        <div className="poster-controls">
          <PlayButton player={player} accent={accent} size="lg" lang={lang} />
          <Volume value={player.volume} muted={player.muted} onChange={player.setVolume} onToggleMute={player.toggleMute} open={player.playing} size="lg" lang={lang} />
        </div>
      </div>
      <div className={"reveal" + (open ? " reveal--open" : "")} aria-hidden={!open}>
        <div className="reveal-inner">
          <div className="player-wave">
            <Waveform seed={project.id + "_hi"} peaks={project.peaks} bars={84} progress={player.progress} playing={player.playing} height={56} accent={accent} onSeek={open ? player.seekFrac : undefined} hint={t(data.ui.player.hint, lang)} />
            <div className="player-time mono small">
              <span>{fmt(player.time)}</span>
              <span className="muted">{player.duration ? fmt(player.duration) : project.duration}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Project rows (accordéon) ────────────────────────────────────────────────
function ProjectRow({ project, accent, lang }) {
  const [open, setOpen] = useState(false);
  const player = usePlayer(project);
  const hide = useAutoHide(player.playing && player.kind === "video");
  const fmt = window.formatTime;
  const tracksLabel = project.tracks > 1
    ? t(data.ui.projectsSection.tracksMany, lang)
    : t(data.ui.projectsSection.tracksOne, lang);

  return (
    <article className={"prow" + (open ? " prow--open" : "") + (player.playing ? " prow--live" : "")} data-screen-label={`P ${project.title}`}>
      <button className="prow-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="prow-year mono">{project.year}</span>
        <span className="prow-title">
          {project.title}
          {player.playing && <span className="prow-livedot" style={{ background: accent }} aria-hidden="true" />}
        </span>
        <span className="prow-tag mono small muted">{t(project.tag, lang)}</span>
        <span className="prow-tracks mono small muted">{project.duration}</span>
        <span className="prow-toggle" aria-hidden="true">
          <span style={{ background: accent }} />
        </span>
      </button>

      {open && (
        <div className="prow-body">
          <div className="prow-body-left">
            <p className="prow-pitch">{t(project.pitch, lang)}</p>
            <ul className="prow-meta">
              {t(project.meta, lang).map((m, i) => (
                <li key={i}><span className="mono small muted">/</span> {m}</li>
              ))}
            </ul>
            {project.youtube && (
              <a className="prow-ytlink mono small" href={`https://youtu.be/${project.youtube}`} target="_blank" rel="noreferrer">
                <span>{t(data.ui.player.onYoutube, lang)}</span>
                <ExtIcon />
              </a>
            )}
          </div>

          <div className="prow-body-right">
            <div className={"prow-poster" + (hide.mini ? " is-mini" : "")} {...hide.frameProps}>
              <SmartPoster project={project} />
              <div className="prow-poster-controls">
                <PlayButton player={player} accent={accent} size="md" lang={lang} />
                {player.available && (
                  <Volume
                    value={player.volume}
                    muted={player.muted}
                    onChange={player.setVolume}
                    onToggleMute={player.toggleMute}
                    open={player.playing}
                    size="md"
                    lang={lang}
                  />
                )}
              </div>
            </div>
            <div className="prow-scrub">
              <Waveform
                seed={project.id + "_row"}
                peaks={project.peaks}
                bars={56}
                progress={player.progress}
                playing={player.playing}
                height={36}
                accent={accent}
                onSeek={player.available ? player.seekFrac : undefined}
                hint={t(data.ui.player.hint, lang)}
              />
              <span className="prow-time mono small muted">
                {player.isCurrent ? `${fmt(player.time)} / ${fmt(player.duration || 0)}` : project.duration}
              </span>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

// Loose card ──────────────────────────────────────────────────────────────
// La tagline est remplacée par la timeline pendant la lecture.
function LooseCard({ track, lang }) {
  const player = usePlayer(track);
  const accent = accentVar(track.hue);

  return (
    <article
      className={"loose-card" + (player.playing ? " loose-card--live" : "")}
      style={{ "--accent": accent }}
    >
      <div className="loose-card-art">
        <SmartPoster project={track} visual={false} />
        <div className="loose-card-controls">
          <PlayButton player={player} accent={accent} size="sm" lang={lang} />
          {player.available && (
            <Volume
              value={player.volume}
              muted={player.muted}
              onChange={player.setVolume}
              onToggleMute={player.toggleMute}
              open={player.playing}
              size="sm"
              lang={lang}
            />
          )}
        </div>
      </div>

      <div className="loose-card-meta">
        <span className="loose-card-title">{track.title}</span>
        <div className="loose-card-second">
          {player.isCurrent ? (
            <Waveform
              seed={track.id + "_loose"}
              peaks={track.peaks}
              bars={36}
              progress={player.progress}
              playing={player.playing}
              height={20}
              accent={accent}
              onSeek={player.available ? player.seekFrac : undefined}
              hint={t(data.ui.player.hint, lang)}
            />
          ) : (
            <span className="mono small muted">{t(track.tag, lang)}</span>
          )}
        </div>
      </div>
    </article>
  );
}

// About ───────────────────────────────────────────────────────────────────
function About({ accent, lang }) {
  const titleParts = data.about.title[lang];
  return (
    <section className="about" id="apropos" data-screen-label="03 À propos">
      <div className="about-grid">
        <div className="about-left">
          <p className="section-eyebrow mono">{t(data.about.eyebrow, lang)}</p>
          <h2 className="section-title">
            {titleParts.map((p, i) => (
              i % 2 === 1
                ? <span key={i} className="display-italic">{p}</span>
                : <span key={i}>{p}</span>
            ))}
          </h2>
        </div>
        <div className="about-right">
          {data.about.paragraphs[lang].map((p, i) => (
            <p key={i} className={i === 0 ? "lead" : "body"}>{p}</p>
          ))}

          <div className="about-blocks">
            <div className="about-block">
              <p className="kicker mono">{t(data.about.inspirationsLabel, lang)}</p>
              <p className="influences">
                {data.influences.map((n, i) => (
                  <span key={n} className="influence">
                    {n}
                    {i < data.influences.length - 1 && <span className="influence-sep"> · </span>}
                  </span>
                ))}
              </p>
            </div>
            <div className="about-block">
              <p className="kicker mono">{t(data.about.toolsLabel, lang)}</p>
              <ul className="tools">
                {data.artist.tools.map((tool, i) => (
                  <li key={i} className="tool-chip" style={{ "--accent": accent }}>
                    {t(tool, lang)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// Contact ─────────────────────────────────────────────────────────────────
function Contact({ accent, lang }) {
  const titleParts = data.ui.contactSection.title[lang];
  return (
    <section className="contact" id="contact" data-screen-label="05 Contact">
      <p className="section-eyebrow mono">{t(data.ui.contactSection.eyebrow, lang)}</p>

      <h2 className="contact-title">
        {titleParts.map((p, i) => (
          i % 2 === 1
            ? <span key={i} className="display-italic">{p}</span>
            : <span key={i}>{p}</span>
        ))}
      </h2>

      <a className="contact-mail" href={`mailto:${data.links.email}`} style={{ "--accent": accent }}>
        <span>{data.links.email}</span>
        <Arrow />
      </a>

      <ul className="contact-socials" role="list">
        <li><a href={data.links.instagram} target="_blank" rel="noreferrer">Instagram</a></li>
        <li><a href={data.links.youtube} target="_blank" rel="noreferrer">YouTube</a></li>
        <li><a href={data.links.soundcloud} target="_blank" rel="noreferrer">SoundCloud</a></li>
        <li><a href={data.links.spotify} target="_blank" rel="noreferrer">Spotify</a></li>
      </ul>

    </section>
  );
}

// Language toggle ─────────────────────────────────────────────────────────
function LangToggle({ lang, setLang }) {
  return (
    <div className="lang-toggle" role="group" aria-label="Language">
      <button
        className={"lang-btn" + (lang === "en" ? " lang-btn--on" : "")}
        onClick={() => setLang("en")}
        aria-pressed={lang === "en"}
      >EN</button>
      <span className="lang-sep" aria-hidden="true">/</span>
      <button
        className={"lang-btn" + (lang === "fr" ? " lang-btn--on" : "")}
        onClick={() => setLang("fr")}
        aria-pressed={lang === "fr"}
      >FR</button>
    </div>
  );
}

// Header ──────────────────────────────────────────────────────────────────
function Header({ accent, lang, setLang }) {
  return (
    <header className="header">
      <a className="brand" href="#top">
        <span className="brand-dot" aria-hidden="true"></span>
        <span className="brand-name">{data.artist.name}</span>
        <span className="brand-alias mono small muted">— {data.artist.alias}</span>
      </a>
      <nav className="nav">
        <a href="#projets">{t(data.ui.nav.projects, lang)}</a>
        <a href="#apropos">{t(data.ui.nav.about, lang)}</a>
        <a href="#contact">{t(data.ui.nav.contact, lang)}</a>
        <LangToggle lang={lang} setLang={setLang} />
      </nav>
    </header>
  );
}

// Icons ───────────────────────────────────────────────────────────────────
const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <polygon points="3,2 12,7 3,12" fill="currentColor" />
  </svg>
);
const PauseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <rect x="3" y="2" width="3" height="10" fill="currentColor" />
    <rect x="8" y="2" width="3" height="10" fill="currentColor" />
  </svg>
);
const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7h7M7 4l3 3-3 3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const ChevL = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M7.5 2.5L4 6l3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </svg>
);
const ChevR = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
  </svg>
);
const ExtIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden="true">
    <path d="M4 2h5v5M9 2L4 7" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
  </svg>
);
const Spinner = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="spin">
    <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeDasharray="20 12" strokeLinecap="round" />
  </svg>
);
const VolMute = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M2 5h2l3-2v8L4 9H2V5z" fill="currentColor" />
    <path d="M10 5l3 3M13 5l-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
  </svg>
);
const VolLow = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M2 5h2l3-2v8L4 9H2V5z" fill="currentColor" />
    <path d="M9 5.5c.8.7.8 2.3 0 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
  </svg>
);
const VolHigh = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M2 5h2l3-2v8L4 9H2V5z" fill="currentColor" />
    <path d="M9 5.5c.8.7.8 2.3 0 3M11 4c1.5 1.5 1.5 4.5 0 6" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
  </svg>
);

// App ─────────────────────────────────────────────────────────────────────
const ACCENT_OPTIONS = [
  { hue: 295, color: "oklch(0.68 0.14 295)" }, // Purple Pain
  { hue: 24,  color: "oklch(0.68 0.14 24)" },  // Hammond
  { hue: 198, color: "oklch(0.68 0.14 198)" }, // SC-88
  { hue: 142, color: "oklch(0.68 0.14 142)" }, // Lise
];
const hueFromColor = (c) => (ACCENT_OPTIONS.find((o) => o.color === c) || ACCENT_OPTIONS[0]).hue;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentColor": "oklch(0.68 0.14 295)",
  "fontPair": "serif-mono"
}/*EDITMODE-END*/;

function App() {
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [lang, setLang] = useLang();

  const hue = hueFromColor(tw.accentColor);
  const accent = tw.accentColor;
  const projects = data.projects;


  useEffect(() => { document.documentElement.dataset.font = tw.fontPair; }, [tw.fontPair]);
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-soft", accentSoft(hue));
  }, [accent, hue]);

  return (
    <div className="app" id="top">
      <Header accent={accent} lang={lang} setLang={setLang} />

      <Hero accent={accent} lang={lang} />

      <section className="projects" id="projets" data-screen-label="02 Projets">
        <div className="section-head">
          <div>
            <p className="section-eyebrow mono">{t(data.ui.projectsSection.eyebrow, lang)}</p>
            <h2 className="section-title">
              {data.ui.projectsSection.title[lang].map((p, i) => (
                i % 2 === 1
                  ? <span key={i} className="display-italic">{p}</span>
                  : <span key={i}>{p}</span>
              ))}
            </h2>
          </div>
          <p className="lead small">{t(data.ui.projectsSection.sub, lang)}</p>
        </div>
        <div className="prow-list">
          {projects.map((p) => (
            <ProjectRow key={p.id} project={p} accent={accent} lang={lang} />
          ))}
        </div>
      </section>

      <About accent={accent} lang={lang} />

      <section className="loose" id="loose" data-screen-label="04 Pièces libres">
        <div className="section-head">
          <div>
            <p className="section-eyebrow mono">{t(data.ui.looseSection.eyebrow, lang)}</p>
            <h2 className="section-title">
              {data.ui.looseSection.title[lang].map((p, i) => (
                i % 2 === 1
                  ? <span key={i} className="display-italic">{p}</span>
                  : <span key={i}>{p}</span>
              ))}
            </h2>
          </div>
          <p className="lead small">{t(data.ui.looseSection.sub, lang)}</p>
        </div>
        <div className="loose-grid">
          {data.loose.map((tr) => (
            <LooseCard key={tr.id} track={tr} lang={lang} />
          ))}
        </div>
      </section>

      <Contact accent={accent} lang={lang} />

      <footer className="footer">
        <span className="mono small muted">© {new Date().getFullYear()} {data.artist.name} · {data.artist.alias}</span>
        <span className="mono small muted">{t(data.ui.footer, lang)}</span>
      </footer>

      <TweaksPanel title="Tweaks" defaultOpen={false}>
        <TweakSection label="Accent" />
        <TweakColor
          label="Couleur"
          value={tw.accentColor}
          options={ACCENT_OPTIONS.map((o) => o.color)}
          onChange={(v) => setTweak("accentColor", v)}
        />
        <TweakSection label="Typographie" />
        <TweakRadio
          label="Pairing"
          value={tw.fontPair}
          options={["serif-mono", "sans-mono"]}
          onChange={(v) => setTweak("fontPair", v)}
        />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
