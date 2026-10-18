// Feedback: the corner button opens a short form. Messages go to the likes service (server/) and are read
// on /inbox/ with the inbox key. A closed form keeps its draft until it's sent.
(() => {
  const API = "https://likes-production-c4ae.up.railway.app";
  const opener = document.querySelector(".feedback-open");
  const dialog = document.querySelector(".feedback");
  if (!opener || !dialog || !window.fetch) return;
  const form = dialog.querySelector(".feedback__form");
  const done = dialog.querySelector(".feedback__done");
  const error = dialog.querySelector(".feedback__error");
  const sendButton = dialog.querySelector(".feedback__send");
  const message = form.elements.message;
  const count = dialog.querySelector(".feedback__count");

  // Squash while pressed, like the hearts
  opener.addEventListener("pointerdown", () => opener.classList.add("is-pressed"));
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) {
    opener.addEventListener(type, () => opener.classList.remove("is-pressed"));
  }

  // Start on the game whose band is in the middle of the screen
  const gameInView = () => {
    const middle = innerHeight / 2;
    const band = [...document.querySelectorAll("section.game[id]")].find((section) => {
      const r = section.getBoundingClientRect();
      return r.top <= middle && r.bottom >= middle;
    });
    return band?.id;
  };

  opener.addEventListener("click", () => {
    form.hidden = false;
    done.hidden = true;
    error.hidden = true;
    const game = gameInView();
    if (game && !message.value) form.querySelector(`input[name="topic"][value="${game}"]`).checked = true;
    dialog.showModal();
    message.focus();
    window.umami?.track("feedback-open");
  });

  dialog.addEventListener("click", (e) => e.target === dialog && dialog.close()); // the backdrop
  dialog.querySelectorAll(".feedback__cancel, .feedback__close").forEach((b) => b.addEventListener("click", () => dialog.close()));

  const showError = (text) => {
    error.textContent = text;
    error.hidden = false;
  };

  message.addEventListener("input", () => {
    error.hidden = true;
    const n = message.value.length;
    count.textContent = n > 1600 ? `${2000 - n} characters left` : "";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = message.value.trim();
    if (text.length < 2) return showError("Write a few words first.");
    const topic = form.elements.topic.value;
    sendButton.disabled = true;
    sendButton.textContent = "Sending…";
    try {
      const response = await fetch(`${API}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          topic,
          email: form.elements.email.value.trim(),
          page: location.pathname,
          website: form.elements.website.value, // hidden; only bots fill it in
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || ""), { status: response.status });
      }
      window.umami?.track("feedback-sent", { topic });
      form.reset();
      count.textContent = "";
      form.hidden = true;
      done.hidden = false;
      done.querySelector(".feedback__close").focus();
    } catch (err) {
      showError(
        err.status === 429 ? "That's a lot of messages from this network. Try again in an hour."
        : err.status && err.message ? `${err.message}.`
        : "Couldn't send. Check your connection and try again.");
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = "Send";
    }
  });
})();
