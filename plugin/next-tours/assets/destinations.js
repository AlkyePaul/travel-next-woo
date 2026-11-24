/* Next Tours – destination fields on the product category screen: image gallery. */
(function ($) {
  'use strict';

  function sync($gallery) {
    var ids = $gallery.find('[data-gallery-list] > li').map(function () {
      return $(this).data('id');
    }).get();
    $gallery.find('[data-gallery-input]').val(ids.join(','));
  }

  $(document).on('click', '[data-gallery-add]', function (event) {
    event.preventDefault();
    var $gallery = $(this).closest('[data-next-tours-gallery]');
    var frame = wp.media({
      title: NextTours.i18n.galleryTitle,
      button: { text: NextTours.i18n.galleryButton },
      library: { type: 'image' },
      multiple: 'add'
    });
    frame.on('select', function () {
      var $list = $gallery.find('[data-gallery-list]');
      frame.state().get('selection').each(function (attachment) {
        var data = attachment.toJSON();
        if ($list.children('[data-id="' + data.id + '"]').length) return;
        var src = data.sizes && data.sizes.thumbnail ? data.sizes.thumbnail.url : data.url;
        var $item = $('<li/>').attr('data-id', data.id).data('id', data.id);
        $('<img/>').attr({ src: src, alt: '' }).appendTo($item);
        $('<button type="button" class="next-tours-gallery-remove" data-gallery-remove>&times;</button>').appendTo($item);
        $list.append($item);
      });
      sync($gallery);
    });
    frame.open();
  });

  $(document).on('click', '[data-gallery-remove]', function (event) {
    event.preventDefault();
    var $gallery = $(this).closest('[data-next-tours-gallery]');
    $(this).closest('li').remove();
    sync($gallery);
  });

  $(function () {
    $('[data-next-tours-gallery] [data-gallery-list]').sortable({
      items: '> li',
      tolerance: 'pointer',
      update: function () {
        sync($(this).closest('[data-next-tours-gallery]'));
      }
    });
  });
})(jQuery);
