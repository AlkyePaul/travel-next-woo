<?php
/**
 * REST exposure for the Next.js storefront.
 *
 *  - `i18n` field on posts, pages (wp/v2) and products (wc/v3):
 *      { es: { title, slug, excerpt, content, outdated }, en: {...} }
 *  - GET /wp-json/next-i18n/v1/config           source + enabled languages
 *  - GET /wp-json/next-i18n/v1/slugs?type=...    { id, slugs: { it, es, en } } for published items
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_I18n_Rest {
    const NS = 'next-i18n/v1';

    public static function init() {
        add_action('rest_api_init', array(__CLASS__, 'register'));
        add_action('save_post', array(__CLASS__, 'flush_slugs'), 30, 2);
        add_action('deleted_post', array(__CLASS__, 'flush_all_slugs'));
    }

    public static function slugs_cache_key($post_type) {
        return 'next_i18n_slugs_' . $post_type;
    }

    public static function register() {
        foreach (Next_I18n::post_types() as $post_type) {
            register_rest_field($post_type, 'i18n', array(
                'get_callback' => array(__CLASS__, 'field'),
                'schema'       => array(
                    'description' => __('Traduzioni per lingua', 'next-i18n'),
                    'type'        => 'object',
                    'context'     => array('view', 'edit'),
                    'readonly'    => true,
                ),
            ));
        }

        register_rest_route(self::NS, '/config', array(
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => array(__CLASS__, 'config'),
        ));

        register_rest_route(self::NS, '/slugs', array(
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => array(__CLASS__, 'slugs'),
            'args'                => array(
                'type' => array(
                    'required'          => true,
                    'validate_callback' => function ($value) {
                        return in_array($value, Next_I18n::post_types(), true);
                    },
                ),
            ),
        ));
    }

    public static function field($object) {
        $id = is_array($object) && isset($object['id']) ? (int) $object['id'] : 0;
        $post = $id ? get_post($id) : null;
        if (!$post) {
            return (object) array();
        }

        $out = array();
        $translations = Next_I18n::get_translations($id);
        foreach (Next_I18n::target_locales() as $locale) {
            if (empty($translations[$locale]) || !is_array($translations[$locale])) {
                continue;
            }
            $entry = $translations[$locale];
            $content = isset($entry['content']) ? (string) $entry['content'] : '';
            $excerpt = isset($entry['excerpt']) ? (string) $entry['excerpt'] : '';
            $out[$locale] = array(
                'title'    => isset($entry['title']) ? (string) $entry['title'] : '',
                'slug'     => isset($entry['slug']) ? (string) $entry['slug'] : '',
                // Rendered like the native fields: WooCommerce applies wpautop + shortcodes,
                // posts/pages go through the_content (blocks, embeds, wpautop).
                'excerpt'  => $excerpt === '' ? '' : wpautop($excerpt),
                'content'  => $content === '' ? '' : ($post->post_type === 'product'
                    ? wpautop(do_shortcode($content))
                    : apply_filters('the_content', $content)),
                'outdated' => Next_I18n::is_stale($entry, $post),
            );
        }
        // An empty PHP array would serialise as [] instead of {}.
        return $out ? $out : (object) array();
    }

    public static function config() {
        $languages = array();
        foreach (Next_I18n_Settings::get_languages() as $language) {
            if (!empty($language['enabled'])) {
                $languages[] = array('code' => $language['code'], 'label' => $language['label']);
            }
        }
        return array(
            'source'    => Next_I18n::SOURCE_LOCALE,
            'languages' => $languages,
        );
    }

    public static function slugs(WP_REST_Request $request) {
        $type = $request->get_param('type');
        $cached = get_transient(self::slugs_cache_key($type));
        if (is_array($cached)) {
            return $cached;
        }

        $ids = get_posts(array(
            'post_type'      => $type,
            'post_status'    => 'publish',
            'fields'         => 'ids',
            'posts_per_page' => 5000,
            'no_found_rows'  => true,
        ));

        $locales = Next_I18n::target_locales();
        $items = array();
        foreach ($ids as $id) {
            $slugs = array(Next_I18n::SOURCE_LOCALE => get_post_field('post_name', $id));
            foreach ($locales as $locale) {
                $slug = get_post_meta($id, Next_I18n::SLUG_META_PREFIX . $locale, true);
                if ($slug !== '') {
                    $slugs[$locale] = $slug;
                }
            }
            $items[] = array('id' => (int) $id, 'slugs' => $slugs);
        }

        set_transient(self::slugs_cache_key($type), $items, DAY_IN_SECONDS);
        return $items;
    }

    public static function flush_slugs($post_id, $post) {
        if ($post && in_array($post->post_type, Next_I18n::post_types(), true)) {
            delete_transient(self::slugs_cache_key($post->post_type));
        }
    }

    public static function flush_all_slugs() {
        foreach (Next_I18n::post_types() as $post_type) {
            delete_transient(self::slugs_cache_key($post_type));
        }
    }
}
