<?php
/**
 * Orders containing tour bookings.
 *
 * The storefront creates orders through POST /wc/v3/orders, sending each tour
 * line with its booking request in the `_next_tour_request` meta. Before the
 * order is saved the booking is re-validated (dates, capacity) and re-priced
 * here, so the line total always comes from WordPress.
 *
 * If any booking needs manual confirmation the whole order gets the
 * "Richiesta di prenotazione" status (wc-tour-request): no payment is
 * possible until the admin confirms it (→ pending + payment link e-mail) or
 * declines it (→ cancelled).
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Orders {
    const STATUS = 'tour-request';
    /** Line item meta posted by the storefront (booking request, re-validated here). */
    const REQUEST_META = '_next_tour_request';
    /** Order meta: the order contains at least one tour booking. */
    const HAS_BOOKING_META = '_next_tours_has_booking';

    public static function init() {
        add_action('init', array(__CLASS__, 'register_status'));
        add_filter('wc_order_statuses', array(__CLASS__, 'add_status'));
        add_filter('wc_order_is_editable', array(__CLASS__, 'is_editable'), 10, 2);
        add_filter('woocommerce_hidden_order_itemmeta', array(__CLASS__, 'hidden_meta'));

        add_filter('woocommerce_rest_pre_insert_shop_order_object', array(__CLASS__, 'rest_pre_insert'), 10, 3);
        add_action('woocommerce_rest_insert_shop_order_object', array(__CLASS__, 'rest_after_insert'), 10, 3);

        // Classic / Store API checkout (not used by the storefront, kept consistent).
        add_action('woocommerce_checkout_create_order_line_item', array(__CLASS__, 'checkout_line_item'), 10, 4);
    }

    public static function register_status() {
        register_post_status('wc-' . self::STATUS, array(
            'label'                     => _x('Richiesta di prenotazione', 'Order status', 'next-tours'),
            'public'                    => false,
            'exclude_from_search'       => false,
            'show_in_admin_all_list'    => true,
            'show_in_admin_status_list' => true,
            /* translators: %s: number of orders */
            'label_count'               => _n_noop('Richiesta di prenotazione <span class="count">(%s)</span>', 'Richieste di prenotazione <span class="count">(%s)</span>', 'next-tours'),
        ));
    }

    public static function add_status($statuses) {
        $out = array();
        foreach ($statuses as $key => $label) {
            $out[$key] = $label;
            if ($key === 'wc-pending') {
                $out['wc-' . self::STATUS] = _x('Richiesta di prenotazione', 'Order status', 'next-tours');
            }
        }
        if (!isset($out['wc-' . self::STATUS])) {
            $out['wc-' . self::STATUS] = _x('Richiesta di prenotazione', 'Order status', 'next-tours');
        }
        return $out;
    }

    /** Requests stay editable so the admin can adjust prices (e.g. quotes) before confirming. */
    public static function is_editable($editable, $order) {
        return $editable || ($order instanceof WC_Order && $order->has_status(self::STATUS));
    }

    public static function hidden_meta($keys) {
        $keys[] = Next_Tours_Bookings::ITEM_META;
        $keys[] = self::REQUEST_META;
        return $keys;
    }

    // -----------------------------------------------------------------------
    // Orders created by the storefront (REST)
    // -----------------------------------------------------------------------

    /**
     * @throws WC_REST_Exception when a booking is missing or no longer valid
     */
    public static function rest_pre_insert($order, $request, $creating) {
        if (!$creating || !($order instanceof WC_Order)) {
            return $order;
        }

        $has_tour = false;
        $on_request = false;

        foreach ($order->get_items('line_item') as $item) {
            $product = $item->get_product();
            if (!$product || !Next_Tours::is_tour($product)) {
                continue;
            }
            $has_tour = true;

            $raw = $item->get_meta(self::REQUEST_META, true);
            if (is_string($raw)) {
                $raw = json_decode($raw, true);
            }
            if (!is_array($raw)) {
                throw new WC_REST_Exception('next_tours_booking_required', __('Manca la prenotazione (data e partecipanti) per un tour.', 'next-tours'), 400);
            }

            $booking_request = Next_Tours_Pricing::normalize_request($raw);
            $booking_request['product_id'] = $product->get_id();
            $quote = Next_Tours_Pricing::quote($product->get_id(), $booking_request);
            if (!$quote['valid']) {
                $error = $quote['errors'] ? $quote['errors'][0] : array('code' => 'invalid_booking', 'message' => __('Prenotazione non valida.', 'next-tours'));
                throw new WC_REST_Exception(
                    'next_tours_' . $error['code'],
                    /* translators: 1: tour name, 2: reason */
                    sprintf(__('%1$s: %2$s', 'next-tours'), $product->get_name(), $error['message']),
                    400
                );
            }

            $booking = Next_Tours_Pricing::to_booking($product->get_id(), $quote);
            self::apply_booking($item, $booking, $product, true);
            $item->delete_meta_data(self::REQUEST_META);
            if ($booking['on_request']) {
                $on_request = true;
            }
        }

        if ($has_tour) {
            $order->update_meta_data(self::HAS_BOOKING_META, 'yes');
        }
        if ($on_request) {
            $order->set_status(self::STATUS);
        }
        return $order;
    }

    public static function rest_after_insert($order, $request, $creating) {
        if (!$creating || !($order instanceof WC_Order) || $order->get_meta(self::HAS_BOOKING_META) !== 'yes') {
            return;
        }
        Next_Tours_Bookings::sync_order($order);
        if ($order->has_status(self::STATUS)) {
            Next_Tours_Emails::send_request_emails($order);
        }
    }

    public static function checkout_line_item($item, $cart_item_key, $values, $order) {
        if (empty($values[Next_Tours_Cart::CART_KEY]) || !is_array($values[Next_Tours_Cart::CART_KEY])) {
            return;
        }
        self::apply_booking($item, $values[Next_Tours_Cart::CART_KEY], $item->get_product(), false);
        $order->update_meta_data(self::HAS_BOOKING_META, 'yes');
    }

    /** Store the booking on an order line (and, for REST orders, its price). */
    public static function apply_booking($item, array $booking, $product, $set_price) {
        if ($set_price && $product) {
            $item->set_quantity(1);
            $total = wc_get_price_excluding_tax($product, array('qty' => 1, 'price' => (float) $booking['total']));
            $item->set_subtotal($total);
            $item->set_total($total);
        }
        $item->update_meta_data(Next_Tours_Bookings::ITEM_META, $booking);
        foreach (self::display_meta($booking) as $label => $value) {
            $item->update_meta_data($label, $value);
        }
    }

    /** Human-readable booking details (order screen, e-mails, cart). */
    public static function display_meta(array $booking) {
        $tz = Next_Tours::timezone();
        $format = get_option('date_format');
        $meta = array();

        $start = DateTimeImmutable::createFromFormat('!Y-m-d', $booking['date'], $tz);
        if ($start) {
            $when = wp_date($format, $start->getTimestamp(), $tz);
            if (!empty($booking['time'])) {
                $when .= ' ' . $booking['time'];
            }
            if (!empty($booking['end_date']) && $booking['end_date'] !== $booking['date']) {
                $end = DateTimeImmutable::createFromFormat('!Y-m-d', $booking['end_date'], $tz);
                if ($end) {
                    $when .= ' → ' . wp_date($format, $end->getTimestamp(), $tz);
                }
            }
            $meta[__('Data', 'next-tours')] = $when;
        }

        $people = array();
        foreach ((array) $booking['participants'] as $p) {
            if ((int) $p['count'] > 0) {
                $people[] = (int) $p['count'] . ' × ' . $p['label'];
            }
        }
        if ($people) {
            $meta[__('Partecipanti', 'next-tours')] = implode(', ', $people);
        }
        if (!empty($booking['units'])) {
            $meta[__('Unità', 'next-tours')] = (string) (int) $booking['units'];
        }

        $extras = array();
        foreach ((array) $booking['extras'] as $extra) {
            $extras[] = ((int) $extra['qty'] > 1 ? (int) $extra['qty'] . ' × ' : '') . $extra['label'];
        }
        if ($extras) {
            $meta[__('Extra', 'next-tours')] = implode(', ', $extras);
        }

        if (!empty($booking['on_request'])) {
            $meta[__('Conferma', 'next-tours')] = __('Su richiesta', 'next-tours');
        }
        return $meta;
    }

    /** Tour bookings stored on an order: [ item_id => booking ]. */
    public static function bookings_of($order) {
        $out = array();
        foreach ($order->get_items('line_item') as $item_id => $item) {
            $booking = $item->get_meta(Next_Tours_Bookings::ITEM_META, true);
            if (is_array($booking) && !empty($booking['date'])) {
                $out[$item_id] = $booking;
            }
        }
        return $out;
    }
}
