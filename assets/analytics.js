// Umami events for no-ads.games. The tracker script in <head> records page views, referrers and UTM tags;
// this adds what people do on the page. Nothing runs if the tracker is blocked or missing.
(() => {
  const track = (name, data) => window.umami?.track(name, data);

  // Clicks on anything with data-event; its other data-* attributes become the event data.
  // Fire and forget: Umami sends with keepalive, so the event survives the jump to the App Store.
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target.closest("[data-event]");
      if (!el) return;
      const { event, ...data } = el.dataset;
      track(event, data);
    },
    { capture: true },
  );

  // How far people get: each game band counts once per visit, when 40% of it is on screen.
  if (!("IntersectionObserver" in window)) return;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        track("game-viewed", { game: entry.target.id });
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.4 },
  );
  document.querySelectorAll("section.game[id]").forEach((section) => observer.observe(section));
})();
