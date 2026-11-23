/* "Traduzioni" box: fills a language's fields from DeepL. Nothing is saved until the post is saved. */
(function () {
  "use strict";

  var cfg = window.NextI18n;
  if (!cfg) return;

  document.addEventListener("click", function (event) {
    var button = event.target.closest(".next-i18n-translate");
    if (!button) return;
    event.preventDefault();

    var box = button.closest(".next-i18n-locale");
    var status = box.querySelector(".next-i18n-status");
    var field = function (name) {
      return box.querySelector('[data-field="' + name + '"]');
    };

    var hasText = ["title", "excerpt", "content"].some(function (name) {
      var el = field(name);
      return el && el.value.trim() !== "";
    });
    if (hasText && !window.confirm(cfg.i18n.overwrite)) return;

    button.disabled = true;
    status.classList.remove("is-error");
    status.textContent = cfg.i18n.working;

    var body = new URLSearchParams({
      action: "next_i18n_translate",
      nonce: cfg.nonce,
      post_id: button.getAttribute("data-post"),
      locale: button.getAttribute("data-locale"),
    });

    fetch(cfg.ajaxUrl, { method: "POST", credentials: "same-origin", body: body })
      .then(function (response) {
        return response.json();
      })
      .then(function (json) {
        if (!json || !json.success) {
          throw new Error((json && json.data && json.data.message) || cfg.i18n.error);
        }
        ["title", "slug", "excerpt", "content"].forEach(function (name) {
          var el = field(name);
          if (el) el.value = json.data[name] || "";
        });
        box.querySelector(".next-i18n-by").value = "deepl";
        var reviewed = field("reviewed");
        if (reviewed) reviewed.checked = false;
        status.textContent = cfg.i18n.done;
      })
      .catch(function (error) {
        status.classList.add("is-error");
        status.textContent = error.message || cfg.i18n.error;
      })
      .finally(function () {
        button.disabled = false;
      });
  });
})();
