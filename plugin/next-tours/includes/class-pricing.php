<?php
/**
 * Price calculation. The only place a booking price is computed: the
 * storefront asks for quotes, the cart and the order creation recompute them,
 * so a tampered browser request can never set its own price.
 *
 * Booking request (from the storefront):
 *   {
 *     product_id: 123,
 *     mode: "departure" | "date",
 *     departure_id: "ab12cd34",          // mode=departure
 *     date: "2026-12-12", time: "09:00", // mode=date
 *     participants: { adult: 2, child: 1 } // person_types model
 *                 | { people: 3 },        // every other model
 *     units: 1,                           // per_unit model
 *     extras: ["pickup", "lunch"]
 *   }
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Pricing {

    /** Normalise an untrusted booking request. */
    public static function normalize_request($raw) {
        $raw = is_array($raw) ? $raw : array();
        $participants = array();
        if (!empty($raw['participants']) && is_array($raw['participants'])) {
            foreach ($raw['participants'] as $key => $count) {
                $key = sanitize_key($key);
                if ($key !== '') {
                    $participants[$key] = max(0, min(999, (int) $count));
                }
            }
        }
        $extras = array();
        if (!empty($raw['extras']) && is_array($raw['extras'])) {
            foreach ($raw['extras'] as $key) {
                $key = sanitize_key(is_string($key) ? $key : '');
                if ($key !== '') {
                    $extras[] = $key;
                }
            }
        }
        $mode = isset($raw['mode']) && in_array($raw['mode'], array('departure', 'date'), true) ? $raw['mode'] : '';

        return array(
            'product_id'   => isset($raw['product_id']) ? absint($raw['product_id']) : 0,
            'mode'         => $mode,
            'departure_id' => isset($raw['departure_id']) ? preg_replace('/[^a-z0-9]/', '', strtolower((string) $raw['departure_id'])) : '',
            'date'         => Next_Tours::date(isset($raw['date']) ? $raw['date'] : ''),
            'time'         => Next_Tours::time(isset($raw['time']) ? $raw['time'] : ''),
            'participants' => $participants,
            'units'        => isset($raw['units']) ? max(0, min(999, (int) $raw['units'])) : 0,
            'extras'       => array_values(array_unique($extras)),
        );
    }

    /**
     * Price (and validate) a booking request.
     *
     * Without a date (mode "") the price is computed with no date adjustment
     * and `valid` is false: useful for showing a price while the customer is
     * still choosing.
     *
     * @return array see bottom of the method
     */
    public static function quote($product_id, array $request, $exclude_order_id = 0) {
        $info = Next_Tours::get_info($product_id);
        $booking = Next_Tours::get_booking($product_id);
        $pricing = Next_Tours::get_pricing($product_id);
        $decimals = wc_get_price_decimals();
        $model = $pricing['model'];

        $errors = array();
        $lines = array();
        $participants = array();
        $base = 0.0;
        $units = 0;

        // --- Participants ---------------------------------------------------
        if ($model === 'person_types') {
            $people = 0;
            $seats = 0;
            foreach ($pricing['person_types'] as $type) {
                $count = isset($request['participants'][$type['key']]) ? (int) $request['participants'][$type['key']] : 0;
                if ($type['max'] > 0 && $count > $type['max']) {
                    $errors[] = self::error('type_max', sprintf(
                        /* translators: 1: person type, 2: max */
                        __('Massimo %2$d per la tipologia "%1$s".', 'next-tours'),
                        $type['label'],
                        $type['max']
                    ), array('type' => $type['key'], 'max' => $type['max']));
                }
                if ($type['min'] > 0 && $count < $type['min']) {
                    $errors[] = self::error('type_min', sprintf(
                        /* translators: 1: person type, 2: min */
                        __('Minimo %2$d per la tipologia "%1$s".', 'next-tours'),
                        $type['label'],
                        $type['min']
                    ), array('type' => $type['key'], 'min' => $type['min']));
                }
                $participants[] = array('key' => $type['key'], 'label' => $type['label'], 'count' => $count);
                if ($count <= 0) {
                    continue;
                }
                $people += $count;
                if ($type['counts_capacity']) {
                    $seats += $count;
                }
                $price = (float) $type['price'];
                $base += $price * $count;
                $lines[] = self::line('base', $type['label'], $count, $price);
            }
        } else {
            $people = isset($request['participants']['people'])
                ? (int) $request['participants']['people']
                : array_sum(array_map('intval', $request['participants']));
            $seats = $people;
            $participants[] = array('key' => 'people', 'label' => __('Partecipanti', 'next-tours'), 'count' => $people);
        }

        if ($model !== 'per_unit') {
            if ($people <= 0) {
                $errors[] = self::error('participants_required', __('Indica il numero di partecipanti.', 'next-tours'));
            } elseif ($people < (int) $booking['min_per_booking']) {
                $errors[] = self::error('too_few_participants', sprintf(
                    /* translators: %d: minimum participants */
                    __('Minimo %d partecipanti per prenotazione.', 'next-tours'),
                    $booking['min_per_booking']
                ), array('min' => (int) $booking['min_per_booking']));
            }
            if ((int) $booking['max_per_booking'] > 0 && $people > (int) $booking['max_per_booking']) {
                $errors[] = self::error('too_many_participants', sprintf(
                    /* translators: %d: maximum participants */
                    __('Massimo %d partecipanti per prenotazione.', 'next-tours'),
                    $booking['max_per_booking']
                ), array('max' => (int) $booking['max_per_booking']));
            }
        }

        // --- Base price -----------------------------------------------------
        switch ($model) {
            case 'per_person':
                if ($pricing['price'] === '') {
                    $errors[] = self::error('price_missing', __('Prezzo non configurato.', 'next-tours'));
                }
                $price = (float) $pricing['price'];
                $base = $price * max(0, $people);
                if ($people > 0) {
                    $lines[] = self::line('base', __('Partecipanti', 'next-tours'), $people, $price);
                }
                break;

            case 'group_tiers':
                $tier = null;
                foreach ($pricing['tiers'] as $candidate) {
                    if ($people >= $candidate['min'] && ($candidate['max'] <= 0 || $people <= $candidate['max'])) {
                        $tier = $candidate;
                        break;
                    }
                }
                if (!$tier && $people > 0) {
                    $errors[] = self::error('no_tier', __('Nessun prezzo previsto per questo numero di partecipanti.', 'next-tours'));
                } elseif ($tier) {
                    $price = (float) $tier['price'];
                    $base = $price * $people;
                    $lines[] = self::line('base', __('Partecipanti', 'next-tours'), $people, $price);
                }
                break;

            case 'private_group':
                $group = $pricing['group'];
                if ($group['max_people'] > 0 && $people > $group['max_people']) {
                    $errors[] = self::error('group_too_large', sprintf(
                        /* translators: %d: maximum group size */
                        __('Il gruppo può avere al massimo %d persone.', 'next-tours'),
                        $group['max_people']
                    ), array('max' => (int) $group['max_people']));
                }
                $base = (float) $group['price'];
                $lines[] = self::line('base', sprintf(
                    /* translators: %d: people included */
                    __('Gruppo privato (fino a %d persone)', 'next-tours'),
                    $group['included']
                ), 1, (float) $group['price']);
                $extra_people = max(0, $people - (int) $group['included']);
                if ($extra_people > 0) {
                    $base += (float) $group['extra_price'] * $extra_people;
                    $lines[] = self::line('base', __('Persona aggiuntiva', 'next-tours'), $extra_people, (float) $group['extra_price']);
                }
                break;

            case 'per_unit':
                $unit = $pricing['unit'];
                $units = (int) $request['units'];
                if ($units <= 0) {
                    $errors[] = self::error('units_required', __('Indica quante unità vuoi prenotare.', 'next-tours'));
                }
                if ($unit['max_units'] > 0 && $units > $unit['max_units']) {
                    $errors[] = self::error('too_many_units', sprintf(
                        /* translators: %d: maximum units */
                        __('Massimo %d unità per prenotazione.', 'next-tours'),
                        $unit['max_units']
                    ), array('max' => (int) $unit['max_units']));
                }
                if ($unit['capacity'] > 0 && $people > $units * $unit['capacity']) {
                    $errors[] = self::error('unit_capacity', sprintf(
                        /* translators: %d: people per unit */
                        __('Ogni unità ospita al massimo %d persone.', 'next-tours'),
                        $unit['capacity']
                    ), array('capacity' => (int) $unit['capacity']));
                }
                // Capacity of departures/slots is counted in units for this model.
                $seats = $units;
                $price = (float) $unit['price'];
                $base = $price * $units;
                if ($units > 0) {
                    $lines[] = self::line('base', $unit['label'] !== '' ? $unit['label'] : __('Unità', 'next-tours'), $units, $price);
                }
                break;

            case 'quote':
                $base = 0.0;
                break;
        }

        // --- Date -----------------------------------------------------------
        $slot = null;
        if ($request['mode'] !== '') {
            $resolved = Next_Tours_Availability::resolve($product_id, $request, max(1, $seats), $exclude_order_id);
            if (is_wp_error($resolved)) {
                $errors[] = self::error($resolved->get_error_code(), $resolved->get_error_message(), $resolved->get_error_data());
            } else {
                $slot = $resolved;
            }
        }

        $adjustment = 0.0;
        if ($slot && $slot['price_adjustment'] != 0 && $base > 0) {
            $adjustment = round($base * $slot['price_adjustment'] / 100, $decimals);
            $lines[] = self::line(
                'adjustment',
                $adjustment > 0 ? __('Supplemento data', 'next-tours') : __('Sconto data', 'next-tours'),
                1,
                $adjustment
            );
        }

        // --- Extras ---------------------------------------------------------
        $extras = array();
        $extras_total = 0.0;
        $days = Next_Tours::duration_days($info);
        foreach ($pricing['extras'] as $extra) {
            if (!$extra['required'] && !in_array($extra['key'], $request['extras'], true)) {
                continue;
            }
            switch ($extra['per']) {
                case 'person':
                    $qty = max(0, $people);
                    break;
                case 'day':
                    $qty = $days;
                    break;
                case 'unit':
                    $qty = max(1, $units);
                    break;
                default:
                    $qty = 1;
            }
            $price = (float) $extra['price'];
            $total = $price * $qty;
            $extras_total += $total;
            $extras[] = array(
                'key'      => $extra['key'],
                'label'    => $extra['label'],
                'qty'      => $qty,
                'price'    => self::money($price),
                'total'    => self::money($total),
                'required' => (bool) $extra['required'],
            );
            if ($qty > 0) {
                $lines[] = self::line('extra', $extra['label'], $qty, $price);
            }
        }

        $on_request = $slot
            ? (bool) $slot['on_request']
            : Next_Tours_Availability::confirmation_for($booking, $pricing) === 'on_request';
        $total = round($base + $adjustment + $extras_total, $decimals);

        return array(
            'valid'            => empty($errors) && $slot !== null,
            'errors'           => $errors,
            'currency'         => get_woocommerce_currency(),
            'model'            => $model,
            'on_request'       => $on_request,
            'price_on_request' => $model === 'quote',
            'people'           => max(0, $people),
            'seats'            => max(0, $seats),
            'units'            => $units,
            'participants'     => $participants,
            'extras'           => $extras,
            'lines'            => $lines,
            'subtotal'         => self::money($base),
            'adjustment'       => self::money($adjustment),
            'extras_total'     => self::money($extras_total),
            'total'            => self::money($total),
            'slot'             => $slot,
            'request'          => $request,
        );
    }

    /** What is stored on the cart item / order item for a valid quote. */
    public static function to_booking($product_id, array $quote) {
        $slot = $quote['slot'];
        return array(
            'product_id'   => (int) $product_id,
            'mode'         => $slot['mode'],
            'departure_id' => $slot['departure_id'],
            'date'         => $slot['date'],
            'time'         => $slot['time'],
            'end_date'     => $slot['end_date'],
            'guaranteed'   => (bool) $slot['guaranteed'],
            'on_request'   => (bool) $quote['on_request'],
            'model'        => $quote['model'],
            'people'       => (int) $quote['people'],
            'seats'        => (int) $quote['seats'],
            'units'        => (int) $quote['units'],
            'participants' => $quote['participants'],
            'extras'       => $quote['extras'],
            'lines'        => $quote['lines'],
            'total'        => $quote['total'],
            'currency'     => $quote['currency'],
            'request'      => $quote['request'],
        );
    }

    /** Lowest advertised price, shown as "from" in listings ('' = on request). */
    public static function from_price(array $pricing) {
        $candidates = array();
        switch ($pricing['model']) {
            case 'per_person':
                $candidates[] = $pricing['price'];
                break;
            case 'person_types':
                // The headline price is the full (adult) fare: age discounts
                // (child, youth, senior…) would make the "from" price misleading.
                // Without an "adult" type, the first paying type listed is the
                // reference one.
                $reference = null;
                foreach ($pricing['person_types'] as $type) {
                    if (!$type['counts_capacity'] || (float) $type['price'] <= 0) {
                        continue;
                    }
                    if ($type['key'] === 'adult') {
                        $reference = $type;
                        break;
                    }
                    if ($reference === null) {
                        $reference = $type;
                    }
                }
                if ($reference !== null) {
                    $candidates[] = $reference['price'];
                }
                break;
            case 'group_tiers':
                foreach ($pricing['tiers'] as $tier) {
                    $candidates[] = $tier['price'];
                }
                break;
            case 'private_group':
                $candidates[] = $pricing['group']['price'];
                break;
            case 'per_unit':
                $candidates[] = $pricing['unit']['price'];
                break;
        }
        $candidates = array_filter($candidates, function ($value) {
            return $value !== '' && $value !== null;
        });
        return $candidates ? wc_format_decimal(min(array_map('floatval', $candidates))) : '';
    }

    /** Readable one-line summary, e.g. "12/12/2026 09:00 · 2 Adulto, 1 Bambino". */
    public static function summary(array $booking) {
        $parts = array();
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $booking['date'], Next_Tours::timezone());
        if ($date) {
            $parts[] = wp_date(get_option('date_format'), $date->getTimestamp(), Next_Tours::timezone())
                . ($booking['time'] !== '' ? ' ' . $booking['time'] : '');
        }
        $people = array();
        foreach ($booking['participants'] as $p) {
            if ($p['count'] > 0) {
                $people[] = $p['count'] . ' ' . $p['label'];
            }
        }
        if ($people) {
            $parts[] = implode(', ', $people);
        }
        if (!empty($booking['units'])) {
            $parts[] = sprintf(
                /* translators: %d: units */
                _n('%d unità', '%d unità', (int) $booking['units'], 'next-tours'),
                (int) $booking['units']
            );
        }
        return implode(' · ', $parts);
    }

    private static function line($type, $label, $qty, $unit_price) {
        return array(
            'type'       => $type,
            'label'      => $label,
            'qty'        => (int) $qty,
            'unit_price' => self::money($unit_price),
            'total'      => self::money($unit_price * $qty),
        );
    }

    private static function error($code, $message, $data = null) {
        $error = array('code' => $code, 'message' => $message);
        if (is_array($data)) {
            $error['data'] = $data;
        }
        return $error;
    }

    private static function money($value) {
        return wc_format_decimal((float) $value, wc_get_price_decimals());
    }
}
