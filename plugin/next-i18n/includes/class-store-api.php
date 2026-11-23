<?php
/**
 * Adds translations to WooCommerce Store API cart items, so a headless cart
 * can show product names and links in the shopper's language without extra
 * requests.
 *
 *   items[].extensions["next-i18n"] = {
 *     product_id:   15,
 *     slugs:       { it: "viaggio-bello", es: "un-bonito-viaje", en: "wonderful-journey" },
 *     translations: { es: { title: "Un bonito viaje" }, en: { title: "A wonderful journey" } }
 *   }
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_I18n_Store_Api {
    const NAMESPACE_KEY = 'next-i18n';

    private static $registered = false;

    public static function init() {
        // Store API extensions must be registered once WooCommerce Blocks/Store API is loaded.
        add_action('woocommerce_blocks_loaded', array(__CLASS__, 'register'));
        add_action('init', array(__CLASS__, 'register'), 20);
    }

    public static function register() {
        if (self::$registered || !function_exists('woocommerce_store_api_register_endpoint_data')) {
            return;
        }
        self::$registered = true;

        $endpoint = class_exists('\Automattic\WooCommerce\StoreApi\Schemas\V1\CartItemSchema')
            ? \Automattic\WooCommerce\StoreApi\Schemas\V1\CartItemSchema::IDENTIFIER
            : 'cart-item';

        woocommerce_store_api_register_endpoint_data(array(
            'endpoint'        => $endpoint,
            'namespace'       => self::NAMESPACE_KEY,
            'data_callback'   => array(__CLASS__, 'cart_item_data'),
            'schema_callback' => array(__CLASS__, 'cart_item_schema'),
            'schema_type'     => ARRAY_A,
        ));
    }

    public static function cart_item_data($cart_item) {
        $product_id = isset($cart_item['product_id']) ? (int) $cart_item['product_id'] : 0;
        if (!$product_id) {
            return array('slugs' => (object) array(), 'translations' => (object) array());
        }

        $slugs = array(Next_I18n::SOURCE_LOCALE => get_post_field('post_name', $product_id));
        $translations = array();
        $stored = Next_I18n::get_translations($product_id);

        foreach (Next_I18n::target_locales() as $locale) {
            if (empty($stored[$locale]) || !is_array($stored[$locale])) {
                continue;
            }
            if (!empty($stored[$locale]['slug'])) {
                $slugs[$locale] = (string) $stored[$locale]['slug'];
            }
            if (!empty($stored[$locale]['title'])) {
                $translations[$locale] = array('title' => (string) $stored[$locale]['title']);
            }
        }

        return array(
            // Parent product id (the Store API only exposes the variation id for variations)
            'product_id'   => $product_id,
            'slugs'        => $slugs,
            'translations' => $translations ? $translations : (object) array(),
        );
    }

    public static function cart_item_schema() {
        return array(
            'product_id'   => array(
                'description' => __('ID del prodotto (padre, per le variazioni)', 'next-i18n'),
                'type'        => 'integer',
                'context'     => array('view', 'edit'),
                'readonly'    => true,
            ),
            'slugs'        => array(
                'description' => __('Slug del prodotto per lingua', 'next-i18n'),
                'type'        => 'object',
                'context'     => array('view', 'edit'),
                'readonly'    => true,
            ),
            'translations' => array(
                'description' => __('Titolo del prodotto per lingua', 'next-i18n'),
                'type'        => 'object',
                'context'     => array('view', 'edit'),
                'readonly'    => true,
            ),
        );
    }
}
