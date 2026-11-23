<?php
/**
 * The "tour" WooCommerce product type.
 *
 * A tour is a virtual, sold-individually product: each cart line is one
 * booking (date + participants), priced by Next_Tours_Pricing. Its regular
 * price is the lowest advertised price, so listings and sorting still work.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Product_Type {

    public static function init() {
        self::define_class();
        add_filter('product_type_selector', array(__CLASS__, 'selector'));
        add_filter('woocommerce_product_class', array(__CLASS__, 'product_class'), 10, 2);
        add_filter('woocommerce_data_stores', array(__CLASS__, 'data_store'));
    }

    /** WooCommerce classes are only available once WooCommerce is loaded. */
    private static function define_class() {
        if (class_exists('WC_Product_Tour') || !class_exists('WC_Product_Simple')) {
            return;
        }
        require_once NEXT_TOURS_DIR . 'includes/class-wc-product-tour.php';
    }

    public static function selector($types) {
        $types[Next_Tours::TYPE] = __('Tour / Esperienza', 'next-tours');
        return $types;
    }

    public static function product_class($classname, $product_type) {
        return $product_type === Next_Tours::TYPE ? 'WC_Product_Tour' : $classname;
    }

    /** Tours are stored like simple products. */
    public static function data_store($stores) {
        if (!isset($stores['product-' . Next_Tours::TYPE]) && isset($stores['product'])) {
            $stores['product-' . Next_Tours::TYPE] = $stores['product'];
        }
        return $stores;
    }
}
