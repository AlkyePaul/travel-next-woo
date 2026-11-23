<?php
/**
 * Shared helpers: locales, storage of translations, source hashing.
 *
 * Storage model (one post/product, many languages):
 *   _next_i18n             array  { es: {title, slug, excerpt, content, source_hash,
 *                                        translated_by, reviewed, updated_at}, en: {...} }
 *   _next_i18n_slug_{loc}  string flat copy of each slug, for lookups and uniqueness
 *
 * The Italian source stays in the native WordPress/WooCommerce fields.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_I18n {
    const META_KEY = '_next_i18n';
    const SLUG_META_PREFIX = '_next_i18n_slug_';
    const SOURCE_LOCALE = 'it';
    const FIELDS = array('title', 'slug', 'excerpt', 'content');

    /** Post types that get a "Traduzioni" box. */
    public static function post_types() {
        return apply_filters('next_i18n_post_types', array('product', 'post', 'page'));
    }

    /** Enabled target locales, e.g. ['es', 'en']. Must match i18n/routing.ts in Next.js. */
    public static function target_locales() {
        $locales = array();
        foreach (Next_I18n_Settings::get_languages() as $language) {
            if (!empty($language['enabled']) && !empty($language['code'])) {
                $locales[] = $language['code'];
            }
        }
        return array_values(array_unique($locales));
    }

    /** "ES", "pt-br" → "es", "pt-BR"; '' when not a valid 2-letter (+ region) code. */
    public static function normalize_locale($code) {
        if (!preg_match('/^([a-zA-Z]{2})(?:-([a-zA-Z]{2}))?$/', trim((string) $code), $m)) {
            return '';
        }
        return strtolower($m[1]) . (isset($m[2]) && $m[2] !== '' ? '-' . strtoupper($m[2]) : '');
    }

    /** Sensible DeepL target when none was picked (DeepL needs a variant for some languages). */
    public static function guess_deepl_target($locale) {
        $variants = array('en' => 'EN-GB', 'pt' => 'PT-PT', 'zh' => 'ZH-HANS');
        return isset($variants[$locale]) ? $variants[$locale] : strtoupper($locale);
    }

    /** DeepL target code configured for a locale. */
    public static function deepl_target($locale) {
        $code = '';
        foreach (Next_I18n_Settings::get_languages() as $language) {
            if (isset($language['code']) && $language['code'] === $locale && !empty($language['deepl'])) {
                $code = $language['deepl'];
                break;
            }
        }
        if ($code === '') {
            $code = self::guess_deepl_target($locale);
        }
        return apply_filters('next_i18n_deepl_target', $code, $locale);
    }

    /** All stored translations for a post, keyed by locale. */
    public static function get_translations($post_id) {
        $value = get_post_meta($post_id, self::META_KEY, true);
        return is_array($value) ? $value : array();
    }

    /** Fingerprint of the Italian source, used to flag outdated translations. */
    public static function source_hash($post) {
        $post = get_post($post);
        if (!$post) {
            return '';
        }
        return md5($post->post_title . "\0" . $post->post_excerpt . "\0" . $post->post_content);
    }

    /** True when the Italian text changed after this translation was made. */
    public static function is_stale(array $entry, $post) {
        return !empty($entry['source_hash']) && $entry['source_hash'] !== self::source_hash($post);
    }

    /**
     * Save (or delete, when every field is empty) one locale's translation.
     */
    public static function save_locale($post_id, $locale, array $entry) {
        $all = self::get_translations($post_id);
        $post = get_post($post_id);

        $is_empty = true;
        foreach (array('title', 'excerpt', 'content') as $field) {
            if (!empty($entry[$field])) {
                $is_empty = false;
            }
        }

        if ($is_empty) {
            unset($all[$locale]);
            delete_post_meta($post_id, self::SLUG_META_PREFIX . $locale);
        } else {
            if (empty($entry['slug']) && !empty($entry['title'])) {
                $entry['slug'] = sanitize_title($entry['title']);
            }
            $entry['slug'] = self::unique_slug($entry['slug'], $post_id, $post ? $post->post_type : 'post', $locale);
            $all[$locale] = $entry;
            update_post_meta($post_id, self::SLUG_META_PREFIX . $locale, $entry['slug']);
        }

        if (empty($all)) {
            delete_post_meta($post_id, self::META_KEY);
        } else {
            update_post_meta($post_id, self::META_KEY, $all);
        }

        if ($post) {
            delete_transient(Next_I18n_Rest::slugs_cache_key($post->post_type));
        }
    }

    /** Make a translated slug unique among posts of the same type in the same locale. */
    public static function unique_slug($slug, $post_id, $post_type, $locale) {
        $base = sanitize_title($slug);
        if ($base === '') {
            return '';
        }
        $candidate = $base;
        $suffix = 2;
        while (true) {
            $clash = get_posts(array(
                'post_type'      => $post_type,
                'post_status'    => array('publish', 'draft', 'pending', 'private', 'future'),
                'meta_key'       => self::SLUG_META_PREFIX . $locale,
                'meta_value'     => $candidate,
                'post__not_in'   => array((int) $post_id),
                'fields'         => 'ids',
                'posts_per_page' => 1,
                'no_found_rows'  => true,
            ));
            if (empty($clash)) {
                return $candidate;
            }
            $candidate = $base . '-' . $suffix;
            $suffix++;
        }
    }

    /**
     * Translate a post's saved Italian fields with DeepL.
     *
     * @return array|WP_Error {title, slug, excerpt, content}
     */
    public static function translate_post($post, $locale) {
        $post = get_post($post);
        if (!$post) {
            return new WP_Error('next_i18n_no_post', __('Contenuto non trovato.', 'next-i18n'));
        }

        $result = Next_I18n_DeepL::translate(
            array(
                'title'   => $post->post_title,
                'excerpt' => $post->post_excerpt,
                'content' => $post->post_content,
            ),
            self::deepl_target($locale)
        );
        if (is_wp_error($result)) {
            return $result;
        }

        $title = sanitize_text_field($result['title']);
        return array(
            'title'   => $title,
            'slug'    => sanitize_title($title),
            'excerpt' => wp_kses_post($result['excerpt']),
            'content' => wp_kses_post($result['content']),
        );
    }
}
