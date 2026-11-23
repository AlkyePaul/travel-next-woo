<?php
/**
 * Catalog ordering/filtering for products shown as "price on request".
 *
 * A product with an empty price (quote tours) is treated as the most expensive
 * one: last when sorting by price ascending, first when descending, excluded by
 * a maximum price filter and included by a minimum-only one. WooCommerce would
 * otherwise read the empty price as 0 and list these tours as the cheapest.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Catalog {
    /** Pending price sort direction ('ASC' / 'DESC'), applied to the next product query. */
    private static $price_order = null;

    public static function init() {
        add_filter('woocommerce_get_catalog_ordering_args', array(__CLASS__, 'ordering_args'), 10, 3);
        add_filter('posts_clauses', array(__CLASS__, 'price_on_request_order'), 20, 2);
        add_filter('woocommerce_get_min_max_price_meta_query', array(__CLASS__, 'price_filter_meta_query'), 10, 2);
    }

    /** Remembers a price sort (shop pages and REST /products?orderby=price). */
    public static function ordering_args($args, $orderby, $order) {
        if ($orderby === 'price') {
            self::$price_order = strtoupper((string) $order) === 'DESC' ? 'DESC' : 'ASC';
        }
        return $args;
    }

    /** Puts "price on request" products after (ASC) or before (DESC) the priced ones. */
    public static function price_on_request_order($clauses, $query) {
        if (self::$price_order === null || !self::is_product_query($query)) {
            return $clauses;
        }
        $direction = self::$price_order;
        self::$price_order = null;

        global $wpdb;
        $on_request = "NOT EXISTS (SELECT 1 FROM {$wpdb->postmeta} nt_price"
            . " WHERE nt_price.post_id = {$wpdb->posts}.ID AND nt_price.meta_key = '_price' AND nt_price.meta_value <> '')";
        $clauses['orderby'] = $on_request . ' ' . $direction
            . (trim((string) $clauses['orderby']) !== '' ? ', ' . $clauses['orderby'] : '');
        return $clauses;
    }

    /** REST min_price / max_price filters (meta query on _price, where '' would count as 0). */
    public static function price_filter_meta_query($meta_query, $args) {
        $has_max = isset($args['max_price']) && $args['max_price'] !== '' && $args['max_price'] !== null;
        if ($has_max) {
            return array(
                'relation' => 'AND',
                $meta_query,
                array('key' => '_price', 'value' => '', 'compare' => '!='),
            );
        }
        return array(
            'relation' => 'OR',
            $meta_query,
            array('key' => '_price', 'value' => '', 'compare' => '='),
            array('key' => '_price', 'compare' => 'NOT EXISTS'),
        );
    }

    private static function is_product_query($query) {
        if (!$query instanceof WP_Query) {
            return false;
        }
        $types = (array) $query->get('post_type');
        return in_array('product', $types, true);
    }
}
