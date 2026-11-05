// petya.ai
// 1. Gameplay loops play only while on screen (stills instead when motion is reduced).
// 2. On the library page, tapping a game opens its page at once: the page is already in index.html
//    as a <template>, and the phone you tapped moves into it and keeps playing. The address changes
//    to /games/<id>/, and Back returns to the library where you left it.
// 3. Hearts, shared through the no-ads.games likes service. If that service can't be reached (or
//    doesn't allow this address yet), hearts still work and are remembered on this device, without counts.
// 4. A tap on the logo makes the cheetah shake its head, as pointing at it does (that part is CSS).
// 5. Analytics events, when the page has the Umami tracker (build.mjs): App Store taps, support and
//    privacy links, likes. Umami counts page views by itself, games opened in place included.
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /* ---------- Gameplay loops ---------- */

  const play = (v) => {
    const p = v.play();
    if (p) p.catch(() => {}); // Low Power Mode and similar can refuse autoplay; the poster stays
  };
  const onScreen = new Set();
  const io =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const { target, isIntersecting } of entries) {
              if (isIntersecting) {
                onScreen.add(target);
                if (!reduce.matches && !document.hidden) play(target);
              } else {
                onScreen.delete(target);
                target.pause();
              }
            }
          },
          { threshold: 0.2 },
        )
      : null;

  function watchVideos(root = document) {
    for (const v of $$("video[data-loop]", root)) {
      if (v.dataset.watched) continue;
      v.dataset.watched = "1";
      if (reduce.matches) v.poster = v.dataset.still;
      if (io) io.observe(v);
      else if (!reduce.matches) play(v);
    }
  }

  function applyMotion() {
    for (const v of $$("video[data-loop]")) {
      if (reduce.matches) {
        v.pause();
        v.poster = v.dataset.still;
      } else if (!io || onScreen.has(v)) {
        play(v);
      }
    }
  }

  // With reduced motion nothing plays by itself; the big phone on a game page gets a button instead.
  function addClipToggle(root = document) {
    if (!reduce.matches) return;
    for (const v of $$(".phone-wrap--main video[data-loop]", root)) {
      const screen = v.parentElement;
      if (screen.querySelector(".clip-toggle")) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "clip-toggle";
      button.textContent = v.paused ? "Play clip" : "Pause clip";
      button.addEventListener("click", () => (v.paused ? play(v) : v.pause()));
      v.onplay = () => (button.textContent = "Pause clip");
      v.onpause = () => (button.textContent = "Play clip");
      screen.append(button);
    }
  }

  watchVideos();
  addClipToggle();
  reduce.addEventListener?.("change", applyMotion);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) $$("video[data-loop]").forEach((v) => v.pause());
    else applyMotion();
  });

  /* ---------- Hearts ---------- */

  const API = document.documentElement.dataset.likesApi;
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  // On no-ads.games a returning visitor already has an id from the old landing page ("nag.visitor").
  // Keeping it keeps their likes: the service knows the hearts by that id.
  let visitor = store.get("petya.visitor") || store.get("nag.visitor");
  if (visitor) store.set("petya.visitor", visitor);
  else {
    visitor = crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    store.set("petya.visitor", visitor);
  }
  let saved;
  try { saved = new Set(JSON.parse(store.get("petya.liked") || "[]")); } catch { saved = new Set(); }
  const keep = () => store.set("petya.liked", JSON.stringify([...saved]));

  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  // per game: liked = what the visitor sees now; count = null until the service answers; remote = the service knows it
  const state = {};
  const likeState = (id) => (state[id] ??= { liked: saved.has(id), count: null, remote: false });

  function renderLike(id, pop = false) {
    const { liked, count } = likeState(id);
    for (const b of $$(`button[data-like="${id}"]`)) {
      const name = b.dataset.name;
      b.setAttribute("aria-pressed", String(liked));
      b.setAttribute(
        "aria-label",
        count == null
          ? `${liked ? "Liked" : "Like"} ${name}`
          : `${liked ? "Liked" : "Like"} ${name}, ${count} ${count === 1 ? "like" : "likes"}`,
      );
      // "0" reads as nobody cares; a fresh heart just says Like
      b.querySelector(".like__count").textContent = count ? compact.format(count) : liked ? "Liked" : "Like";
      if (pop && !reduce.matches) {
        b.classList.remove("is-popping");
        void b.offsetWidth; // restart the animation
        b.classList.add("is-popping");
      }
    }
  }
  const syncLikes = (root = document) =>
    new Set($$("button[data-like]", root).map((b) => b.dataset.like)).forEach((id) => renderLike(id));

  const api = (path, method = "GET") =>
    fetch(API + path, { method, headers: { "X-Visitor": visitor } }).then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });

  // Requests go one at a time, so quick double taps are never dropped or reordered.
  let queue = Promise.resolve();
  function toggleLike(id) {
    const s = likeState(id);
    s.liked = !s.liked;
    if (s.count != null) s.count = Math.max(0, s.count + (s.liked ? 1 : -1));
    if (s.liked) saved.add(id);
    else saved.delete(id);
    keep();
    renderLike(id, s.liked);
    window.umami?.track(s.liked ? "like" : "unlike", { game: id });
    if (!s.remote) return;
    const want = s.liked;
    queue = queue
      .then(() => api(`/likes/${id}`, want ? "PUT" : "DELETE"))
      .then((r) => {
        if (likeState(id).liked === want && typeof r.count === "number") {
          s.count = r.count;
          renderLike(id);
        }
      })
      .catch(() => {});
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("button[data-like]");
    if (b) toggleLike(b.dataset.like);
  });
  document.addEventListener("animationend", (e) => e.target.closest?.(".like")?.classList.remove("is-popping"));
  syncLikes();

  if (API && window.fetch && document.querySelector("[data-like]")) {
    api("/likes")
      .then(({ counts = {}, liked = [] }) => {
        const mine = new Set(liked);
        for (const [id, count] of Object.entries(counts)) {
          if (typeof count !== "number") continue;
          Object.assign(likeState(id), { remote: true, count, liked: mine.has(id) });
          if (mine.has(id)) saved.add(id);
          else saved.delete(id);
        }
        keep();
        syncLikes();
      })
      .catch(() => {});
  }

  /* ---------- Analytics ---------- */

  // Anything with data-event sends that event when tapped; its other data-* attributes are the event's
  // data. Capture phase and fire-and-forget, so the event goes out before the App Store opens.
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest?.("[data-event]");
      if (!el) return;
      const { event, ...data } = el.dataset;
      window.umami?.track(event, data);
    },
    { capture: true },
  );

  /* ---------- Logo ---------- */

  // The cheetah shakes its head when the logo is pointed at (CSS :hover). Touch screens have no hover,
  // so there a tap on the library's logo does it.
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    const svg = e.target.closest?.(".logo svg");
    if (!svg) return;
    svg.classList.remove("is-wiggling");
    void svg.getBoundingClientRect(); // restart the wiggle if it is already running
    svg.classList.add("is-wiggling");
  });
  document.addEventListener("animationend", (e) => {
    if (e.animationName === "head-wiggle") e.target.closest?.("svg")?.classList.remove("is-wiggling");
  });

  /* ---------- Instant game pages (library page only) ---------- */

  const home = document.getElementById("home");
  const view = document.getElementById("view");
  const templates = new Map($$("template[data-game]").map((t) => [t.dataset.game, t]));
  if (!home || !view || !templates.size) return;

  const homeTitle = document.title;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const homeTheme = themeMeta && themeMeta.content;
  const gameFromPath = (path) => {
    const m = /^\/games\/([a-z0-9-]+)\/?$/.exec(path);
    return m && templates.has(m[1]) ? m[1] : null;
  };
  let current = null; // the open game, or null on the library
  let homeScroll = 0;
  history.scrollRestoration = "manual";
  history.replaceState({ view: "home" }, "");

  const phoneOf = (id) => document.querySelector(`.phone[data-game="${id}"]`);

  // Put the open game's phone back in its tile and empty the view.
  function unmount() {
    const phone = phoneOf(current);
    phone.querySelector(".clip-toggle")?.remove();
    document.querySelector(`[data-home-of="${current}"]`).append(phone);
    view.replaceChildren();
  }

  function showGame(id) {
    if (current) unmount();
    const t = templates.get(id);
    view.replaceChildren(t.content.cloneNode(true));
    view.querySelector("[data-slot]").append(phoneOf(id)); // same element: the clip keeps playing
    home.hidden = true;
    view.hidden = false;
    document.body.className = "game";
    document.body.setAttribute("style", t.dataset.style);
    document.title = t.dataset.title;
    if (themeMeta) themeMeta.content = t.dataset.theme;
    current = id;
    syncLikes(view);
    addClipToggle(view);
    window.scrollTo(0, 0);
  }

  function showHome() {
    if (current) unmount();
    current = null;
    view.hidden = true;
    home.hidden = false;
    document.body.className = "home";
    document.body.removeAttribute("style");
    document.title = homeTitle;
    if (themeMeta) themeMeta.content = homeTheme;
    window.scrollTo(0, homeScroll);
  }

  // Run a DOM change inside a view transition when the browser has them (the phone flies).
  function transition(update, done) {
    if (!document.startViewTransition || reduce.matches || document.hidden) {
      update();
      done();
      return;
    }
    const vt = document.startViewTransition(update);
    vt.ready.catch(() => {}); // a skipped transition is fine: the update still runs
    vt.finished.then(done, done);
  }

  function openGame(id, push) {
    if (id === current) return;
    if (!current) homeScroll = window.scrollY;
    if (push) history.pushState({ view: "game", id }, "", `/games/${id}/`);
    transition(() => showGame(id), () => view.querySelector(".game__title")?.focus({ preventScroll: true }));
  }

  function openHome(push) {
    if (!current) return;
    const from = current;
    if (push) history.pushState({ view: "home" }, "", "/");
    transition(showHome, () => document.querySelector(`.tile__link[href="/games/${from}/"]`)?.focus({ preventScroll: true }));
  }

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest?.("a[href]");
    if (!a || a.target || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    const id = gameFromPath(url.pathname);
    if (id) {
      e.preventDefault();
      openGame(id, true);
    } else if (url.pathname === "/" && current) {
      e.preventDefault();
      openHome(true);
    }
  });

  addEventListener("popstate", () => {
    const id = gameFromPath(location.pathname);
    if (id) openGame(id, false);
    else openHome(false);
  });

  // Once the library has settled, fetch what the game pages show (icons, store shots: a few kB each),
  // and let browsers that allow it buffer the clips that are not on screen yet.
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
  const warm = () =>
    idle(() => {
      const seen = new Set();
      for (const t of templates.values()) {
        for (const img of t.content.querySelectorAll("img[src]")) {
          const src = img.getAttribute("src");
          if (seen.has(src)) continue;
          seen.add(src);
          const pre = new Image();
          pre.decoding = "async";
          pre.src = src;
        }
      }
      for (const v of $$("video[data-loop]")) v.preload = "auto";
    });
  if (document.readyState === "complete") warm();
  else addEventListener("load", warm, { once: true });
})();
