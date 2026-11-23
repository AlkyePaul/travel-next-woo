<?php
/**
 * Bookings in the WooCommerce cart (used through the Store API by Next.js).
 *
 * POST /wc/store/v1/cart/add-item
 *   { id: 123, quantity: 1, next_tour: { mode, departure_id|date+time, participants, units, extras } }
 *
 * The booking is validated and priced here (never trusted from the browser),
 * stored as cart item data, and exposed back on each cart item as
 * items[].extensions["next-tours"].booking.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Cart {
    const CART_KEY = 'next_tour';
    const STORE_NS = 'next-tours';

    /** Product id validated by the Store API filter, for the legacy validation hook. */
    private static $validated_product = 0;
    private static $registered = false;

    public static function init() {
        add_filter('woocommerce_store_api_add_to_cart_data', array(__CLASS__, 'store_api_add_data'), 10, 2);
        add_filter('woocommerce_add_to_cart_validation', array(__CLASS__, 'legacy_validation'), 10, 2);
        add_action('woocommerce_before_calculate_totals', array(__CLASS__, 'set_prices'), 20);
        add_filter('woocommerce_get_item_data', array(__CLASS__, 'item_data'), 10, 2);
        add_filter('woocommerce_get_cart_item_from_session', array(__CLASS__, 'from_session'), 10, 2);

        add_action('woocommerce_blocks_loaded', array(__CLASS__, 'register_extension'));
        add_action('init', array(__CLASS__, 'register_extension'), 20);
    }

    /**
     * Store API add-to-cart: validate the booking and attach it to the cart item.
     *
     * @throws Exception (RouteException) when the booking is missing or invalid
     */
    public static function store_api_add_data($data, $request) {
        $product = isset($data['id']) ? wc_get_product($data['id']) : null;
        if (!$product || !Next_Tours::is_tour($product)) {
            return $data;
        }

        $raw = $request instanceof WP_REST_Request ? $request->get_param('next_tour') : null;
        if (!is_array($raw)) {
            self::fail('next_tours_booking_required', __('Scegli data e partecipanti per prenotare questo tour.', 'next-tours'));
        }

        $booking_request = Next_Tours_Pricing::normalize_request($raw);
        $booking_request['product_id'] = $product->get_id();
        $quote = Next_Tours_Pricing::quote($product->get_id(), $booking_request);
        if (!$quote['valid']) {
            $message = $quote['errors'] ? $quote['errors'][0]['message'] : __('Prenotazione non valida.', 'next-tours');
            $code = $quote['errors'] ? 'next_tours_' . $quote['errors'][0]['code'] : 'next_tours_invalid_booking';
            self::fail($code, $message, array('errors' => $quote['errors']));
        }

        $data['quantity'] = 1;
        if (!isset($data['cart_item_data']) || !is_array($data['cart_item_data'])) {
            $data['cart_item_data'] = array();
        }
        $data['cart_item_data'][self::CART_KEY] = Next_Tours_Pricing::to_booking($product->get_id(), $quote);
        self::$validated_product = $product->get_id();
        return $data;
    }

    /** Tours can only be added with a booking (blocks the classic add-to-cart). */
    public static function legacy_validation($passed, $product_id) {
        if (!$passed || !Next_Tours::is_tour($product_id)) {
            return $passed;
        }
        if (self::$validated_product === (int) $product_id) {
            return true;
        }
        wc_add_notice(__('Scegli data e partecipanti per prenotare questo tour.', 'next-tours'), 'error');
        return false;
    }

    public static function set_prices($cart) {
        if (!$cart || (is_admin() && !wp_doing_ajax())) {
            return;
        }
        foreach ($cart->get_cart() as $item) {
            if (isset($item[self::CART_KEY]['total'])) {
                $item['data']->set_price((float) $item[self::CART_KEY]['total']);
            }
        }
    }

    /** Keep the booking when the cart is restored from the session. */
    public static function from_session($item, $values) {
        if (isset($values[self::CART_KEY])) {
            $item[self::CART_KEY] = $values[self::CART_KEY];
        }
        return $item;
    }

    /** Booking details under the item name (classic cart and Store API item_data). */
    public static function item_data($item_data, $cart_item) {
        if (empty($cart_item[self::CART_KEY]) || !is_array($cart_item[self::CART_KEY])) {
            return $item_data;
        }
        foreach (Next_Tours_Orders::display_meta($cart_item[self::CART_KEY]) as $label => $value) {
            $item_data[] = array('key' => $label, 'value' => $value);
        }
        return $item_data;
    }

    // -----------------------------------------------------------------------
    // Store API extension: items[].extensions["next-tours"]
    // -----------------------------------------------------------------------

    public static function register_extension() {
        if (self::$registered || !function_exists('woocommerce_store_api_register_endpoint_data')) {
            return;
        }
        self::$registered = true;

        $endpoint = class_exists('\Automattic\WooCommerce\StoreApi\Schemas\V1\CartItemSchema')
            ? \Automattic\WooCommerce\StoreApi\Schemas\V1\CartItemSchema::IDENTIFIER
            : 'cart-item';

        woocommerce_store_api_register_endpoint_data(array(
            'endpoint'        => $endpoint,
            'namespace'       => self::STORE_NS,
            'data_callback'   => array(__CLASS__, 'extension_data'),
            'schema_callback' => array(__CLASS__, 'extension_schema'),
            'schema_type'     => ARRAY_A,
        ));
    }

    public static function extension_data($cart_item) {
        if (empty($cart_item[self::CART_KEY]) || !is_array($cart_item[self::CART_KEY])) {
            return array('booking' => null);
        }
        $b = $cart_item[self::CART_KEY];
        return array(
            'booking' => array(
                'mode'         => $b['mode'],
                'departure_id' => $b['departure_id'],
                'date'         => $b['date'],
                'time'         => $b['time'],
                'end_date'     => $b['end_date'],
                'on_request'   => (bool) $b['on_request'],
                'model'        => $b['model'],
                'people'       => (int) $b['people'],
                'units'        => (int) $b['units'],
                'participants' => $b['participants'],
                'extras'       => $b['extras'],
                'total'        => $b['total'],
                'request'      => $b['request'],
            ),
        );
    }

    public static function extension_schema() {
        return array(
            'booking' => array(
                'description' => __('Prenotazione del tour (data, partecipanti, extra)', 'next-tours'),
                'type'        => array('object', 'null'),
                'context'     => array('view', 'edit'),
                'readonly'    => true,
            ),
        );
    }

    private static function fail($code, $message, $data = array()) {
        if (class_exists('\Automattic\WooCommerce\StoreApi\Exceptions\RouteException')) {
            throw new \Automattic\WooCommerce\StoreApi\Exceptions\RouteException($code, $message, 400, $data);
        }
        throw new Exception($message);
    }
}
