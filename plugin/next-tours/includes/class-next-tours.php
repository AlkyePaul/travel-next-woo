<?php
/**
 * Data model shared by every part of the plugin.
 *
 * A tour is a WooCommerce product of type "tour". Its data lives in three
 * structured meta keys (arrays, one key each, so a product is read in one go):
 *
 *   _next_tour          descriptive info: kind, duration, itinerary, includes…
 *   _next_tour_booking  how it is booked: fixed departures and/or open dates,
 *                       instant or on-request confirmation, cutoff, capacity
 *   _next_tour_pricing  pricing model + extras
 *
 * Everything that reads them goes through get_info()/get_booking()/get_pricing(),
 * which merge defaults, so older products keep working when fields are added.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours {
    const TYPE = 'tour';
    const META_INFO = '_next_tour';
    const META_BOOKING = '_next_tour_booking';
    const META_PRICING = '_next_tour_pricing';

    // -----------------------------------------------------------------------
    // Option lists
    // -----------------------------------------------------------------------

    public static function kinds() {
        return array(
            'experience' => __('Esperienza', 'next-tours'),
            'day_tour'   => __('Tour giornaliero', 'next-tours'),
            'multi_day'  => __('Pacchetto multi-giorno', 'next-tours'),
        );
    }

    public static function duration_units() {
        return array(
            'minutes' => __('minuti', 'next-tours'),
            'hours'   => __('ore', 'next-tours'),
            'days'    => __('giorni', 'next-tours'),
        );
    }

    public static function difficulties() {
        return array(
            ''            => __('—', 'next-tours'),
            'easy'        => __('Facile', 'next-tours'),
            'moderate'    => __('Moderata', 'next-tours'),
            'challenging' => __('Impegnativa', 'next-tours'),
        );
    }

    public static function meals() {
        return array(
            'breakfast' => __('Colazione', 'next-tours'),
            'lunch'     => __('Pranzo', 'next-tours'),
            'dinner'    => __('Cena', 'next-tours'),
        );
    }

    public static function confirmation_modes() {
        return array(
            'instant'    => __('Immediata (pagamento subito)', 'next-tours'),
            'on_request' => __('Su richiesta (conferma manuale)', 'next-tours'),
        );
    }

    public static function departure_statuses() {
        return array(
            'open'      => __('Aperta', 'next-tours'),
            'closed'    => __('Chiusa', 'next-tours'),
            'cancelled' => __('Annullata', 'next-tours'),
        );
    }

    public static function pricing_models() {
        return array(
            'per_person'    => __('Per persona (prezzo unico)', 'next-tours'),
            'person_types'  => __('Per tipologia di partecipante (adulto, bambino…)', 'next-tours'),
            'group_tiers'   => __('Per persona, a scaglioni per numero di partecipanti', 'next-tours'),
            'private_group' => __('Gruppo privato (prezzo fisso + persona extra)', 'next-tours'),
            'per_unit'      => __('Per unità (barca, veicolo, camera…)', 'next-tours'),
            'quote'         => __('Su preventivo (nessun prezzo, sempre su richiesta)', 'next-tours'),
        );
    }

    public static function extra_per_options() {
        return array(
            'booking' => __('per prenotazione', 'next-tours'),
            'person'  => __('per persona', 'next-tours'),
            'day'     => __('per giorno', 'next-tours'),
            'unit'    => __('per unità', 'next-tours'),
        );
    }

    /** Suggested person types; keys are recognised (and translated) by the storefront. */
    public static function standard_person_types() {
        return array(
            'adult'   => __('Adulto', 'next-tours'),
            'child'   => __('Bambino', 'next-tours'),
            'infant'  => __('Neonato', 'next-tours'),
            'youth'   => __('Ragazzo', 'next-tours'),
            'senior'  => __('Senior', 'next-tours'),
            'student' => __('Studente', 'next-tours'),
        );
    }

    // -----------------------------------------------------------------------
    // Defaults
    // -----------------------------------------------------------------------

    public static function default_info() {
        return array(
            'kind'                => 'experience',
            'duration'            => array('value' => 0, 'unit' => 'hours'),
            'nights'              => 0,
            'difficulty'          => '',
            'min_age'             => 0,
            'group_size'          => array('min' => 0, 'max' => 0),
            'languages'           => array(),
            'meeting_point'       => array('address' => '', 'notes' => '', 'lat' => '', 'lng' => ''),
            'end_point'           => array('address' => ''),
            'highlights'          => array(),
            'itinerary'           => array(),
            'included'            => array(),
            'not_included'        => array(),
            'what_to_bring'       => array(),
            'important_info'      => '',
            'cancellation_policy' => '',
        );
    }

    public static function default_booking() {
        return array(
            'fixed_departures'    => false,
            'open_dates'          => false,
            'confirmation'        => 'instant',
            'cutoff_hours'        => 24,
            'booking_window_days' => 365,
            'min_per_booking'     => 1,
            'max_per_booking'     => 0,
            'departures'          => array(),
            'rules'               => array(),
            'blackouts'           => array(),
        );
    }

    public static function default_pricing() {
        return array(
            'model'        => 'per_person',
            'price'        => '',
            'person_types' => array(),
            'tiers'        => array(),
            'group'        => array('price' => '', 'included' => 1, 'extra_price' => '', 'max_people' => 0),
            'unit'         => array('label' => '', 'price' => '', 'capacity' => 0, 'max_units' => 0),
            'extras'       => array(),
        );
    }

    // -----------------------------------------------------------------------
    // Read
    // -----------------------------------------------------------------------

    public static function is_tour($product) {
        if (is_numeric($product)) {
            $product = wc_get_product($product);
        }
        return $product instanceof WC_Product && $product->get_type() === self::TYPE;
    }

    public static function get_info($product_id) {
        return self::merge(self::default_info(), get_post_meta($product_id, self::META_INFO, true));
    }

    public static function get_booking($product_id) {
        return self::merge(self::default_booking(), get_post_meta($product_id, self::META_BOOKING, true));
    }

    public static function get_pricing($product_id) {
        return self::merge(self::default_pricing(), get_post_meta($product_id, self::META_PRICING, true));
    }

    /** Defaults overlaid with stored values (one level deep for nested groups). */
    private static function merge(array $defaults, $stored) {
        if (!is_array($stored)) {
            return $defaults;
        }
        $out = $defaults;
        foreach ($stored as $key => $value) {
            if (!array_key_exists($key, $defaults)) {
                continue;
            }
            if (is_array($defaults[$key]) && self::is_assoc($defaults[$key]) && is_array($value)) {
                $out[$key] = array_merge($defaults[$key], $value);
            } else {
                $out[$key] = $value;
            }
        }
        return $out;
    }

    private static function is_assoc(array $value) {
        return $value !== array() && array_keys($value) !== range(0, count($value) - 1);
    }

    /** Length of the tour in days (1 for anything shorter than a day). */
    public static function duration_days(array $info) {
        $nights = (int) $info['nights'];
        if ($info['duration']['unit'] === 'days' && (int) $info['duration']['value'] > 0) {
            return max(1, (int) $info['duration']['value']);
        }
        return $nights > 0 ? $nights + 1 : 1;
    }

    // -----------------------------------------------------------------------
    // Sanitising (input comes from the product edit form)
    // -----------------------------------------------------------------------

    public static function sanitize_info($raw) {
        $raw = is_array($raw) ? $raw : array();
        $d = self::default_info();

        $itinerary = array();
        foreach (self::rows($raw, 'itinerary') as $row) {
            $title = self::text($row, 'title');
            $description = isset($row['description']) ? wp_kses_post(wp_unslash($row['description'])) : '';
            if ($title === '' && trim(wp_strip_all_tags($description)) === '') {
                continue;
            }
            $meals = array();
            foreach (array_keys(self::meals()) as $meal) {
                if (!empty($row['meals'][$meal])) {
                    $meals[] = $meal;
                }
            }
            $itinerary[] = array(
                'title'         => $title,
                'description'   => $description,
                'meals'         => $meals,
                'accommodation' => self::text($row, 'accommodation'),
            );
        }

        return array(
            'kind'                => self::choice($raw, 'kind', self::kinds(), $d['kind']),
            'duration'            => array(
                'value' => self::num(isset($raw['duration']) ? $raw['duration'] : array(), 'value'),
                'unit'  => self::choice(isset($raw['duration']) ? $raw['duration'] : array(), 'unit', self::duration_units(), 'hours'),
            ),
            'nights'              => self::int($raw, 'nights'),
            'difficulty'          => self::choice($raw, 'difficulty', self::difficulties(), ''),
            'min_age'             => self::int($raw, 'min_age'),
            'group_size'          => array(
                'min' => self::int(isset($raw['group_size']) ? $raw['group_size'] : array(), 'min'),
                'max' => self::int(isset($raw['group_size']) ? $raw['group_size'] : array(), 'max'),
            ),
            'languages'           => self::csv(isset($raw['languages']) ? $raw['languages'] : ''),
            'meeting_point'       => array(
                'address' => self::text(isset($raw['meeting_point']) ? $raw['meeting_point'] : array(), 'address'),
                'notes'   => self::textarea(isset($raw['meeting_point']) ? $raw['meeting_point'] : array(), 'notes'),
                'lat'     => self::coord(isset($raw['meeting_point']['lat']) ? $raw['meeting_point']['lat'] : ''),
                'lng'     => self::coord(isset($raw['meeting_point']['lng']) ? $raw['meeting_point']['lng'] : ''),
            ),
            'end_point'           => array(
                'address' => self::text(isset($raw['end_point']) ? $raw['end_point'] : array(), 'address'),
            ),
            'highlights'          => self::lines(isset($raw['highlights']) ? $raw['highlights'] : ''),
            'itinerary'           => $itinerary,
            'included'            => self::lines(isset($raw['included']) ? $raw['included'] : ''),
            'not_included'        => self::lines(isset($raw['not_included']) ? $raw['not_included'] : ''),
            'what_to_bring'       => self::lines(isset($raw['what_to_bring']) ? $raw['what_to_bring'] : ''),
            'important_info'      => self::textarea($raw, 'important_info'),
            'cancellation_policy' => self::textarea($raw, 'cancellation_policy'),
        );
    }

    public static function sanitize_booking($raw) {
        $raw = is_array($raw) ? $raw : array();
        $d = self::default_booking();

        $departures = array();
        $seen_ids = array();
        foreach (self::rows($raw, 'departures') as $row) {
            $date = self::date(isset($row['date']) ? $row['date'] : '');
            if ($date === '') {
                continue;
            }
            $id = isset($row['id']) ? preg_replace('/[^a-z0-9]/', '', strtolower((string) $row['id'])) : '';
            if ($id === '' || isset($seen_ids[$id])) {
                $id = self::new_id();
            }
            $seen_ids[$id] = true;
            $end = self::date(isset($row['end_date']) ? $row['end_date'] : '');
            $departures[] = array(
                'id'               => $id,
                'date'             => $date,
                'time'             => self::time(isset($row['time']) ? $row['time'] : ''),
                'end_date'         => ($end !== '' && $end >= $date) ? $end : '',
                'capacity'         => self::int($row, 'capacity'),
                'price_adjustment' => self::pct($row, 'price_adjustment'),
                'confirmation'     => self::choice($row, 'confirmation', array('inherit' => 1, 'instant' => 1, 'on_request' => 1), 'inherit'),
                'status'           => self::choice($row, 'status', self::departure_statuses(), 'open'),
                'guaranteed'       => !empty($row['guaranteed']),
                'note'             => self::text($row, 'note'),
            );
        }
        usort($departures, function ($a, $b) {
            return strcmp($a['date'] . ' ' . $a['time'], $b['date'] . ' ' . $b['time']);
        });

        $rules = array();
        foreach (self::rows($raw, 'rules') as $row) {
            $weekdays = array();
            for ($day = 1; $day <= 7; $day++) {
                if (!empty($row['weekdays'][$day])) {
                    $weekdays[] = $day;
                }
            }
            $times = array();
            foreach (self::csv(isset($row['times']) ? $row['times'] : '') as $time) {
                $time = self::time($time);
                if ($time !== '') {
                    $times[] = $time;
                }
            }
            $times = array_values(array_unique($times));
            sort($times);
            $from = self::date(isset($row['from']) ? $row['from'] : '');
            $to = self::date(isset($row['to']) ? $row['to'] : '');
            if (!$weekdays && $from === '' && $to === '') {
                continue; // empty row
            }
            $rules[] = array(
                'from'             => $from,
                'to'               => $to,
                'weekdays'         => $weekdays ? $weekdays : range(1, 7),
                'times'            => $times,
                'capacity'         => self::int($row, 'capacity'),
                'price_adjustment' => self::pct($row, 'price_adjustment'),
            );
        }

        $blackouts = array();
        foreach (self::lines(isset($raw['blackouts']) ? $raw['blackouts'] : '') as $line) {
            $date = self::date($line);
            if ($date !== '') {
                $blackouts[] = $date;
            }
        }
        $blackouts = array_values(array_unique($blackouts));
        sort($blackouts);

        return array(
            'fixed_departures'    => !empty($raw['fixed_departures']),
            'open_dates'          => !empty($raw['open_dates']),
            'confirmation'        => self::choice($raw, 'confirmation', self::confirmation_modes(), $d['confirmation']),
            'cutoff_hours'        => self::int($raw, 'cutoff_hours'),
            'booking_window_days' => max(1, self::int($raw, 'booking_window_days', $d['booking_window_days'])),
            'min_per_booking'     => max(1, self::int($raw, 'min_per_booking', 1)),
            'max_per_booking'     => self::int($raw, 'max_per_booking'),
            'departures'          => $departures,
            'rules'               => $rules,
            'blackouts'           => $blackouts,
        );
    }

    public static function sanitize_pricing($raw) {
        $raw = is_array($raw) ? $raw : array();
        $d = self::default_pricing();

        $person_types = array();
        $used_keys = array();
        foreach (self::rows($raw, 'person_types') as $row) {
            $label = self::text($row, 'label');
            if ($label === '') {
                continue;
            }
            $key = self::unique_key(isset($row['key']) && $row['key'] !== '' ? $row['key'] : $label, $used_keys);
            $person_types[] = array(
                'key'             => $key,
                'label'           => $label,
                'price'           => self::money($row, 'price'),
                'min_age'         => self::int($row, 'min_age'),
                'max_age'         => self::int($row, 'max_age'),
                'min'             => self::int($row, 'min'),
                'max'             => self::int($row, 'max'),
                'counts_capacity' => !empty($row['counts_capacity']),
            );
        }

        $tiers = array();
        foreach (self::rows($raw, 'tiers') as $row) {
            if (!isset($row['price']) || $row['price'] === '') {
                continue;
            }
            $tiers[] = array(
                'min'   => max(1, self::int($row, 'min', 1)),
                'max'   => self::int($row, 'max'),
                'price' => self::money($row, 'price'),
            );
        }
        usort($tiers, function ($a, $b) {
            return $a['min'] - $b['min'];
        });

        $extras = array();
        $used_keys = array();
        foreach (self::rows($raw, 'extras') as $row) {
            $label = self::text($row, 'label');
            if ($label === '') {
                continue;
            }
            $extras[] = array(
                'key'      => self::unique_key(isset($row['key']) && $row['key'] !== '' ? $row['key'] : $label, $used_keys),
                'label'    => $label,
                'price'    => self::money($row, 'price'),
                'per'      => self::choice($row, 'per', self::extra_per_options(), 'booking'),
                'required' => !empty($row['required']),
            );
        }

        $group = isset($raw['group']) && is_array($raw['group']) ? $raw['group'] : array();
        $unit = isset($raw['unit']) && is_array($raw['unit']) ? $raw['unit'] : array();

        return array(
            'model'        => self::choice($raw, 'model', self::pricing_models(), $d['model']),
            'price'        => self::money($raw, 'price'),
            'person_types' => $person_types,
            'tiers'        => $tiers,
            'group'        => array(
                'price'       => self::money($group, 'price'),
                'included'    => max(1, self::int($group, 'included', 1)),
                'extra_price' => self::money($group, 'extra_price'),
                'max_people'  => self::int($group, 'max_people'),
            ),
            'unit'         => array(
                'label'     => self::text($unit, 'label'),
                'price'     => self::money($unit, 'price'),
                'capacity'  => self::int($unit, 'capacity'),
                'max_units' => self::int($unit, 'max_units'),
            ),
            'extras'       => $extras,
        );
    }

    // -----------------------------------------------------------------------
    // Small helpers
    // -----------------------------------------------------------------------

    public static function timezone() {
        return wp_timezone();
    }

    /** Today in the site's timezone, Y-m-d. */
    public static function today() {
        return (new DateTimeImmutable('now', self::timezone()))->format('Y-m-d');
    }

    public static function new_id() {
        return strtolower(wp_generate_password(8, false, false));
    }

    private static function rows($raw, $key) {
        if (empty($raw[$key]) || !is_array($raw[$key])) {
            return array();
        }
        // Rows posted from the repeater are keyed by a random index; the template row is "__i__".
        $rows = array();
        foreach ($raw[$key] as $index => $row) {
            if ($index === '__i__' || !is_array($row)) {
                continue;
            }
            $rows[] = $row;
        }
        return $rows;
    }

    private static function text($row, $key) {
        return isset($row[$key]) ? sanitize_text_field(wp_unslash($row[$key])) : '';
    }

    private static function textarea($row, $key) {
        return isset($row[$key]) ? sanitize_textarea_field(wp_unslash($row[$key])) : '';
    }

    private static function int($row, $key, $default = 0) {
        return isset($row[$key]) && $row[$key] !== '' ? max(0, (int) $row[$key]) : $default;
    }

    private static function num($row, $key) {
        return isset($row[$key]) && $row[$key] !== '' ? max(0, (float) str_replace(',', '.', $row[$key])) : 0;
    }

    /** Percentage adjustment, -100…+1000. */
    private static function pct($row, $key) {
        if (!isset($row[$key]) || $row[$key] === '') {
            return 0;
        }
        return max(-100, min(1000, round((float) str_replace(',', '.', $row[$key]), 2)));
    }

    private static function money($row, $key) {
        if (!isset($row[$key]) || trim((string) $row[$key]) === '') {
            return '';
        }
        return wc_format_decimal(wp_unslash($row[$key]));
    }

    private static function choice($row, $key, array $options, $default) {
        $value = isset($row[$key]) ? (string) $row[$key] : '';
        return array_key_exists($value, $options) ? $value : $default;
    }

    private static function lines($text) {
        $text = is_array($text) ? implode("\n", $text) : (string) $text;
        $out = array();
        foreach (preg_split('/\r\n|\r|\n/', wp_unslash($text)) as $line) {
            $line = sanitize_text_field($line);
            if ($line !== '') {
                $out[] = $line;
            }
        }
        return $out;
    }

    private static function csv($text) {
        $text = is_array($text) ? implode(',', $text) : (string) $text;
        $out = array();
        foreach (explode(',', wp_unslash($text)) as $part) {
            $part = sanitize_text_field($part);
            if ($part !== '') {
                $out[] = $part;
            }
        }
        return $out;
    }

    private static function coord($value) {
        $value = trim(str_replace(',', '.', (string) $value));
        return is_numeric($value) ? (string) round((float) $value, 6) : '';
    }

    public static function date($value) {
        $value = trim((string) $value);
        if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
            return '';
        }
        return $value;
    }

    public static function time($value) {
        $value = trim((string) $value);
        if (!preg_match('/^(\d{1,2})[:.](\d{2})$/', $value, $m) || (int) $m[1] > 23 || (int) $m[2] > 59) {
            return '';
        }
        return sprintf('%02d:%02d', (int) $m[1], (int) $m[2]);
    }

    private static function unique_key($value, array &$used) {
        $base = substr(sanitize_key(remove_accents(str_replace(' ', '_', (string) $value))), 0, 32);
        if ($base === '') {
            $base = 'item';
        }
        $key = $base;
        $n = 2;
        while (isset($used[$key])) {
            $key = $base . '_' . $n++;
        }
        $used[$key] = true;
        return $key;
    }
}
