/* Settings > Next i18n: add / remove language rows. */
(function () {
  "use strict";

  var table = document.querySelector(".next-i18n-languages tbody");
  var template = document.getElementById("next-i18n-language-row");
  var addButton = document.querySelector(".next-i18n-add-language");
  if (!table || !template || !addButton) return;

  // DeepL needs a regional variant for a few languages
  var VARIANTS = { en: "EN-GB", pt: "PT-PT", zh: "ZH-HANS" };

  addButton.addEventListener("click", function () {
    // Unique index so the new row never collides with existing ones
    var html = template.innerHTML.replace(/__INDEX__/g, String(Date.now()));
    table.insertAdjacentHTML("beforeend", html);
    var code = table.lastElementChild.querySelector('[data-role="code"]');
    if (code) code.focus();
  });

  table.addEventListener("click", function (event) {
    var button = event.target.closest(".next-i18n-remove-language");
    if (button) button.closest("tr").remove();
  });

  // Pre-select the DeepL language from the code, if the admin hasn't chosen one
  table.addEventListener("change", function (event) {
    if (event.target.getAttribute("data-role") !== "code") return;
    var row = event.target.closest("tr");
    var select = row.querySelector('[data-role="deepl"]');
    if (!select || select.value) return;

    var code = event.target.value.trim();
    var candidates = [
      code.toUpperCase(),
      VARIANTS[code.slice(0, 2).toLowerCase()],
      code.slice(0, 2).toUpperCase(),
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] && select.querySelector('option[value="' + candidates[i] + '"]')) {
        select.value = candidates[i];
        return;
      }
    }
  });
})();
