// Likes: one heart per visitor per game, counts shared through the likes service (server/ in this repo).
// Each game celebrates a like in its own style: Drift drifts a car around the heart, Pocket Cosmo pulls
// stardust into a star, Pocket Metropolis pops out little houses. Sound follows the toys' shared switch.
(() => {
  const API = "https://likes-production-c4ae.up.railway.app";
  const buttons = new Map([...document.querySelectorAll("[data-like]")].map((b) => [b.dataset.like, b]));
  if (!buttons.size || !window.fetch) return;

  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const uuid = () =>
    crypto.randomUUID?.() ??
    "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
      (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
  let visitor = store.get("nag.visitor");
  if (!visitor) store.set("nag.visitor", (visitor = uuid()));

  const state = {}; // game -> { count, liked, busy }
  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  function render(game) {
    const button = buttons.get(game);
    const { count, liked } = state[game];
    button.setAttribute("aria-pressed", String(liked));
    // "♥ 0" reads as nobody cares; a fresh heart just says Like
    button.querySelector(".like__count").textContent = count ? compact.format(count) : "Like";
    const name = button.dataset.name;
    button.setAttribute("aria-label", `${liked ? "Liked" : "Like"} ${name}, ${count} ${count === 1 ? "like" : "likes"}`);
  }

  const api = (path, method = "GET") =>
    fetch(API + path, { method, headers: { "X-Visitor": visitor } }).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });

  async function setLiked(game, liked) {
    const s = state[game];
    if (!s || s.busy || s.liked === liked) return;
    s.busy = true;
    const before = { count: s.count, liked: s.liked };
    Object.assign(s, { liked, count: Math.max(0, s.count + (liked ? 1 : -1)) });
    render(game);
    if (liked) celebrate(game, buttons.get(game));
    window.umami?.track(liked ? "like" : "unlike", { game });
    try {
      const saved = await api(`/likes/${game}`, liked ? "PUT" : "DELETE");
      Object.assign(s, { liked: saved.liked, count: saved.count });
    } catch {
      Object.assign(s, before);
      buttons.get(game).animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }],
        { duration: 260 });
    }
    s.busy = false;
    render(game);
  }

  // Toys (and anything else) can like a game: the Pocket Metropolis toy's "I want this game" button does.
  window.nagLikes = { like: (game) => setLiked(game, true) };

  api("/likes")
    .then(({ counts, liked }) => {
      for (const [game, button] of buttons) {
        state[game] = { count: counts[game] ?? 0, liked: liked.includes(game), busy: false };
        render(game);
        button.hidden = false;
        button.addEventListener("click", () => setLiked(game, !state[game].liked));
      }
    })
    .catch(() => {}); // service unreachable: the buttons stay hidden

  // --- Celebrations -------------------------------------------------------------------------------

  function celebrate(game, button) {
    playSound(game);
    const heart = button.querySelector(".like__heart");
    heart.animate([{ transform: "scale(1)" }, { transform: "scale(1.35)" }, { transform: "scale(1)" }],
      { duration: 420, easing: "cubic-bezier(.3,1.6,.5,1)" });
    if (reducedMotion.matches) return;
    const fx = document.createElement("span");
    fx.className = "like-fx";
    fx.setAttribute("aria-hidden", "true");
    button.append(fx);
    const done = (game === "drift-survivors" ? driftLoop : game === "pocket-cosmo" ? stardust : houses)(fx, button);
    setTimeout(() => fx.remove(), done);
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  // A little car drifts one loop around the button, leaving a neon skid trail
  function driftLoop(fx, button) {
    const w = button.offsetWidth + 44, h = button.offsetHeight + 32;
    const rx = w / 2, ry = h / 2;
    const d = `M ${0},${ry} A ${rx},${ry} 0 1,1 ${w},${ry} A ${rx},${ry} 0 1,1 ${0},${ry}`;
    fx.style.cssText = `width:${w}px;height:${h}px;left:${-22}px;top:${-16}px`;
    fx.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible">
      <defs><linearGradient id="skid" x1="0" x2="1"><stop offset="0" stop-color="#ff3d8b"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>
      <path d="${d}" fill="none" stroke="url(#skid)" stroke-width="4" stroke-linecap="round"/></svg>`;
    const trail = fx.querySelector("path");
    const length = trail.getTotalLength();
    trail.style.strokeDasharray = length;
    trail.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 760, easing: "ease-in-out", fill: "forwards" });
    trail.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, delay: 720, fill: "forwards" });
    if (CSS.supports("offset-path", 'path("M0,0 L1,1")')) {
      const car = document.createElement("i");
      car.className = "fx-car";
      car.style.offsetPath = `path("${d}")`;
      fx.append(car);
      car.animate(
        [
          { offsetDistance: "0%", rotate: "0deg" },
          { offsetDistance: "45%", rotate: "-28deg" },
          { offsetDistance: "100%", rotate: "-14deg", opacity: 1 },
        ],
        { duration: 760, easing: "ease-in-out", fill: "forwards" });
      car.animate([{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.6 }], { duration: 260, delay: 760, fill: "forwards" });
    }
    return 1200;
  }

  // Stardust spirals into the heart, which flashes into a star
  function stardust(fx) {
    const colours = ["#9c7bff", "#ff9bd8", "#e9c27b", "#c9b8ff"];
    for (let i = 0; i < 16; i++) {
      const dot = document.createElement("i");
      dot.className = "fx-dot";
      dot.style.background = colours[i % colours.length];
      const a = (i / 16) * Math.PI * 2, r = rand(46, 70), turn = 1.1;
      const at = (radius, angle) => `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`;
      dot.animate(
        [
          { transform: `${at(r, a)} scale(1)`, opacity: 0 },
          { transform: `${at(r * 0.55, a + turn * 0.6)} scale(1)`, opacity: 1, offset: 0.5 },
          { transform: `${at(0, a + turn)} scale(0.3)`, opacity: 1 },
        ],
        { duration: 620, delay: i * 18, easing: "cubic-bezier(.5,0,.75,1)", fill: "forwards" });
      fx.append(dot);
    }
    const star = document.createElement("i");
    star.className = "fx-star";
    star.animate([{ transform: "scale(0) rotate(0)" }, { transform: "scale(1.4) rotate(30deg)" }, { transform: "scale(0) rotate(60deg)" }],
      { duration: 520, delay: 640, easing: "ease-out", fill: "both" });
    const ring = document.createElement("i");
    ring.className = "fx-ring";
    ring.animate([{ transform: "scale(.3)", opacity: 0.9 }, { transform: "scale(2.2)", opacity: 0 }],
      { duration: 620, delay: 640, easing: "ease-out", fill: "both" });
    fx.append(star, ring);
    return 1350;
  }

  // Little houses and settlers pop out of the heart and tumble away
  function houses(fx) {
    const roofs = ["#d9532f", "#e8873a", "#8a4b33", "#5a6478", "#c94a6a"];
    const people = ["#2f6fd6", "#e8b62c", "#3aa66b", "#d64545", "#7a4fd0"];
    for (let i = 0; i < 12; i++) {
      const isHouse = i < 7;
      const el = document.createElement("i");
      el.className = isHouse ? "fx-house" : "fx-settler";
      el.style.setProperty("--c", isHouse ? roofs[i % roofs.length] : people[i % people.length]);
      const dx = rand(-80, 80), up = rand(isHouse ? 55 : 30, isHouse ? 95 : 60), spin = rand(-40, 40);
      el.animate(
        [
          { transform: "translate(0,0) scale(.2) rotate(0deg)", opacity: 0 },
          { transform: `translate(${dx * 0.55}px,${-up}px) scale(1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.45 },
          { transform: `translate(${dx}px,${-up * 0.35 + 24}px) scale(1) rotate(${spin}deg)`, opacity: 0 },
        ],
        { duration: rand(820, 1000), delay: i * 30, easing: "cubic-bezier(.2,.7,.4,1)", fill: "forwards" });
      fx.append(el);
    }
    return 1400;
  }

  // --- Sound: synthesised, only ever started by the tap itself -------------------------------------

  let audio;
  function playSound(game) {
    if (store.get("nag.sound") === "off") return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      audio.resume?.();
      const out = audio.createGain();
      out.gain.value = 0.22;
      out.connect(audio.destination);
      ({ "drift-survivors": vroom, "pocket-cosmo": chime, "pocket-metropolis": pops })[game](audio, out, audio.currentTime);
    } catch {}
  }

  function envelope(ctx, out, t, attack, hold, release, peak = 1) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    g.connect(out);
    return g;
  }

  function noise(ctx, seconds) {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }

  // Engine rev up and back, with a short tyre squeal
  function vroom(ctx, out, t) {
    const engine = ctx.createOscillator();
    engine.type = "sawtooth";
    engine.frequency.setValueAtTime(70, t);
    engine.frequency.exponentialRampToValueAtTime(210, t + 0.32);
    engine.frequency.exponentialRampToValueAtTime(110, t + 0.8);
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(500, t);
    lowpass.frequency.linearRampToValueAtTime(1400, t + 0.32);
    lowpass.frequency.linearRampToValueAtTime(600, t + 0.8);
    engine.connect(lowpass).connect(envelope(ctx, out, t, 0.04, 0.5, 0.35, 0.7));
    engine.start(t);
    engine.stop(t + 0.95);
    const squeal = noise(ctx, 0.4);
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 2600;
    band.Q.value = 6;
    squeal.connect(band).connect(envelope(ctx, out, t + 0.25, 0.03, 0.15, 0.2, 0.35));
    squeal.start(t + 0.25);
  }

  // Two soft bell notes and a shimmer, like grains landing home
  function chime(ctx, out, t) {
    // timed to land as the star flashes
    [[1318.5, 0.62, 0.5], [1975.5, 0.66, 0.5], [2637, 0.72, 0.25]].forEach(([freq, delay, peak]) => {
      const start = t + delay, bell = ctx.createOscillator();
      bell.type = "sine";
      bell.frequency.value = freq;
      bell.connect(envelope(ctx, out, start, 0.01, 0.02, 1.1, peak));
      bell.start(start);
      bell.stop(start + 1.3);
    });
    const swirl = noise(ctx, 0.65);
    const hp = ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.setValueAtTime(600, t);
    hp.frequency.exponentialRampToValueAtTime(4200, t + 0.6);
    swirl.connect(hp).connect(envelope(ctx, out, t, 0.3, 0.1, 0.25, 0.18));
    swirl.start(t);
  }

  // Quick pops as each house appears, then a little bell
  function pops(ctx, out, t) {
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.07, pop = ctx.createOscillator();
      pop.type = "sine";
      pop.frequency.setValueAtTime(rand(700, 1000), at);
      pop.frequency.exponentialRampToValueAtTime(rand(200, 300), at + 0.09);
      pop.connect(envelope(ctx, out, at, 0.005, 0.01, 0.08, 0.6));
      pop.start(at);
      pop.stop(at + 0.12);
    }
    const bell = ctx.createOscillator();
    bell.type = "triangle";
    bell.frequency.value = 1568;
    bell.connect(envelope(ctx, out, t + 0.5, 0.01, 0.02, 0.7, 0.4));
    bell.start(t + 0.5);
    bell.stop(t + 1.3);
  }
})();
