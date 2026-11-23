<?php
/**
 * Translations of the tour fields, through the Next i18n plugin's DeepL setup.
 *
 * Storage: _next_tour_i18n = { es: { texts: { "highlights.0": "…", … }, source_hash, translated_at }, … }
 * Texts are keyed by their path in the Italian source (see source_texts()).
 *
 * Translations are machine-made (DeepL), on demand (button in the "Tour" tab)
 * or automatically after saving when Next i18n's "auto translate" is on.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Translations {
    const META = '_next_tour_i18n';
    const HOOK = 'next_tours_translate';
    const NONCE = 'next_tours_translate';

    /** Free-text fields that may contain line breaks (stored as plain text). */
    private static $plain_multiline = array('important_info', 'cancellation_policy', 'meeting_point.notes');

    public static function init() {
        add_action('wp_ajax_next_tours_translate', array(__CLASS__, 'ajax'));
        // Priority 30: after WooCommerce saved the product data (save_post, priority 10).
        add_action('save_post', array(__CLASS__, 'maybe_schedule'), 30, 2);
        add_action(self::HOOK, array(__CLASS__, 'run'));
    }

    public static function available() {
        return class_exists('Next_I18n') && class_exists('Next_I18n_DeepL');
    }

    public static function locales() {
        return self::available() ? Next_I18n::target_locales() : array();
    }

    /** Italian source texts, flattened: path => text. */
    public static function source_texts($id) {
        $info = Next_Tours::get_info($id);
        $pricing = Next_Tours::get_pricing($id);
        $texts = array();

        foreach (array('highlights', 'included', 'not_included', 'what_to_bring', 'languages') as $list) {
            foreach ($info[$list] as $i => $text) {
                $texts[$list . '.' . $i] = $text;
            }
        }
        foreach ($info['itinerary'] as $i => $stop) {
            $texts['itinerary.' . $i . '.title'] = $stop['title'];
            $texts['itinerary.' . $i . '.description'] = $stop['description'];
            $texts['itinerary.' . $i . '.accommodation'] = $stop['accommodation'];
        }
        $texts['important_info'] = $info['important_info'];
        $texts['cancellation_policy'] = $info['cancellation_policy'];
        $texts['meeting_point.notes'] = $info['meeting_point']['notes'];

        foreach ($pricing['person_types'] as $type) {
            $texts['person_types.' . $type['key']] = $type['label'];
        }
        foreach ($pricing['extras'] as $extra) {
            $texts['extras.' . $extra['key']] = $extra['label'];
        }
        $texts['unit.label'] = $pricing['unit']['label'];

        return array_filter($texts, function ($text) {
            return is_string($text) && trim($text) !== '';
        });
    }

    public static function source_hash($id) {
        return md5(wp_json_encode(self::source_texts($id)));
    }

    public static function get($id) {
        $value = get_post_meta($id, self::META, true);
        return is_array($value) ? $value : array();
    }

    /** Locales missing or translated from an older version of the Italian texts. */
    public static function pending_locales($id) {
        if (!self::source_texts($id)) {
            return array();
        }
        $stored = self::get($id);
        $hash = self::source_hash($id);
        $pending = array();
        foreach (self::locales() as $locale) {
            if (empty($stored[$locale]['source_hash']) || $stored[$locale]['source_hash'] !== $hash) {
                $pending[] = $locale;
            }
        }
        return $pending;
    }

    /** @return true|WP_Error */
    public static function translate($id, $locale) {
        if (!self::available()) {
            return new WP_Error('next_tours_no_i18n', __('Il plugin Next i18n non è attivo.', 'next-tours'));
        }
        $texts = self::source_texts($id);
        // DeepL runs in HTML mode: escape plain text, then decode the result.
        $payload = array();
        foreach ($texts as $key => $text) {
            $payload[$key] = self::is_html($key) ? $text : esc_html($text);
        }
        $result = Next_I18n_DeepL::translate($payload, Next_I18n::deepl_target($locale));
        if (is_wp_error($result)) {
            return $result;
        }
        $clean = array();
        foreach ($result as $key => $text) {
            $clean[$key] = self::is_html($key)
                ? wp_kses_post($text)
                : sanitize_textarea_field(html_entity_decode((string) $text, ENT_QUOTES, 'UTF-8'));
        }

        $all = self::get($id);
        $all[$locale] = array(
            'texts'         => $clean,
            'source_hash'   => self::source_hash($id),
            'translated_at' => gmdate('c'),
        );
        update_post_meta($id, self::META, $all);
        return true;
    }

    private static function is_html($key) {
        return (bool) preg_match('/^itinerary\.\d+\.description$/', $key);
    }

    /**
     * Translations as served to the storefront, per locale:
     * { highlights[], included[], not_included[], what_to_bring[], languages[],
     *   itinerary[{title, description, accommodation}], important_info,
     *   cancellation_policy, meeting_point_notes, person_types{key: label},
     *   extras{key: label}, unit_label, outdated }
     * Untranslated entries fall back to the Italian text.
     */
    public static function rest_field($id) {
        $stored = self::get($id);
        if (!$stored) {
            return (object) array();
        }
        $info = Next_Tours::get_info($id);
        $pricing = Next_Tours::get_pricing($id);
        $hash = self::source_hash($id);
        $out = array();

        foreach (self::locales() as $locale) {
            if (empty($stored[$locale]['texts']) || !is_array($stored[$locale]['texts'])) {
                continue;
            }
            $t = $stored[$locale]['texts'];
            $pick = function ($key, $fallback) use ($t) {
                return isset($t[$key]) && $t[$key] !== '' ? $t[$key] : $fallback;
            };

            $entry = array();
            foreach (array('highlights', 'included', 'not_included', 'what_to_bring', 'languages') as $list) {
                $entry[$list] = array();
                foreach ($info[$list] as $i => $text) {
                    $entry[$list][] = $pick($list . '.' . $i, $text);
                }
            }
            $entry['itinerary'] = array();
            foreach ($info['itinerary'] as $i => $stop) {
                $entry['itinerary'][] = array(
                    'title'         => $pick('itinerary.' . $i . '.title', $stop['title']),
                    'description'   => wpautop($pick('itinerary.' . $i . '.description', $stop['description'])),
                    'accommodation' => $pick('itinerary.' . $i . '.accommodation', $stop['accommodation']),
                );
            }
            $entry['important_info'] = $pick('important_info', $info['important_info']);
            $entry['cancellation_policy'] = $pick('cancellation_policy', $info['cancellation_policy']);
            $entry['meeting_point_notes'] = $pick('meeting_point.notes', $info['meeting_point']['notes']);
            $entry['person_types'] = array();
            foreach ($pricing['person_types'] as $type) {
                $entry['person_types'][$type['key']] = $pick('person_types.' . $type['key'], $type['label']);
            }
            $entry['person_types'] = $entry['person_types'] ? $entry['person_types'] : (object) array();
            $entry['extras'] = array();
            foreach ($pricing['extras'] as $extra) {
                $entry['extras'][$extra['key']] = $pick('extras.' . $extra['key'], $extra['label']);
            }
            $entry['extras'] = $entry['extras'] ? $entry['extras'] : (object) array();
            $entry['unit_label'] = $pick('unit.label', $pricing['unit']['label']);
            $entry['outdated'] = isset($stored[$locale]['source_hash']) && $stored[$locale]['source_hash'] !== $hash;
            $out[$locale] = $entry;
        }
        return $out ? $out : (object) array();
    }

    // -----------------------------------------------------------------------
    // Admin
    // -----------------------------------------------------------------------

    public static function render_box($id) {
        echo '<div class="options_group next-tours-translations" data-next-tours-translations>';
        echo '<h4>' . esc_html__('Traduzioni dei campi del tour', 'next-tours') . '</h4>';
        if (!self::available()) {
            echo '<p class="next-tours-help">' . esc_html__('Attiva il plugin Next i18n per tradurre questi campi con DeepL.', 'next-tours') . '</p></div>';
            return;
        }
        echo '<div data-next-tours-translation-list>' . self::status_html($id) . '</div>';
        if ($id && Next_I18n_DeepL::get_key() !== '') {
            echo '<p><button type="button" class="button" data-next-tours-translate data-post-id="' . esc_attr($id) . '">' . esc_html__('Traduci i campi del tour con DeepL', 'next-tours') . '</button> <span data-next-tours-translate-status></span></p>';
            echo '<p class="next-tours-help">' . esc_html__('Traduce i testi salvati: salva prima il prodotto se li hai modificati. Titolo e descrizione si traducono nel box "Traduzioni".', 'next-tours') . '</p>';
        } else {
            echo '<p class="next-tours-help">' . esc_html__('Configura la chiave DeepL nelle impostazioni di Next i18n.', 'next-tours') . '</p>';
        }
        echo '</div>';
    }

    public static function status_html($id) {
        $stored = $id ? self::get($id) : array();
        $hash = $id ? self::source_hash($id) : '';
        $html = '<ul>';
        foreach (self::locales() as $locale) {
            if (empty($stored[$locale]['texts'])) {
                $badge = '<span class="next-tours-badge">' . esc_html__('da tradurre', 'next-tours') . '</span>';
            } elseif ($stored[$locale]['source_hash'] !== $hash) {
                $badge = '<span class="next-tours-badge is-stale">' . esc_html__('da aggiornare', 'next-tours') . '</span>';
            } else {
                $badge = '<span class="next-tours-badge is-ok">' . esc_html__('aggiornata', 'next-tours') . '</span>';
            }
            $html .= '<li><strong>' . esc_html(strtoupper($locale)) . '</strong> ' . $badge . '</li>';
        }
        return $html . '</ul>';
    }

    public static function ajax() {
        check_ajax_referer(self::NONCE, 'nonce');
        $id = isset($_POST['post_id']) ? absint($_POST['post_id']) : 0;
        if (!$id || !current_user_can('edit_post', $id)) {
            wp_send_json_error(array('message' => __('Permesso negato.', 'next-tours')), 403);
        }
        foreach (self::locales() as $locale) {
            $result = self::translate($id, $locale);
            if (is_wp_error($result)) {
                wp_send_json_error(array('message' => $result->get_error_message()));
            }
        }
        self::notify_updated($id);
        wp_send_json_success(array('html' => self::status_html($id)));
    }

    public static function maybe_schedule($post_id, $post) {
        if (!$post || $post->post_type !== 'product' || $post->post_status !== 'publish') {
            return;
        }
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id) || !self::available()) {
            return;
        }
        if (!class_exists('Next_I18n_Settings') || !Next_I18n_Settings::get('auto_translate') || Next_I18n_DeepL::get_key() === '') {
            return;
        }
        if (!Next_Tours::is_tour($post_id) || !self::pending_locales($post_id)) {
            return;
        }
        if (!wp_next_scheduled(self::HOOK, array($post_id))) {
            wp_schedule_single_event(time() + 15, self::HOOK, array($post_id));
        }
    }

    public static function run($post_id) {
        $updated = false;
        foreach (self::pending_locales($post_id) as $locale) {
            $result = self::translate($post_id, $locale);
            if (is_wp_error($result)) {
                error_log(sprintf('Next Tours: translation of product %d to %s failed: %s', $post_id, $locale, $result->get_error_message()));
                break;
            }
            $updated = true;
        }
        if ($updated) {
            self::notify_updated($post_id);
        }
    }

    /** Let the storefront refetch the product (the Next.js revalidation plugin listens to this hook). */
    private static function notify_updated($post_id) {
        clean_post_cache($post_id);
        do_action('next_i18n_translations_updated', $post_id);
    }
}
