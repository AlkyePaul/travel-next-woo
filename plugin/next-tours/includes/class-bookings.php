<?php
/**
 * Seat ledger: one row per booked order line, used to compute availability.
 *
 * Rows are derived from orders (never edited by hand) and follow the order
 * status:
 *
 *   order status            booking status      holds seats?
 *   tour-request            request             until expires_at (setting)
 *   pending                 awaiting_payment    until expires_at (payment window)
 *   on-hold (bank transfer) awaiting_payment    yes, no expiry
 *   processing / completed  confirmed           yes
 *   cancelled / failed / …  cancelled           no
 *
 * An hourly cron marks stale holds "expired" (seats released) and, if enabled,
 * cancels unpaid orders whose payment window is over.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Bookings {
    const DB_VERSION = '1';
    const DB_OPTION = 'next_tours_db_version';
    const CRON_HOOK = 'next_tours_expire_holds';
    /** Order item meta holding the validated booking (see Next_Tours_Pricing::quote). */
    const ITEM_META = '_next_tour_booking';
    /** Order meta: when the admin confirmed a request (payment window starts). */
    const CONFIRMED_META = '_next_tours_confirmed_at';

    public static function table() {
        global $wpdb;
        return $wpdb->prefix . 'next_tour_bookings';
    }

    public static function statuses() {
        return array(
            'request'          => __('Richiesta', 'next-tours'),
            'awaiting_payment' => __('In attesa di pagamento', 'next-tours'),
            'confirmed'        => __('Confermata', 'next-tours'),
            'expired'          => __('Scaduta', 'next-tours'),
            'cancelled'        => __('Annullata', 'next-tours'),
        );
    }

    // -----------------------------------------------------------------------
    // Install
    // -----------------------------------------------------------------------

    public static function install() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $table = self::table();
        $charset_collate = $wpdb->get_charset_collate();

        dbDelta("CREATE TABLE {$table} (
  id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
  order_id bigint(20) unsigned NOT NULL,
  order_item_id bigint(20) unsigned NOT NULL,
  product_id bigint(20) unsigned NOT NULL,
  departure_id varchar(32) NOT NULL DEFAULT '',
  start_date date NOT NULL,
  start_time varchar(5) NOT NULL DEFAULT '',
  end_date date NULL,
  seats int(11) NOT NULL DEFAULT 0,
  people int(11) NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL DEFAULT 'request',
  expires_at datetime NULL,
  created_at datetime NOT NULL,
  updated_at datetime NOT NULL,
  PRIMARY KEY  (id),
  UNIQUE KEY order_item_id (order_item_id),
  KEY product_date (product_id,start_date),
  KEY status_expires (status,expires_at),
  KEY order_id (order_id)
) {$charset_collate};");

        update_option(self::DB_OPTION, self::DB_VERSION);
    }

    /** Create/upgrade the table when the plugin files are updated without re-activation. */
    public static function maybe_upgrade() {
        if (get_option(self::DB_OPTION) !== self::DB_VERSION) {
            self::install();
        }
    }

    public static function init() {
        add_action(self::CRON_HOOK, array(__CLASS__, 'expire'));
        add_action('woocommerce_order_status_changed', array(__CLASS__, 'on_status_changed'), 10, 4);
        add_action('woocommerce_before_delete_order', array(__CLASS__, 'on_order_deleted'));
        add_action('woocommerce_trash_order', array(__CLASS__, 'on_order_deleted'));
        add_action('before_delete_post', array(__CLASS__, 'on_order_deleted'));

        // Plugin copied over FTP (no activation hook): make sure the cron exists.
        if (!wp_next_scheduled(self::CRON_HOOK)) {
            wp_schedule_event(time() + 300, 'hourly', self::CRON_HOOK);
        }
    }

    // -----------------------------------------------------------------------
    // Capacity
    // -----------------------------------------------------------------------

    /** SQL condition for rows that hold seats right now. */
    private static function active_sql() {
        global $wpdb;
        return $wpdb->prepare(
            "(status = 'confirmed' OR (status IN ('request','awaiting_payment') AND (expires_at IS NULL OR expires_at > %s)))",
            gmdate('Y-m-d H:i:s')
        );
    }

    /**
     * Seats taken per departure and per open-date slot in a date range.
     *
     * @return array { "dep:{id}" => seats, "slot:{Y-m-d} {H:i}" => seats }
     */
    public static function usage($product_id, $from, $to, $exclude_order_id = 0) {
        global $wpdb;
        $table = self::table();
        $active = self::active_sql();
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name and $active are built internally
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT departure_id, start_date, start_time, SUM(seats) AS seats
             FROM {$table}
             WHERE product_id = %d AND start_date BETWEEN %s AND %s AND order_id <> %d AND {$active}
             GROUP BY departure_id, start_date, start_time",
            $product_id,
            $from,
            $to,
            (int) $exclude_order_id
        ), ARRAY_A);

        $usage = array();
        foreach ((array) $rows as $row) {
            $key = $row['departure_id'] !== ''
                ? 'dep:' . $row['departure_id']
                : 'slot:' . $row['start_date'] . ' ' . $row['start_time'];
            $usage[$key] = (isset($usage[$key]) ? $usage[$key] : 0) + (int) $row['seats'];
        }
        return $usage;
    }

    public static function usage_key($departure_id, $date, $time) {
        return $departure_id !== '' ? 'dep:' . $departure_id : 'slot:' . $date . ' ' . $time;
    }

    // -----------------------------------------------------------------------
    // Sync from orders
    // -----------------------------------------------------------------------

    public static function on_status_changed($order_id, $from, $to, $order = null) {
        self::sync_order($order ? $order : $order_id);
    }

    public static function on_order_deleted($order_id) {
        global $wpdb;
        if (get_post_type($order_id) && !in_array(get_post_type($order_id), array('shop_order', 'shop_order_placehold'), true)) {
            return;
        }
        $wpdb->update(
            self::table(),
            array('status' => 'cancelled', 'expires_at' => null, 'updated_at' => current_time('mysql', true)),
            array('order_id' => (int) $order_id)
        );
    }

    /** Booking status implied by an order status; null = ignore (e.g. checkout drafts). */
    public static function status_for_order($order) {
        $status = $order->get_status();
        switch ($status) {
            case Next_Tours_Orders::STATUS:
                return 'request';
            case 'pending':
            case 'on-hold':
                return 'awaiting_payment';
            case 'processing':
            case 'completed':
                return 'confirmed';
            case 'checkout-draft':
                return null;
            default:
                return 'cancelled';
        }
    }

    /** Create or update the ledger rows of an order's tour lines. Idempotent. */
    public static function sync_order($order) {
        global $wpdb;
        $order = $order instanceof WC_Order ? $order : wc_get_order($order);
        if (!$order || !($order instanceof WC_Order)) {
            return;
        }
        $status = self::status_for_order($order);
        if ($status === null) {
            return;
        }

        $table = self::table();
        $now = current_time('mysql', true);

        foreach ($order->get_items('line_item') as $item_id => $item) {
            $booking = $item->get_meta(self::ITEM_META, true);
            if (!is_array($booking) || empty($booking['date'])) {
                continue;
            }

            // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
            $existing = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE order_item_id = %d", $item_id), ARRAY_A);

            $row_status = $status;
            $expires = null;
            if ($status === 'request') {
                $hold = Next_Tours_Settings::request_hold_hours();
                $created = $order->get_date_created() ? $order->get_date_created()->getTimestamp() : time();
                $expires = gmdate('Y-m-d H:i:s', $hold > 0 ? $created + $hold * HOUR_IN_SECONDS : time());
            } elseif ($status === 'awaiting_payment') {
                if ($order->get_status() === 'on-hold') {
                    $expires = null; // manual payment methods: held until the admin acts
                } elseif ($existing && $existing['status'] === 'expired') {
                    $row_status = 'expired'; // the payment window is over: don't hold again
                } elseif ($existing && $existing['status'] === 'awaiting_payment' && $existing['expires_at']) {
                    $expires = $existing['expires_at'];
                } else {
                    $confirmed_at = (int) $order->get_meta(self::CONFIRMED_META, true);
                    $expires = gmdate('Y-m-d H:i:s', $confirmed_at
                        ? $confirmed_at + Next_Tours_Settings::confirmed_payment_hours() * HOUR_IN_SECONDS
                        : time() + Next_Tours_Settings::payment_window_minutes() * MINUTE_IN_SECONDS);
                }
            }

            $data = array(
                'order_id'     => $order->get_id(),
                'order_item_id'=> (int) $item_id,
                'product_id'   => (int) $item->get_product_id(),
                'departure_id' => isset($booking['departure_id']) ? (string) $booking['departure_id'] : '',
                'start_date'   => $booking['date'],
                'start_time'   => isset($booking['time']) ? (string) $booking['time'] : '',
                'end_date'     => !empty($booking['end_date']) ? $booking['end_date'] : null,
                'seats'        => isset($booking['seats']) ? (int) $booking['seats'] : 0,
                'people'       => isset($booking['people']) ? (int) $booking['people'] : 0,
                'status'       => $row_status,
                'expires_at'   => $expires,
                'updated_at'   => $now,
            );

            if ($existing) {
                $wpdb->update($table, $data, array('id' => (int) $existing['id']));
            } else {
                $data['created_at'] = $now;
                $wpdb->insert($table, $data);
            }
        }
    }

    // -----------------------------------------------------------------------
    // Expiry (cron)
    // -----------------------------------------------------------------------

    public static function expire() {
        global $wpdb;
        $table = self::table();
        $now = gmdate('Y-m-d H:i:s');

        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $stale = $wpdb->get_results($wpdb->prepare(
            "SELECT id, order_id, status FROM {$table} WHERE status IN ('request','awaiting_payment') AND expires_at IS NOT NULL AND expires_at <= %s",
            $now
        ), ARRAY_A);

        $orders_to_cancel = array();
        foreach ((array) $stale as $row) {
            if ($row['status'] === 'awaiting_payment' && Next_Tours_Settings::auto_cancel_unpaid()) {
                $orders_to_cancel[(int) $row['order_id']] = true;
            }
        }

        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $wpdb->query($wpdb->prepare(
            "UPDATE {$table} SET status = 'expired', updated_at = %s WHERE status IN ('request','awaiting_payment') AND expires_at IS NOT NULL AND expires_at <= %s",
            $now,
            $now
        ));

        foreach (array_keys($orders_to_cancel) as $order_id) {
            $order = wc_get_order($order_id);
            if ($order && $order->has_status('pending')) {
                $order->update_status('cancelled', __('Next Tours: tempo per il pagamento scaduto, posti liberati.', 'next-tours'));
            }
        }
    }

    // -----------------------------------------------------------------------
    // Queries for the admin screens
    // -----------------------------------------------------------------------

    public static function for_order($order_id) {
        global $wpdb;
        $table = self::table();
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        return (array) $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE order_id = %d ORDER BY start_date, start_time", $order_id), ARRAY_A);
    }

    public static function in_range($from, $to, $product_id = 0, $include_inactive = false) {
        global $wpdb;
        $table = self::table();
        $where = $wpdb->prepare('start_date BETWEEN %s AND %s', $from, $to);
        if ($product_id) {
            $where .= $wpdb->prepare(' AND product_id = %d', $product_id);
        }
        if (!$include_inactive) {
            $where .= " AND status IN ('request','awaiting_payment','confirmed')";
        }
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        return (array) $wpdb->get_results("SELECT * FROM {$table} WHERE {$where} ORDER BY start_date, start_time, product_id, id", ARRAY_A);
    }

    /** Seats per departure id for one product (all dates), for the product edit screen. */
    public static function seats_by_departure($product_id) {
        global $wpdb;
        $table = self::table();
        $active = self::active_sql();
        // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT departure_id, SUM(seats) AS seats FROM {$table} WHERE product_id = %d AND departure_id <> '' AND {$active} GROUP BY departure_id",
            $product_id
        ), ARRAY_A);
        $out = array();
        foreach ((array) $rows as $row) {
            $out[$row['departure_id']] = (int) $row['seats'];
        }
        return $out;
    }
}
