<?php
/**
 * REST exposure for the Next.js storefront.
 *
 *  - `tour` field on products (wc/v3 and wp/v2): info, booking settings,
 *    public pricing and translations; null for non-tour products
 *  - GET  /wp-json/next-tours/v1/availability?product=ID&from=Y-m-d&to=Y-m-d
 *  - POST /wp-json/next-tours/v1/quote   (booking request, see Next_Tours_Pricing)
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Rest {
    const NS = 'next-tours/v1';
    const DEFAULT_RANGE_DAYS = 62;

    public static function init() {
        add_action('rest_api_init', array(__CLASS__, 'register'));
    }

    public static function register() {
        register_rest_field('product', 'tour', array(
            'get_callback' => array(__CLASS__, 'field'),
            'schema'       => array(
                'description' => __('Dati del tour (null se il prodotto non è un tour)', 'next-tours'),
                'type'        => array('object', 'null'),
                'context'     => array('view', 'edit'),
                'readonly'    => true,
            ),
        ));

        register_rest_route(self::NS, '/availability', array(
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => array(__CLASS__, 'availability'),
            'args'                => array(
                'product' => array('required' => true, 'sanitize_callback' => 'absint'),
                'from'    => array('required' => false, 'type' => 'string'),
                'to'      => array('required' => false, 'type' => 'string'),
            ),
        ));

        register_rest_route(self::NS, '/quote', array(
            'methods'             => 'POST',
            'permission_callback' => '__return_true',
            'callback'            => array(__CLASS__, 'quote'),
        ));
    }

    /** The product, if it is a published (or previewable) tour. */
    private static function get_tour($product_id) {
        $product = $product_id ? wc_get_product($product_id) : null;
        if (!$product || !Next_Tours::is_tour($product)) {
            return null;
        }
        if ($product->get_status() !== 'publish' && !current_user_can('edit_post', $product_id)) {
            return null;
        }
        return $product;
    }

    public static function field($object) {
        $id = is_array($object) && isset($object['id']) ? (int) $object['id'] : 0;
        $product = $id ? wc_get_product($id) : null;
        if (!$product || !Next_Tours::is_tour($product)) {
            return null;
        }
        return self::public_data($id);
    }

    /** Everything the storefront needs to render a tour page (no internal fields). */
    public static function public_data($id) {
        $info = Next_Tours::get_info($id);
        $booking = Next_Tours::get_booking($id);
        $pricing = Next_Tours::get_pricing($id);

        $next = null;
        if ($booking['fixed_departures']) {
            $today = Next_Tours::today();
            foreach ($booking['departures'] as $dep) {
                if ($dep['status'] === 'open' && $dep['date'] >= $today) {
                    $next = array('date' => $dep['date'], 'time' => $dep['time']);
                    break;
                }
            }
        }

        $person_types = array();
        foreach ($pricing['person_types'] as $type) {
            $person_types[] = array(
                'key'             => $type['key'],
                'label'           => $type['label'],
                'price'           => $type['price'] === '' ? '0' : $type['price'],
                'min_age'         => (int) $type['min_age'],
                'max_age'         => (int) $type['max_age'],
                'min'             => (int) $type['min'],
                'max'             => (int) $type['max'],
                'counts_capacity' => (bool) $type['counts_capacity'],
            );
        }

        $itinerary = array();
        foreach ($info['itinerary'] as $stop) {
            $itinerary[] = array(
                'title'         => $stop['title'],
                'description'   => wpautop($stop['description']),
                'meals'         => $stop['meals'],
                'accommodation' => $stop['accommodation'],
            );
        }

        return array(
            'kind'                => $info['kind'],
            'duration'            => array('value' => (float) $info['duration']['value'], 'unit' => $info['duration']['unit']),
            'nights'              => (int) $info['nights'],
            'days'                => Next_Tours::duration_days($info),
            'difficulty'          => $info['difficulty'],
            'min_age'             => (int) $info['min_age'],
            'group_size'          => array('min' => (int) $info['group_size']['min'], 'max' => (int) $info['group_size']['max']),
            'languages'           => array_values($info['languages']),
            'meeting_point'       => $info['meeting_point'],
            'end_point'           => $info['end_point'],
            'highlights'          => array_values($info['highlights']),
            'itinerary'           => $itinerary,
            'included'            => array_values($info['included']),
            'not_included'        => array_values($info['not_included']),
            'what_to_bring'       => array_values($info['what_to_bring']),
            'important_info'      => $info['important_info'],
            'cancellation_policy' => $info['cancellation_policy'],
            'booking'             => array(
                'fixed_departures'    => (bool) $booking['fixed_departures'],
                'open_dates'          => (bool) $booking['open_dates'],
                'confirmation'        => Next_Tours_Availability::confirmation_for($booking, $pricing),
                'cutoff_hours'        => (int) $booking['cutoff_hours'],
                'booking_window_days' => (int) $booking['booking_window_days'],
                'min_per_booking'     => (int) $booking['min_per_booking'],
                'max_per_booking'     => (int) $booking['max_per_booking'],
                'next_departure'      => $next,
            ),
            'pricing'             => array(
                'model'        => $pricing['model'],
                'from_price'   => Next_Tours_Pricing::from_price($pricing),
                'currency'     => get_woocommerce_currency(),
                'price'        => $pricing['price'],
                'person_types' => $person_types,
                'tiers'        => $pricing['tiers'],
                'group'        => $pricing['group'],
                'unit'         => $pricing['unit'],
                'extras'       => array_map(function ($extra) {
                    return array(
                        'key'      => $extra['key'],
                        'label'    => $extra['label'],
                        'price'    => $extra['price'] === '' ? '0' : $extra['price'],
                        'per'      => $extra['per'],
                        'required' => (bool) $extra['required'],
                    );
                }, $pricing['extras']),
            ),
            'i18n'                => Next_Tours_Translations::rest_field($id),
        );
    }

    public static function availability(WP_REST_Request $request) {
        $product_id = (int) $request->get_param('product');
        if (!self::get_tour($product_id)) {
            return new WP_Error('next_tours_not_found', __('Tour non trovato.', 'next-tours'), array('status' => 404));
        }

        $today = Next_Tours::today();
        $from = Next_Tours::date((string) $request->get_param('from'));
        $to = Next_Tours::date((string) $request->get_param('to'));
        if ($from === '') {
            $from = $today;
        }
        $from_dt = DateTimeImmutable::createFromFormat('!Y-m-d', $from, Next_Tours::timezone());
        if ($to === '' || $to < $from) {
            $to = $from_dt->modify('+' . self::DEFAULT_RANGE_DAYS . ' days')->format('Y-m-d');
        }
        $max = $from_dt->modify('+' . Next_Tours_Availability::MAX_RANGE_DAYS . ' days')->format('Y-m-d');
        if ($to > $max) {
            $to = $max;
        }

        $response = rest_ensure_response(Next_Tours_Availability::get($product_id, $from, $to));
        $response->header('Cache-Control', 'no-store');
        return $response;
    }

    public static function quote(WP_REST_Request $request) {
        $params = $request->get_json_params();
        $booking_request = Next_Tours_Pricing::normalize_request(is_array($params) ? $params : $request->get_params());
        if (!self::get_tour($booking_request['product_id'])) {
            return new WP_Error('next_tours_not_found', __('Tour non trovato.', 'next-tours'), array('status' => 404));
        }
        $quote = Next_Tours_Pricing::quote($booking_request['product_id'], $booking_request);
        $response = rest_ensure_response($quote);
        $response->header('Cache-Control', 'no-store');
        return $response;
    }
}
