/* Next Tours – product edit screen. */
(function ($) {
  'use strict';

  var counter = 0;

  // --- Repeaters -----------------------------------------------------------
  // <div data-next-tours-repeater>
  //   <… data-rows> rows (each [data-row]) </…>
  //   <template data-template> one row using "__i__" as index </template>
  //   <button data-add>
  function renumber($repeater) {
    $repeater.find('[data-rows] > [data-row]').each(function (index) {
      $(this).find('[data-number]').text(index + 1);
    });
  }

  $(document).on('click', '[data-next-tours-repeater] [data-add]', function (event) {
    event.preventDefault();
    var $repeater = $(this).closest('[data-next-tours-repeater]');
    var template = $repeater.children('template[data-template]').get(0);
    if (!template) return;
    var index = 'n' + Date.now().toString(36) + (counter++);
    var html = template.innerHTML.replace(/__i__/g, index);
    var $row = $(html);
    $repeater.find('[data-rows]').first().append($row);
    renumber($repeater);
    $row.find('input, textarea, select').filter(':visible').first().trigger('focus');
  });

  $(document).on('click', '[data-next-tours-repeater] [data-remove]', function (event) {
    event.preventDefault();
    var $row = $(this).closest('[data-row]');
    var hasValue = $row.find('input[type=text], input[type=date], input[type=number], textarea').filter(function () {
      return $.trim($(this).val()) !== '';
    }).length > 0;
    if (hasValue && !window.confirm(NextTours.i18n.confirmRemove)) return;
    var $repeater = $row.closest('[data-next-tours-repeater]');
    $row.remove();
    renumber($repeater);
  });

  // --- Conditional sections ------------------------------------------------
  function syncPricingModel() {
    var model = $('[data-next-tours-model]').val();
    $('[data-next-tours-model-section]').each(function () {
      $(this).toggle($(this).data('next-tours-model-section') === model);
    });
  }

  function syncBookingModes() {
    $('[data-next-tours-toggle]').each(function () {
      var key = $(this).data('next-tours-toggle');
      var on = $(this).is(':checked');
      $('[data-next-tours-section="' + key + '"]').toggleClass('next-tours-disabled', !on);
      $('[data-next-tours-off="' + key + '"]').toggle(!on);
    });
  }

  function syncKind() {
    var multiDay = $('[data-next-tours-kind]').val() === 'multi_day';
    $('.next-tours-multi-day').toggle(multiDay);
  }

  $(document).on('change', '[data-next-tours-model]', syncPricingModel);
  $(document).on('change', '[data-next-tours-toggle]', syncBookingModes);
  $(document).on('change', '[data-next-tours-kind]', syncKind);

  // --- DeepL translation of the tour fields ----------------------------------
  $(document).on('click', '[data-next-tours-translate]', function (event) {
    event.preventDefault();
    var $button = $(this);
    var $status = $button.siblings('[data-next-tours-translate-status]');
    $button.prop('disabled', true);
    $status.text(NextTours.i18n.translating);
    $.post(NextTours.ajaxUrl, {
      action: 'next_tours_translate',
      nonce: NextTours.nonce,
      post_id: $button.data('post-id')
    })
      .done(function (response) {
        if (response && response.success) {
          $status.text(NextTours.i18n.translated);
          if (response.data && response.data.html) {
            $button.closest('[data-next-tours-translations]').find('[data-next-tours-translation-list]').html(response.data.html);
          }
        } else {
          $status.text((response && response.data && response.data.message) || NextTours.i18n.error);
        }
      })
      .fail(function () {
        $status.text(NextTours.i18n.error);
      })
      .always(function () {
        $button.prop('disabled', false);
      });
  });

  // --- WooCommerce product type integration ---------------------------------
  // WooCommerce hides the "General" tab's price fields for unknown types; the
  // tour tabs carry show_if_tour and are toggled by WooCommerce itself.
  $(document.body).on('woocommerce-product-type-change', function (event, type) {
    if (type === 'tour') {
      $('#_virtual').prop('checked', true);
    }
  });

  $(function () {
    syncPricingModel();
    syncBookingModes();
    syncKind();
    $('[data-next-tours-repeater]').each(function () {
      renumber($(this));
    });
  });
})(jQuery);
