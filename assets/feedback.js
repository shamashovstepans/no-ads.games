// petya: the corner Feedback button opens a short form (markup from build.mjs). Messages go to the same
// service as the hearts (data-likes-api on <html>) and are read on /inbox/ with the inbox key.
// A closed form keeps its draft until it's sent.
(() => {
  const API = document.documentElement.dataset.likesApi;
  const opener = document.querySelector(".feedback-open");
  const dialog = document.querySelector("dialog.feedback");
  if (!opener || !dialog) return;
  if (!API || !window.fetch || !dialog.showModal) {
    opener.remove(); // nowhere to send it, or no way to show the form
    return;
  }
  const form = dialog.querySelector(".feedback__form");
  const done = dialog.querySelector(".feedback__done");
  const error = dialog.querySelector(".feedback__error");
  const sendButton = form.querySelector(".feedback__send");
  const message = form.elements.message;
  const count = form.querySelector(".feedback__count");

  const showError = (text) => {
    error.textContent = text;
    error.hidden = false;
  };

  opener.addEventListener("click", () => {
    form.hidden = false;
    done.hidden = true;
    error.hidden = true;
    // On a game's page (also one opened in place), start on that game unless there is a draft
    const game = /^\/games\/([a-z0-9-]+)\/?$/.exec(location.pathname)?.[1];
    const chip = game && form.querySelector(`input[name="topic"][value="${game}"]`);
    if (chip && !message.value) chip.checked = true;
    dialog.showModal();
    message.focus();
  });

  // The dialog has no padding of its own, so a click lands on it only outside the form: the backdrop
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  for (const b of dialog.querySelectorAll(".feedback__cancel, .feedback__close")) {
    b.addEventListener("click", () => dialog.close());
  }

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
        err.status === 429 ? "That’s a lot of messages from this network. Try again in an hour."
        : err.status && err.message ? `${err.message}.`
        : "Couldn’t send. Check your connection and try again.",
      );
    } finally {
      sendButton.disabled = false;
      sendButton.textContent = "Send";
    }
  });
})();
