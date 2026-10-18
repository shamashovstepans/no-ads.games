// Mini games: "Try it here" opens a game's toy (toys/<game>/) in a dialog, full screen on phones.
// Closing removes the iframe, which stops the toy and its sound. Toys report back with postMessage:
// { source: "nag-toy", game, type: "ready" | "start" | "end" | "cta" | "like", score? }
(() => {
  const player = document.querySelector(".toy-player");
  const launchers = document.querySelectorAll("[data-toy]");
  if (!player || !launchers.length) return;
  const close = player.querySelector(".toy-player__close");
  let frame, launcher;

  function open(button) {
    launcher = button;
    frame = document.createElement("iframe");
    frame.className = "toy-player__frame";
    frame.src = button.dataset.src;
    frame.title = `${button.dataset.name} mini game`;
    frame.allow = "autoplay";
    // Focus lives inside the toy, so the dialog never sees Escape; listen in the (same-origin) frame too
    frame.addEventListener("load", () => {
      try {
        frame.contentWindow.addEventListener("keydown", (e) => e.key === "Escape" && player.close());
      } catch {}
    });
    player.append(frame);
    player.showModal();
    frame.focus();
    window.umami?.track("toy-open", { game: button.dataset.toy });
  }

  player.addEventListener("close", () => {
    frame?.remove();
    frame = null;
    launcher?.focus({ preventScroll: true });
  });
  close.addEventListener("click", () => player.close());
  // a tap on the dimmed backdrop (desktop) closes too
  player.addEventListener("click", (e) => {
    if (e.target === player) player.close();
  });
  launchers.forEach((button) => button.addEventListener("click", () => open(button)));

  addEventListener("message", (e) => {
    if (!frame || e.source !== frame.contentWindow || e.data?.source !== "nag-toy") return;
    const { type, game, score } = e.data;
    if (type === "start") window.umami?.track("toy-start", { game });
    if (type === "end") window.umami?.track("toy-end", { game, score });
    if (type === "cta") window.umami?.track("toy-cta", { game });
    if (type === "like") window.nagLikes?.like(game);
  });
})();
