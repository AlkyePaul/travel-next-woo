<?php
/**
 * What can be booked, and when.
 *
 * Two independent sources, switched on per product:
 *  - fixed departures: dated entries with their own capacity/status/overrides
 *  - open dates: weekday/date-range rules with time slots and a capacity per slot
 *
 * Seats taken come from the bookings ledger. Departures and open-date slots
 * are separate pools, even on the same day.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Availability {
    const MAX_RANGE_DAYS = 400;

    /** "on_request" or "instant" for a booking on this product (and departure). */
    public static function confirmation_for(array $booking, array $pricing, $departure = null) {
        if ($pricing['model'] === 'quote') {
            return 'on_request';
        }
        if (is_array($departure) && isset($departure['confirmation']) && $departure['confirmation'] !== 'inherit') {
            return $departure['confirmation'];
        }
        return $booking['confirmation'];
    }

    /** Cutoff and booking window check for a start date/time. */
    public static function check_window(array $booking, $date, $time) {
        $tz = Next_Tours::timezone();
        $start = DateTimeImmutable::createFromFormat('Y-m-d H:i', $date . ' ' . ($time !== '' ? $time : '00:00'), $tz);
        if (!$start) {
            return new WP_Error('date_unavailable', __('Data non valida.', 'next-tours'));
        }
        $now = new DateTimeImmutable('now', $tz);
        if ($start->getTimestamp() - $now->getTimestamp() < (int) $booking['cutoff_hours'] * HOUR_IN_SECONDS) {
            return new WP_Error('too_late', __('Non è più possibile prenotare questa data.', 'next-tours'));
        }
        $last = $now->modify('+' . (int) $booking['booking_window_days'] . ' days')->format('Y-m-d');
        if ($date > $last) {
            return new WP_Error('too_far', __('Questa data non è ancora prenotabile.', 'next-tours'));
        }
        return true;
    }

    /** First open-date rule matching a day (rules are evaluated in the order set by the admin). */
    public static function rule_for(array $rules, $date) {
        $weekday = (int) DateTimeImmutable::createFromFormat('!Y-m-d', $date, Next_Tours::timezone())->format('N');
        foreach ($rules as $rule) {
            if ($rule['from'] !== '' && $date < $rule['from']) {
                continue;
            }
            if ($rule['to'] !== '' && $date > $rule['to']) {
                continue;
            }
            if (!in_array($weekday, array_map('intval', $rule['weekdays']), true)) {
                continue;
            }
            return $rule;
        }
        return null;
    }

    public static function end_date($date, array $info) {
        $days = Next_Tours::duration_days($info);
        if ($days <= 1) {
            return $date;
        }
        return DateTimeImmutable::createFromFormat('!Y-m-d', $date, Next_Tours::timezone())
            ->modify('+' . ($days - 1) . ' days')
            ->format('Y-m-d');
    }

    /**
     * Availability calendar for a date range.
     *
     * @return array { fixed_departures, open_dates, from, to, departures: [...], dates: [...] }
     */
    public static function get($product_id, $from, $to) {
        $booking = Next_Tours::get_booking($product_id);
        $pricing = Next_Tours::get_pricing($product_id);
        $info = Next_Tours::get_info($product_id);
        $tz = Next_Tours::timezone();

        $today = Next_Tours::today();
        $last = (new DateTimeImmutable('now', $tz))->modify('+' . (int) $booking['booking_window_days'] . ' days')->format('Y-m-d');
        $from = max($from, $today);
        $to = min($to, $last);

        $result = array(
            'product_id'       => (int) $product_id,
            'fixed_departures' => (bool) $booking['fixed_departures'],
            'open_dates'       => (bool) $booking['open_dates'],
            'from'             => $from,
            'to'               => $to,
            'departures'       => array(),
            'dates'            => array(),
        );
        if ($from > $to) {
            return $result;
        }

        $usage = Next_Tours_Bookings::usage($product_id, $from, $to);

        if ($booking['fixed_departures']) {
            foreach ($booking['departures'] as $dep) {
                if ($dep['status'] === 'cancelled' || $dep['date'] < $from || $dep['date'] > $to) {
                    continue;
                }
                $used = isset($usage['dep:' . $dep['id']]) ? $usage['dep:' . $dep['id']] : 0;
                $capacity = (int) $dep['capacity'];
                $remaining = $capacity > 0 ? max(0, $capacity - $used) : null;
                $window = self::check_window($booking, $dep['date'], $dep['time']);
                $result['departures'][] = array(
                    'id'               => $dep['id'],
                    'date'             => $dep['date'],
                    'time'             => $dep['time'],
                    'end_date'         => $dep['end_date'] !== '' ? $dep['end_date'] : self::end_date($dep['date'], $info),
                    'capacity'         => $capacity > 0 ? $capacity : null,
                    'remaining'        => $remaining,
                    'status'           => $dep['status'],
                    'bookable'         => $dep['status'] === 'open' && $window === true && ($remaining === null || $remaining > 0),
                    'on_request'       => self::confirmation_for($booking, $pricing, $dep) === 'on_request',
                    'guaranteed'       => (bool) $dep['guaranteed'],
                    'price_adjustment' => (float) $dep['price_adjustment'],
                    'note'             => $dep['note'],
                );
            }
        }

        if ($booking['open_dates'] && $booking['rules']) {
            $blackouts = array_flip($booking['blackouts']);
            $on_request = self::confirmation_for($booking, $pricing) === 'on_request';
            $day = DateTimeImmutable::createFromFormat('!Y-m-d', $from, $tz);
            $end = DateTimeImmutable::createFromFormat('!Y-m-d', $to, $tz);
            $count = 0;
            while ($day <= $end && $count++ < self::MAX_RANGE_DAYS) {
                $date = $day->format('Y-m-d');
                $day = $day->modify('+1 day');
                if (isset($blackouts[$date])) {
                    continue;
                }
                $rule = self::rule_for($booking['rules'], $date);
                if (!$rule) {
                    continue;
                }
                $slots = array();
                foreach ($rule['times'] ? $rule['times'] : array('') as $time) {
                    $used = isset($usage['slot:' . $date . ' ' . $time]) ? $usage['slot:' . $date . ' ' . $time] : 0;
                    $capacity = (int) $rule['capacity'];
                    $remaining = $capacity > 0 ? max(0, $capacity - $used) : null;
                    $slots[] = array(
                        'time'      => $time,
                        'capacity'  => $capacity > 0 ? $capacity : null,
                        'remaining' => $remaining,
                        'bookable'  => self::check_window($booking, $date, $time) === true && ($remaining === null || $remaining > 0),
                    );
                }
                $result['dates'][] = array(
                    'date'             => $date,
                    'end_date'         => self::end_date($date, $info),
                    'on_request'       => $on_request,
                    'price_adjustment' => (float) $rule['price_adjustment'],
                    'slots'            => $slots,
                );
            }
        }

        return $result;
    }

    /**
     * Validate a date selection for a number of seats.
     *
     * @param array $selection { mode: departure|date, departure_id?, date?, time? }
     * @return array|WP_Error resolved slot: mode, departure_id, date, time, end_date, on_request, price_adjustment, guaranteed
     */
    public static function resolve($product_id, array $selection, $seats, $exclude_order_id = 0) {
        $booking = Next_Tours::get_booking($product_id);
        $pricing = Next_Tours::get_pricing($product_id);
        $info = Next_Tours::get_info($product_id);
        $mode = isset($selection['mode']) ? $selection['mode'] : '';

        if ($mode === 'departure') {
            if (!$booking['fixed_departures']) {
                return new WP_Error('mode_unavailable', __('Questo tour non ha partenze programmate.', 'next-tours'));
            }
            $id = isset($selection['departure_id']) ? (string) $selection['departure_id'] : '';
            $dep = null;
            foreach ($booking['departures'] as $candidate) {
                if ($candidate['id'] === $id) {
                    $dep = $candidate;
                    break;
                }
            }
            if (!$dep) {
                return new WP_Error('departure_not_found', __('Partenza non trovata.', 'next-tours'));
            }
            if ($dep['status'] !== 'open') {
                return new WP_Error('departure_closed', __('Questa partenza non è prenotabile.', 'next-tours'));
            }
            $window = self::check_window($booking, $dep['date'], $dep['time']);
            if (is_wp_error($window)) {
                return $window;
            }
            $capacity_error = self::check_capacity($product_id, $dep['id'], $dep['date'], $dep['time'], (int) $dep['capacity'], $seats, $exclude_order_id);
            if (is_wp_error($capacity_error)) {
                return $capacity_error;
            }
            return array(
                'mode'             => 'departure',
                'departure_id'     => $dep['id'],
                'date'             => $dep['date'],
                'time'             => $dep['time'],
                'end_date'         => $dep['end_date'] !== '' ? $dep['end_date'] : self::end_date($dep['date'], $info),
                'on_request'       => self::confirmation_for($booking, $pricing, $dep) === 'on_request',
                'price_adjustment' => (float) $dep['price_adjustment'],
                'guaranteed'       => (bool) $dep['guaranteed'],
            );
        }

        if ($mode === 'date') {
            if (!$booking['open_dates']) {
                return new WP_Error('mode_unavailable', __('Questo tour non ha date libere.', 'next-tours'));
            }
            $date = Next_Tours::date(isset($selection['date']) ? $selection['date'] : '');
            if ($date === '' || in_array($date, $booking['blackouts'], true)) {
                return new WP_Error('date_unavailable', __('Data non disponibile.', 'next-tours'));
            }
            $rule = self::rule_for($booking['rules'], $date);
            if (!$rule) {
                return new WP_Error('date_unavailable', __('Data non disponibile.', 'next-tours'));
            }
            $time = Next_Tours::time(isset($selection['time']) ? $selection['time'] : '');
            if ($rule['times'] ? !in_array($time, $rule['times'], true) : $time !== '') {
                return new WP_Error('time_unavailable', __('Orario non disponibile.', 'next-tours'));
            }
            $window = self::check_window($booking, $date, $time);
            if (is_wp_error($window)) {
                return $window;
            }
            $capacity_error = self::check_capacity($product_id, '', $date, $time, (int) $rule['capacity'], $seats, $exclude_order_id);
            if (is_wp_error($capacity_error)) {
                return $capacity_error;
            }
            return array(
                'mode'             => 'date',
                'departure_id'     => '',
                'date'             => $date,
                'time'             => $time,
                'end_date'         => self::end_date($date, $info),
                'on_request'       => self::confirmation_for($booking, $pricing) === 'on_request',
                'price_adjustment' => (float) $rule['price_adjustment'],
                'guaranteed'       => false,
            );
        }

        return new WP_Error('date_required', __('Scegli una data.', 'next-tours'));
    }

    private static function check_capacity($product_id, $departure_id, $date, $time, $capacity, $seats, $exclude_order_id) {
        if ($capacity <= 0) {
            return true;
        }
        $usage = Next_Tours_Bookings::usage($product_id, $date, $date, $exclude_order_id);
        $key = Next_Tours_Bookings::usage_key($departure_id, $date, $time);
        $remaining = max(0, $capacity - (isset($usage[$key]) ? $usage[$key] : 0));
        if ($seats > $remaining) {
            return new WP_Error(
                'not_enough_seats',
                $remaining > 0
                    /* translators: %d: seats left */
                    ? sprintf(_n('È rimasto solo %d posto.', 'Sono rimasti solo %d posti.', $remaining, 'next-tours'), $remaining)
                    : __('Posti esauriti per questa data.', 'next-tours'),
                array('remaining' => $remaining)
            );
        }
        return true;
    }
}
