// Likes: one heart per visitor per game, counts shared through the likes service (server/ in this repo).
// Every game celebrates a like the same way, in its own colours: dust spirals into the heart, which
// flashes into a star, with a soft chime. Sound follows the shared switch, localStorage "nag.sound".
(() => {
  const API = "https://likes-production-c4ae.up.railway.app";
  const buttons = new Map([...document.querySelectorAll("[data-like]")].map((b) => [b.dataset.like, b]));
  if (!buttons.size || !window.fetch) return;

  const palettes = {
    "drift-survivors": { dust: ["#ff4d8d", "#ff8a3d", "#ffd166", "#ffffff"], star: "#ffd166", ring: "#ff8a3d" },
    "pocket-cosmo": { dust: ["#9c7bff", "#ff9bd8", "#e9c27b", "#c9b8ff"], star: "#ffe7a8", ring: "#c9b8ff" },
    "pocket-metropolis": { dust: ["#d9532f", "#e8873a", "#4fae4a", "#e8b62c"], star: "#f2b632", ring: "#d9532f" },
  };

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

  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const rand = (a, b) => a + Math.random() * (b - a);

  // Per game: what the server last confirmed (count, saved) and what the visitor wants now (want).
  // Taps change `want` at once; requests catch up one at a time, so rapid taps are never dropped.
  const state = {};
  const shownCount = ({ count, saved, want }) => Math.max(0, count + (want === saved ? 0 : want ? 1 : -1));

  function render(game, roll = 0) {
    const button = buttons.get(game);
    const s = state[game];
    const count = shownCount(s);
    button.setAttribute("aria-pressed", String(s.want));
    button.setAttribute("aria-label", `${s.want ? "Liked" : "Like"} ${button.dataset.name}, ${count} ${count === 1 ? "like" : "likes"}`);
    const label = button.querySelector(".like__count");
    // "♥ 0" reads as nobody cares; a fresh heart just says Like
    const text = count ? compact.format(count) : "Like";
    if (label.textContent === text) return;
    label.textContent = text;
    // the number rolls up on a like and down on an unlike
    if (roll && !reducedMotion.matches) {
      label.animate([{ transform: `translateY(${roll * 60}%)`, opacity: 0 }, { transform: "none", opacity: 1 }],
        { duration: 280, easing: "cubic-bezier(.2,.9,.3,1.25)" });
    }
  }

  const api = (path, method = "GET") =>
    fetch(API + path, { method, headers: { "X-Visitor": visitor } }).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.json();
    });

  function toggle(game) {
    const s = state[game];
    s.want = !s.want;
    render(game, s.want ? 1 : -1);
    (s.want ? celebrate : deflate)(game, buttons.get(game));
    window.umami?.track(s.want ? "like" : "unlike", { game });
    if (!s.busy) sync(game);
  }

  async function sync(game) {
    const s = state[game];
    s.busy = true;
    while (s.want !== s.saved) {
      try {
        const saved = await api(`/likes/${game}`, s.want ? "PUT" : "DELETE");
        Object.assign(s, { count: saved.count, saved: saved.liked });
      } catch {
        s.want = s.saved; // couldn't save: put the heart back the way the server has it
        buttons.get(game).animate({ translate: ["0", "-5px", "5px", "-3px", "0"] }, { duration: 300 });
      }
    }
    s.busy = false;
    render(game);
  }

  api("/likes")
    .then(({ counts, liked }) => {
      for (const [game, button] of buttons) {
        const has = liked.includes(game);
        state[game] = { count: counts[game] ?? 0, saved: has, want: has, busy: false };
        render(game);
        button.hidden = false;
        button.addEventListener("click", () => toggle(game));
        // squash while the finger or mouse is down; the release bounce comes from celebrate()
        button.addEventListener("pointerdown", () => button.classList.add("is-pressed"));
        for (const type of ["pointerup", "pointerleave", "pointercancel"]) {
          button.addEventListener(type, () => button.classList.remove("is-pressed"));
        }
      }
    })
    .catch(() => {}); // service unreachable: the hearts stay hidden

  // --- Feedback ----------------------------------------------------------------------------------

  function celebrate(game, button) {
    chime();
    if (reducedMotion.matches) return;
    button.animate([{ scale: 1.12, offset: 0.3 }, { scale: 0.96, offset: 0.62 }, { scale: 1 }], { duration: 440, easing: "ease-out" });
    button.querySelector(".like__heart").animate(
      [{ scale: 1.55, rotate: "-12deg", offset: 0.28 }, { scale: 0.92, rotate: "6deg", offset: 0.6 }, { scale: 1, rotate: "0deg" }],
      { duration: 520, easing: "ease-out" });
    stardust(button, palettes[game]);
  }

  function deflate(game, button) {
    if (reducedMotion.matches) return;
    button.animate([{ scale: 0.95, offset: 0.4 }, { scale: 1 }], { duration: 260, easing: "ease-out" });
    button.querySelector(".like__heart").animate([{ scale: 0.7, offset: 0.4 }, { scale: 1 }], { duration: 320, easing: "ease-out" });
  }

  // Dust spirals into the heart, which flashes into a star with a ring
  function stardust(button, { dust, star, ring }) {
    const fx = document.createElement("span");
    fx.className = "like-fx";
    fx.setAttribute("aria-hidden", "true");
    const at = (radius, angle) => `translate(${Math.cos(angle) * radius}px, ${Math.sin(angle) * radius}px)`;
    for (let i = 0; i < 14; i++) {
      const dot = document.createElement("i");
      dot.className = "fx-dot";
      dot.style.background = dust[i % dust.length];
      const a = (i / 14) * Math.PI * 2 + rand(-0.15, 0.15), r = rand(40, 62);
      dot.animate(
        [
          { transform: `${at(r, a)} scale(1)`, opacity: 0 },
          { transform: `${at(r * 0.5, a + 0.6)} scale(1)`, opacity: 1, offset: 0.45 },
          { transform: `${at(0, a + 1)} scale(0.3)`, opacity: 1 },
        ],
        { duration: 380, delay: i * 8, easing: "cubic-bezier(.5,0,.75,1)", fill: "forwards" });
      fx.append(dot);
    }
    const flash = document.createElement("i");
    flash.className = "fx-star";
    flash.style.background = star;
    flash.animate([{ transform: "scale(0) rotate(0)" }, { transform: "scale(1.4) rotate(30deg)" }, { transform: "scale(0) rotate(60deg)" }],
      { duration: 460, delay: 330, easing: "ease-out", fill: "both" });
    const wave = document.createElement("i");
    wave.className = "fx-ring";
    wave.style.borderColor = ring;
    wave.animate([{ transform: "scale(.3)", opacity: 0.9 }, { transform: "scale(2.2)", opacity: 0 }],
      { duration: 520, delay: 330, easing: "ease-out", fill: "both" });
    fx.append(flash, wave);
    button.append(fx);
    setTimeout(() => fx.remove(), 950);
  }

  // A soft whoosh as the dust gathers, then three bell notes as the star flashes
  let audio;
  function chime() {
    if (store.get("nag.sound") === "off") return;
    try {
      audio ??= new (window.AudioContext || window.webkitAudioContext)();
      audio.resume?.();
      const t = audio.currentTime, out = audio.createGain();
      out.gain.value = 0.22;
      out.connect(audio.destination);
      const envelope = (start, attack, hold, release, peak) => {
        const g = audio.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(peak, start + attack);
        g.gain.setValueAtTime(peak, start + attack + hold);
        g.gain.exponentialRampToValueAtTime(0.0001, start + attack + hold + release);
        g.connect(out);
        return g;
      };
      const noise = audio.createBuffer(1, Math.ceil(audio.sampleRate * 0.4), audio.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const whoosh = audio.createBufferSource();
      whoosh.buffer = noise;
      const band = audio.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.setValueAtTime(700, t);
      band.frequency.exponentialRampToValueAtTime(4200, t + 0.35);
      whoosh.connect(band).connect(envelope(t, 0.15, 0.08, 0.15, 0.16));
      whoosh.start(t);
      [[1318.5, 0.32, 0.5], [1975.5, 0.36, 0.45], [2637, 0.42, 0.22]].forEach(([freq, delay, peak]) => {
        const bell = audio.createOscillator();
        bell.type = "sine";
        bell.frequency.value = freq;
        bell.connect(envelope(t + delay, 0.01, 0.02, 1, peak));
        bell.start(t + delay);
        bell.stop(t + delay + 1.2);
      });
    } catch {}
  }
})();
