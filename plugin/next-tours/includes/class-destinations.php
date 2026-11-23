<?php
/**
 * Destination pages: extra content for the country categories.
 *
 * A destination is a product category under "destinazioni" whose slug is a
 * lowercase ISO 3166-1 alpha-2 code ("it", "es"…). Its edit screen gets a
 * "Destinazione" section; the content is stored in one term meta array and
 * exposed to the storefront as `destination` on wc/v3 product categories
 * (readable, and writable for seeding/imports).
 *
 *   _next_destination = {
 *     subtitle, intro (HTML), gallery [attachment ids], zones [{name, text, lat, lng}],
 *     grapes [string], best_months [1..12], getting_there
 *   }
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Destinations {
    const META = '_next_destination';
    const TAXONOMY = 'product_cat';
    const FIELD = 'next_destination';
    const NONCE = 'next_tours_destination';

    public static function init() {
        add_action(self::TAXONOMY . '_edit_form_fields', array(__CLASS__, 'edit_fields'), 20);
        add_action(self::TAXONOMY . '_add_form_fields', array(__CLASS__, 'add_hint'), 20);
        add_action('edited_' . self::TAXONOMY, array(__CLASS__, 'save'));
        add_action('admin_enqueue_scripts', array(__CLASS__, 'assets'));
        add_filter('woocommerce_rest_prepare_' . self::TAXONOMY, array(__CLASS__, 'rest_prepare'), 10, 2);
        add_action('woocommerce_rest_insert_' . self::TAXONOMY, array(__CLASS__, 'rest_insert'), 10, 2);
    }

    /** Slug of the parent category of all destinations. */
    public static function root_slug() {
        return apply_filters('next_tours_destinations_root', 'destinazioni');
    }

    public static function is_destination($term) {
        if (!$term instanceof WP_Term || $term->taxonomy !== self::TAXONOMY) {
            return false;
        }
        $root = get_term_by('slug', self::root_slug(), self::TAXONOMY);
        return $root && (int) $term->parent === (int) $root->term_id && preg_match('/^[a-z]{2}$/', $term->slug);
    }

    // -----------------------------------------------------------------------
    // Data
    // -----------------------------------------------------------------------

    public static function defaults() {
        return array(
            'subtitle'      => '',
            'intro'         => '',
            'gallery'       => array(),
            'zones'         => array(),
            'grapes'        => array(),
            'best_months'   => array(),
            'getting_there' => '',
        );
    }

    public static function get($term_id) {
        $stored = get_term_meta($term_id, self::META, true);
        return is_array($stored) ? array_merge(self::defaults(), array_intersect_key($stored, self::defaults())) : self::defaults();
    }

    /** Accepts the edit form (strings, keyed rows) and the REST shape (lists, arrays). */
    public static function sanitize($raw) {
        $raw = is_array($raw) ? $raw : array();

        $gallery = isset($raw['gallery']) ? $raw['gallery'] : array();
        $gallery = is_array($gallery) ? $gallery : explode(',', (string) $gallery);
        $gallery = array_values(array_unique(array_filter(array_map('absint', $gallery), function ($id) {
            return $id > 0 && wp_attachment_is_image($id);
        })));

        $zones = array();
        $rows = isset($raw['zones']) && is_array($raw['zones']) ? $raw['zones'] : array();
        foreach ($rows as $index => $row) {
            if ($index === '__i__' || !is_array($row)) {
                continue;
            }
            $name = isset($row['name']) ? sanitize_text_field(wp_unslash($row['name'])) : '';
            if ($name === '') {
                continue;
            }
            $zones[] = array(
                'name' => $name,
                'text' => isset($row['text']) ? sanitize_textarea_field(wp_unslash($row['text'])) : '',
                'lat'  => self::coord(isset($row['lat']) ? $row['lat'] : '', 90),
                'lng'  => self::coord(isset($row['lng']) ? $row['lng'] : '', 180),
            );
        }

        $grapes = isset($raw['grapes']) ? $raw['grapes'] : array();
        $grapes = is_array($grapes) ? $grapes : explode(',', wp_unslash((string) $grapes));
        $grapes = array_values(array_filter(array_map('sanitize_text_field', $grapes), 'strlen'));

        $months = isset($raw['best_months']) && is_array($raw['best_months']) ? $raw['best_months'] : array();
        // Form checkboxes arrive as month => 1, REST as a list of months
        $months = array_keys($months) === range(0, count($months) - 1) ? $months : array_keys($months);
        $months = array_values(array_unique(array_filter(array_map('intval', $months), function ($m) {
            return $m >= 1 && $m <= 12;
        })));
        sort($months);

        return array(
            'subtitle'      => isset($raw['subtitle']) ? sanitize_text_field(wp_unslash($raw['subtitle'])) : '',
            'intro'         => isset($raw['intro']) ? wp_kses_post(wp_unslash($raw['intro'])) : '',
            'gallery'       => $gallery,
            'zones'         => $zones,
            'grapes'        => $grapes,
            'best_months'   => $months,
            'getting_there' => isset($raw['getting_there']) ? sanitize_textarea_field(wp_unslash($raw['getting_there'])) : '',
        );
    }

    private static function coord($value, $limit) {
        $value = trim(str_replace(',', '.', (string) $value));
        if (!is_numeric($value) || abs((float) $value) > $limit) {
            return '';
        }
        return (string) round((float) $value, 4);
    }

    /** What the storefront gets: gallery ids resolved to image data. */
    public static function public_data($term_id) {
        $data = self::get($term_id);
        $images = array();
        foreach ($data['gallery'] as $id) {
            $full = wp_get_attachment_image_src($id, 'full');
            if (!$full) {
                continue;
            }
            $images[] = array(
                'id'      => $id,
                'src'     => $full[0],
                'width'   => (int) $full[1],
                'height'  => (int) $full[2],
                'alt'     => (string) get_post_meta($id, '_wp_attachment_image_alt', true),
                'caption' => wp_get_attachment_caption($id) ?: '',
            );
        }
        $data['gallery'] = $images;
        return $data;
    }

    // -----------------------------------------------------------------------
    // REST (wc/v3/products/categories)
    // -----------------------------------------------------------------------

    public static function rest_prepare($response, $item) {
        $term = $item instanceof WP_Term ? $item : get_term($item, self::TAXONOMY);
        $response->data['destination'] = self::is_destination($term) ? self::public_data($term->term_id) : null;
        return $response;
    }

    /** `destination` in a create/update request: keys sent replace the stored ones. */
    public static function rest_insert($term, $request) {
        if (!isset($request['destination']) || !is_array($request['destination'])) {
            return;
        }
        $current = self::get($term->term_id);
        $incoming = array_intersect_key($request['destination'], self::defaults());
        $clean = self::sanitize(array_merge($current, $incoming));
        update_term_meta($term->term_id, self::META, $clean);
    }

    // -----------------------------------------------------------------------
    // Edit screen
    // -----------------------------------------------------------------------

    public static function assets($hook) {
        if ($hook !== 'term.php') {
            return;
        }
        $screen = get_current_screen();
        if (!$screen || $screen->taxonomy !== self::TAXONOMY) {
            return;
        }
        wp_enqueue_media();
        wp_enqueue_style('next-tours-admin', NEXT_TOURS_URL . 'assets/admin.css', array(), NEXT_TOURS_VERSION);
        wp_enqueue_script('next-tours-admin', NEXT_TOURS_URL . 'assets/admin.js', array('jquery'), NEXT_TOURS_VERSION, true);
        wp_enqueue_script('next-tours-destinations', NEXT_TOURS_URL . 'assets/destinations.js', array('jquery', 'jquery-ui-sortable'), NEXT_TOURS_VERSION, true);
        wp_localize_script('next-tours-admin', 'NextTours', array(
            'i18n' => array(
                'confirmRemove' => __('Rimuovere questa riga?', 'next-tours'),
                'galleryTitle'  => __('Immagini della destinazione', 'next-tours'),
                'galleryButton' => __('Usa queste immagini', 'next-tours'),
            ),
        ));
    }

    public static function add_hint() {
        echo '<div class="form-field"><p class="description">';
        printf(
            /* translators: %s: parent category name */
            esc_html__('Per una pagina destinazione scegli "%s" come categoria genitore e usa come slug il codice del paese (es. "es" per la Spagna): dopo il salvataggio compariranno i campi per galleria, testo e zone.', 'next-tours'),
            esc_html(ucfirst(self::root_slug()))
        );
        echo '</p></div>';
    }

    public static function edit_fields($term) {
        if (!self::is_destination($term)) {
            return;
        }
        $d = self::get($term->term_id);
        $f = self::FIELD;

        wp_nonce_field(self::NONCE, self::NONCE . '_nonce');

        echo '<tr><th colspan="2"><h2 class="next-tours-term-title">' . esc_html__('Pagina destinazione', 'next-tours') . '</h2>';
        echo '<p class="description">' . esc_html__('Nella pagina del paese, in quest’ordine: le esperienze, la galleria di immagini, il racconto del territorio.', 'next-tours') . '</p></th></tr>';

        // Subtitle
        echo '<tr class="form-field"><th scope="row"><label for="next-destination-subtitle">' . esc_html__('Sottotitolo', 'next-tours') . '</label></th><td>';
        echo '<input type="text" id="next-destination-subtitle" name="' . esc_attr($f . '[subtitle]') . '" value="' . esc_attr($d['subtitle']) . '" />';
        echo '<p class="description">' . esc_html__('Una riga sotto il nome del paese, es. "Il Tempranillo tra Rioja e Duero".', 'next-tours') . '</p></td></tr>';

        // Gallery
        echo '<tr class="form-field"><th scope="row">' . esc_html__('Galleria', 'next-tours') . '</th><td>';
        echo '<div class="next-tours-gallery" data-next-tours-gallery>';
        echo '<input type="hidden" name="' . esc_attr($f . '[gallery]') . '" value="' . esc_attr(implode(',', $d['gallery'])) . '" data-gallery-input />';
        echo '<ul class="next-tours-gallery-list" data-gallery-list>';
        foreach ($d['gallery'] as $id) {
            self::gallery_item($id);
        }
        echo '</ul>';
        echo '<button type="button" class="button" data-gallery-add>' . esc_html__('Aggiungi immagini', 'next-tours') . '</button>';
        echo '<p class="description">' . esc_html__('Trascina per cambiare l’ordine: la prima è la più grande. Il testo alternativo e la didascalia si impostano nella Libreria media.', 'next-tours') . '</p>';
        echo '</div></td></tr>';

        // Intro
        echo '<tr class="form-field"><th scope="row"><label for="next-destination-intro">' . esc_html__('Il territorio', 'next-tours') . '</label></th><td>';
        wp_editor($d['intro'], 'next-destination-intro', array(
            'textarea_name' => $f . '[intro]',
            'textarea_rows' => 10,
            'media_buttons' => false,
            'teeny'         => true,
        ));
        echo '<p class="description">' . esc_html__('Il racconto del paese e del suo vino: storia, paesaggi, cosa lo rende unico.', 'next-tours') . '</p></td></tr>';

        // Zones
        echo '<tr class="form-field"><th scope="row">' . esc_html__('Zone del vino', 'next-tours') . '</th><td>';
        echo '<div class="next-tours-repeater" data-next-tours-repeater><div class="next-tours-cards" data-rows>';
        foreach ($d['zones'] as $i => $zone) {
            self::zone_row((string) $i, $zone);
        }
        echo '</div><template data-template>';
        self::zone_row('__i__', array('name' => '', 'text' => '', 'lat' => '', 'lng' => ''));
        echo '</template>';
        echo '<button type="button" class="button" data-add>' . esc_html__('+ Aggiungi zona', 'next-tours') . '</button>';
        echo '<p class="description">' . esc_html__('Le coordinate (facoltative) mettono la zona sulla mappa del paese: si copiano da Google Maps, tasto destro sul punto.', 'next-tours') . '</p>';
        echo '</div></td></tr>';

        // Grapes
        echo '<tr class="form-field"><th scope="row"><label for="next-destination-grapes">' . esc_html__('Vitigni principali', 'next-tours') . '</label></th><td>';
        echo '<input type="text" id="next-destination-grapes" name="' . esc_attr($f . '[grapes]') . '" value="' . esc_attr(implode(', ', $d['grapes'])) . '" />';
        echo '<p class="description">' . esc_html__('Separati da virgola.', 'next-tours') . '</p></td></tr>';

        // Best months
        echo '<tr class="form-field"><th scope="row">' . esc_html__('Periodo migliore', 'next-tours') . '</th><td><div class="next-tours-weekdays next-tours-months">';
        for ($m = 1; $m <= 12; $m++) {
            $label = date_i18n('M', mktime(0, 0, 0, $m, 1, 2000));
            echo '<label><input type="checkbox" name="' . esc_attr($f . '[best_months][' . $m . ']') . '" value="1"' . checked(in_array($m, $d['best_months'], true), true, false) . ' />' . esc_html($label) . '</label>';
        }
        echo '</div></td></tr>';

        // Getting there
        echo '<tr class="form-field"><th scope="row"><label for="next-destination-getting-there">' . esc_html__('Come arrivare', 'next-tours') . '</label></th><td>';
        echo '<textarea id="next-destination-getting-there" name="' . esc_attr($f . '[getting_there]') . '" rows="3">' . esc_textarea($d['getting_there']) . '</textarea>';
        echo '<p class="description">' . esc_html__('Aeroporti, collegamenti, tempi di viaggio dall’Italia.', 'next-tours') . '</p></td></tr>';
    }

    private static function gallery_item($id) {
        $thumb = wp_get_attachment_image_src($id, 'thumbnail');
        if (!$thumb) {
            return;
        }
        echo '<li data-id="' . esc_attr($id) . '"><img src="' . esc_url($thumb[0]) . '" alt="" />';
        echo '<button type="button" class="next-tours-gallery-remove" data-gallery-remove aria-label="' . esc_attr__('Rimuovi', 'next-tours') . '">&times;</button></li>';
    }

    private static function zone_row($i, array $zone) {
        $p = self::FIELD . '[zones][' . $i . ']';
        echo '<div class="next-tours-card" data-row>';
        echo '<div class="next-tours-card-head"><span class="next-tours-handle" data-number></span>';
        echo '<input type="text" name="' . esc_attr($p . '[name]') . '" value="' . esc_attr($zone['name']) . '" placeholder="' . esc_attr__('Nome della zona (es. Rioja)', 'next-tours') . '" class="next-tours-grow" />';
        echo '<button type="button" class="button-link next-tours-remove" data-remove aria-label="' . esc_attr__('Rimuovi', 'next-tours') . '">&times;</button></div>';
        echo '<textarea name="' . esc_attr($p . '[text]') . '" rows="3" placeholder="' . esc_attr__('Due o tre frasi sulla zona', 'next-tours') . '">' . esc_textarea($zone['text']) . '</textarea>';
        echo '<div class="next-tours-card-foot">';
        echo '<input type="text" name="' . esc_attr($p . '[lat]') . '" value="' . esc_attr($zone['lat']) . '" placeholder="' . esc_attr__('Latitudine', 'next-tours') . '" class="next-tours-sm" />';
        echo '<input type="text" name="' . esc_attr($p . '[lng]') . '" value="' . esc_attr($zone['lng']) . '" placeholder="' . esc_attr__('Longitudine', 'next-tours') . '" class="next-tours-sm" />';
        echo '</div></div>';
    }

    public static function save($term_id) {
        if (!isset($_POST[self::NONCE . '_nonce']) || !wp_verify_nonce(sanitize_key($_POST[self::NONCE . '_nonce']), self::NONCE)) {
            return;
        }
        if (!current_user_can('manage_product_terms') || !self::is_destination(get_term($term_id, self::TAXONOMY))) {
            return;
        }
        // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- sanitized below
        $raw = isset($_POST[self::FIELD]) && is_array($_POST[self::FIELD]) ? $_POST[self::FIELD] : array();
        update_term_meta($term_id, self::META, self::sanitize($raw));
    }
}
