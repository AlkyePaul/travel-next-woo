<?php
/**
 * Admin screens for bookings:
 *  - "Prenotazione tour" box on the order screen, with Confirm / Decline for requests
 *  - WooCommerce → Prenotazioni tour: upcoming bookings by date (manifest)
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Admin_Orders {
    const NONCE = 'next_tours_order_action';
    const PAGE = 'next-tours-bookings';
    const DECLINE_META = '_next_tours_decline_reason';
    const MESSAGE_META = '_next_tours_confirm_message';

    public static function init() {
        add_action('add_meta_boxes', array(__CLASS__, 'add_box'), 30);
        add_action('admin_post_next_tours_confirm', array(__CLASS__, 'handle_confirm'));
        add_action('admin_post_next_tours_decline', array(__CLASS__, 'handle_decline'));
        add_action('admin_notices', array(__CLASS__, 'notices'));
        // 1000: after menu-reorganising plugins (Headless Admin Menu runs at 999).
        add_action('admin_menu', array(__CLASS__, 'menu'), 1000);
        add_action('admin_enqueue_scripts', array(__CLASS__, 'assets'));
    }

    private static function order_screen_id() {
        if (function_exists('wc_get_page_screen_id')) {
            return wc_get_page_screen_id('shop-order');
        }
        return 'shop_order';
    }

    public static function assets() {
        $screen = get_current_screen();
        if (!$screen) {
            return;
        }
        if ($screen->id === self::order_screen_id() || $screen->id === 'shop_order' || strpos($screen->id, self::PAGE) !== false) {
            wp_enqueue_style('next-tours-admin', NEXT_TOURS_URL . 'assets/admin.css', array(), NEXT_TOURS_VERSION);
        }
    }

    // -----------------------------------------------------------------------
    // Order box
    // -----------------------------------------------------------------------

    public static function add_box() {
        add_meta_box('next-tours-booking', __('Prenotazione tour', 'next-tours'), array(__CLASS__, 'render_box'), self::order_screen_id(), 'side', 'high');
    }

    public static function render_box($post_or_order) {
        $order = $post_or_order instanceof WC_Order ? $post_or_order : wc_get_order($post_or_order instanceof WP_Post ? $post_or_order->ID : $post_or_order);
        if (!$order) {
            return;
        }
        $bookings = Next_Tours_Orders::bookings_of($order);
        if (!$bookings) {
            echo '<p class="description">' . esc_html__('Nessun tour in questo ordine.', 'next-tours') . '</p>';
            return;
        }

        $ledger = array();
        foreach (Next_Tours_Bookings::for_order($order->get_id()) as $row) {
            $ledger[(int) $row['order_item_id']] = $row;
        }
        $statuses = Next_Tours_Bookings::statuses();

        echo '<div class="next-tours-order-box">';
        foreach ($bookings as $item_id => $booking) {
            $item = $order->get_item($item_id);
            echo '<p><strong>' . esc_html($item ? $item->get_name() : '#' . $booking['product_id']) . '</strong></p><table>';
            foreach (Next_Tours_Orders::display_meta($booking) as $label => $value) {
                echo '<tr><td>' . esc_html($label) . ':</td><td>' . esc_html($value) . '</td></tr>';
            }
            if (isset($ledger[$item_id])) {
                $row = $ledger[$item_id];
                $label = isset($statuses[$row['status']]) ? $statuses[$row['status']] : $row['status'];
                if ($row['expires_at'] && in_array($row['status'], array('request', 'awaiting_payment'), true)) {
                    $label .= ' — ' . sprintf(
                        /* translators: %s: date/time */
                        __('posti trattenuti fino al %s', 'next-tours'),
                        wp_date(get_option('date_format') . ' ' . get_option('time_format'), strtotime($row['expires_at'] . ' UTC'))
                    );
                }
                echo '<tr><td>' . esc_html__('Posti', 'next-tours') . ':</td><td>' . esc_html($row['seats'] . ' · ' . $label) . '</td></tr>';
            }
            echo '</table>';
        }

        if ($order->has_status(Next_Tours_Orders::STATUS)) {
            $issues = self::capacity_issues($order);
            echo '<hr /><p>' . esc_html__('Il cliente ha inviato una richiesta. Controlla disponibilità e prezzo (puoi modificarlo nelle righe dell’ordine e ricalcolare), poi conferma o rifiuta.', 'next-tours') . '</p>';
            if ($issues) {
                echo '<div class="notice notice-warning inline"><p>' . esc_html(implode(' ', $issues)) . '</p></div>';
            }
            $confirm_url = wp_nonce_url(admin_url('admin-post.php?action=next_tours_confirm&order_id=' . $order->get_id()), self::NONCE);
            $decline_url = wp_nonce_url(admin_url('admin-post.php?action=next_tours_decline&order_id=' . $order->get_id()), self::NONCE);
            // A nested <form> is not allowed inside the order form: the buttons copy the textarea into the URL.
            echo '<p><label for="next-tours-message">' . esc_html__('Messaggio al cliente (facoltativo)', 'next-tours') . '</label>';
            echo '<textarea id="next-tours-message" rows="3"></textarea></p>';
            echo '<div class="next-tours-order-actions">';
            echo '<a class="button button-primary" data-next-tours-action href="' . esc_url($confirm_url . ($issues ? '&force=1' : '')) . '">' . esc_html($issues ? __('Conferma comunque', 'next-tours') : __('Conferma e invia link di pagamento', 'next-tours')) . '</a>';
            echo '<a class="button" data-next-tours-action href="' . esc_url($decline_url) . '">' . esc_html__('Rifiuta', 'next-tours') . '</a>';
            echo '</div>';
            echo '<p class="description">' . esc_html__('Salva prima eventuali modifiche all’ordine.', 'next-tours') . '</p>';
            ?>
            <script>
            document.querySelectorAll('[data-next-tours-action]').forEach(function (link) {
                link.addEventListener('click', function (event) {
                    var message = document.getElementById('next-tours-message').value;
                    if (message) {
                        event.preventDefault();
                        window.location.href = link.href + '&message=' + encodeURIComponent(message);
                    }
                });
            });
            </script>
            <?php
        }
        echo '</div>';
    }

    /** Bookings of a request that no longer fit (capacity, closed departure, past cutoff). */
    private static function capacity_issues($order) {
        $issues = array();
        foreach (Next_Tours_Orders::bookings_of($order) as $booking) {
            $selection = array(
                'mode'         => $booking['mode'],
                'departure_id' => $booking['departure_id'],
                'date'         => $booking['date'],
                'time'         => $booking['time'],
            );
            $result = Next_Tours_Availability::resolve((int) $booking['product_id'], $selection, max(1, (int) $booking['seats']), $order->get_id());
            if (is_wp_error($result)) {
                $issues[] = $result->get_error_message();
            }
        }
        return array_unique($issues);
    }

    private static function load_order_for_action() {
        if (!current_user_can('edit_shop_orders')) {
            wp_die(esc_html__('Permesso negato.', 'next-tours'));
        }
        check_admin_referer(self::NONCE);
        $order = wc_get_order(isset($_GET['order_id']) ? absint($_GET['order_id']) : 0);
        if (!$order) {
            wp_die(esc_html__('Ordine non trovato.', 'next-tours'));
        }
        return $order;
    }

    private static function redirect($order, $notice) {
        wp_safe_redirect(add_query_arg('next_tours_notice', $notice, $order->get_edit_order_url()));
        exit;
    }

    public static function handle_confirm() {
        $order = self::load_order_for_action();
        if (!$order->has_status(Next_Tours_Orders::STATUS)) {
            self::redirect($order, 'not_request');
        }
        if (empty($_GET['force']) && self::capacity_issues($order)) {
            self::redirect($order, 'capacity');
        }

        $message = isset($_GET['message']) ? sanitize_textarea_field(wp_unslash($_GET['message'])) : '';
        $order->update_meta_data(Next_Tours_Bookings::CONFIRMED_META, time());
        $order->update_meta_data(self::MESSAGE_META, $message);
        $order->calculate_totals();

        if ((float) $order->get_total() > 0) {
            $order->update_status('pending', __('Richiesta di prenotazione confermata: inviato il link di pagamento.', 'next-tours'));
            Next_Tours_Emails::send('confirmed', $order);
        } else {
            // payment_complete() refuses the request status: move straight to processing.
            $order->update_status('processing', __('Richiesta di prenotazione confermata (nessun importo da pagare).', 'next-tours'));
        }
        self::redirect($order, 'confirmed');
    }

    public static function handle_decline() {
        $order = self::load_order_for_action();
        if (!$order->has_status(Next_Tours_Orders::STATUS)) {
            self::redirect($order, 'not_request');
        }
        $message = isset($_GET['message']) ? sanitize_textarea_field(wp_unslash($_GET['message'])) : '';
        $order->update_meta_data(self::DECLINE_META, $message);
        $order->save();
        $order->update_status('cancelled', __('Richiesta di prenotazione rifiutata.', 'next-tours') . ($message !== '' ? ' ' . $message : ''));
        Next_Tours_Emails::send('declined', $order);
        self::redirect($order, 'declined');
    }

    public static function notices() {
        if (empty($_GET['next_tours_notice'])) {
            return;
        }
        $notices = array(
            'confirmed'   => array('success', __('Prenotazione confermata. Il cliente ha ricevuto il link di pagamento.', 'next-tours')),
            'declined'    => array('success', __('Richiesta rifiutata e ordine annullato. Il cliente è stato avvisato.', 'next-tours')),
            'capacity'    => array('warning', __('Non ci sono più posti sufficienti o la data non è più prenotabile. Usa "Conferma comunque" se vuoi procedere.', 'next-tours')),
            'not_request' => array('error', __('Questo ordine non è una richiesta di prenotazione in attesa.', 'next-tours')),
        );
        $key = sanitize_key(wp_unslash($_GET['next_tours_notice']));
        if (isset($notices[$key])) {
            printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr($notices[$key][0]), esc_html($notices[$key][1]));
        }
    }

    // -----------------------------------------------------------------------
    // Bookings list (manifest)
    // -----------------------------------------------------------------------

    /**
     * Menu parent: the "Backend Headless" menu of the Headless Admin Menu plugin
     * when it is active (it hides the WooCommerce menu), WooCommerce otherwise.
     * Filterable for other admin-menu plugins.
     */
    public static function menu_parent() {
        $parent = function_exists('l7s_headless_admin_menu') ? 'l7s-headless-dashboard' : 'woocommerce';
        return apply_filters('next_tours_admin_menu_parent', $parent);
    }

    /** Orders list filtered on booking requests (HPOS or legacy screen). */
    public static function requests_url() {
        $hpos = class_exists('\Automattic\WooCommerce\Utilities\OrderUtil')
            && \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled();
        return $hpos
            ? 'admin.php?page=wc-orders&status=wc-' . Next_Tours_Orders::STATUS
            : 'edit.php?post_type=shop_order&post_status=wc-' . Next_Tours_Orders::STATUS;
    }

    public static function menu() {
        $parent = self::menu_parent();

        // Pending requests, shown as a bubble like WooCommerce's "processing" count.
        $count = function_exists('wc_orders_count') ? (int) wc_orders_count(Next_Tours_Orders::STATUS) : 0;
        $bubble = $count > 0
            ? ' <span class="awaiting-mod count-' . $count . '"><span class="pending-count">' . number_format_i18n($count) . '</span></span>'
            : '';

        add_submenu_page(
            $parent,
            __('Richieste di prenotazione', 'next-tours'),
            __('Richieste di prenotazione', 'next-tours') . $bubble,
            'edit_shop_orders',
            self::requests_url()
        );
        add_submenu_page(
            $parent,
            __('Prenotazioni tour', 'next-tours'),
            __('Prenotazioni tour', 'next-tours'),
            'edit_shop_orders',
            self::PAGE,
            array(__CLASS__, 'render_list')
        );
        add_submenu_page(
            $parent,
            __('Impostazioni tour', 'next-tours'),
            __('Impostazioni tour', 'next-tours'),
            'manage_woocommerce',
            'admin.php?page=wc-settings&tab=products&section=' . Next_Tours_Settings::SECTION
        );
        // The headless menu has no link to WooCommerce → Settings → Emails, where the booking e-mails are edited.
        if ($parent !== 'woocommerce') {
            add_submenu_page(
                $parent,
                __('Email prenotazioni', 'next-tours'),
                __('Email prenotazioni', 'next-tours'),
                'manage_woocommerce',
                'admin.php?page=wc-settings&tab=email'
            );
        }
    }

    public static function render_list() {
        $today = Next_Tours::today();
        // phpcs:disable WordPress.Security.NonceVerification.Recommended -- read-only filters
        $from = isset($_GET['from']) ? Next_Tours::date(sanitize_text_field(wp_unslash($_GET['from']))) : '';
        $to = isset($_GET['to']) ? Next_Tours::date(sanitize_text_field(wp_unslash($_GET['to']))) : '';
        $product_id = isset($_GET['product']) ? absint($_GET['product']) : 0;
        $all = !empty($_GET['all']);
        // phpcs:enable
        if ($from === '') {
            $from = $today;
        }
        if ($to === '' || $to < $from) {
            $to = DateTimeImmutable::createFromFormat('!Y-m-d', $from, Next_Tours::timezone())->modify('+30 days')->format('Y-m-d');
        }

        $rows = Next_Tours_Bookings::in_range($from, $to, $product_id, $all);
        $tours = wc_get_products(array('type' => Next_Tours::TYPE, 'limit' => -1, 'status' => array('publish', 'private', 'draft'), 'orderby' => 'title', 'order' => 'ASC'));
        $statuses = Next_Tours_Bookings::statuses();

        echo '<div class="wrap"><h1>' . esc_html__('Prenotazioni tour', 'next-tours') . '</h1>';
        echo '<form method="get" style="margin:12px 0"><input type="hidden" name="page" value="' . esc_attr(self::PAGE) . '" />';
        echo '<label>' . esc_html__('Dal', 'next-tours') . ' <input type="date" name="from" value="' . esc_attr($from) . '" /></label> ';
        echo '<label>' . esc_html__('Al', 'next-tours') . ' <input type="date" name="to" value="' . esc_attr($to) . '" /></label> ';
        echo '<select name="product"><option value="0">' . esc_html__('Tutti i tour', 'next-tours') . '</option>';
        foreach ($tours as $tour) {
            echo '<option value="' . esc_attr($tour->get_id()) . '"' . selected($product_id, $tour->get_id(), false) . '>' . esc_html($tour->get_name()) . '</option>';
        }
        echo '</select> <label><input type="checkbox" name="all" value="1"' . checked($all, true, false) . ' /> ' . esc_html__('Includi annullate e scadute', 'next-tours') . '</label> ';
        submit_button(__('Filtra', 'next-tours'), 'secondary', '', false);
        echo '</form>';

        if (!$rows) {
            echo '<p>' . esc_html__('Nessuna prenotazione nel periodo.', 'next-tours') . '</p></div>';
            return;
        }

        echo '<table class="widefat striped"><thead><tr>';
        foreach (array(__('Data', 'next-tours'), __('Ora', 'next-tours'), __('Tour', 'next-tours'), __('Partecipanti', 'next-tours'), __('Posti', 'next-tours'), __('Stato', 'next-tours'), __('Ordine', 'next-tours'), __('Cliente', 'next-tours')) as $heading) {
            echo '<th>' . esc_html($heading) . '</th>';
        }
        echo '</tr></thead><tbody>';

        $orders = array();
        foreach ($rows as $row) {
            $order_id = (int) $row['order_id'];
            if (!isset($orders[$order_id])) {
                $orders[$order_id] = wc_get_order($order_id);
            }
            $order = $orders[$order_id];
            $people = '';
            if ($order) {
                $item = $order->get_item((int) $row['order_item_id']);
                $booking = $item ? $item->get_meta(Next_Tours_Bookings::ITEM_META, true) : null;
                if (is_array($booking)) {
                    $meta = Next_Tours_Orders::display_meta($booking);
                    $people = isset($meta[__('Partecipanti', 'next-tours')]) ? $meta[__('Partecipanti', 'next-tours')] : '';
                    if (isset($meta[__('Extra', 'next-tours')])) {
                        $people .= ' · ' . $meta[__('Extra', 'next-tours')];
                    }
                }
            }
            $date = DateTimeImmutable::createFromFormat('!Y-m-d', $row['start_date'], Next_Tours::timezone());
            echo '<tr>';
            echo '<td>' . esc_html($date ? wp_date(get_option('date_format'), $date->getTimestamp(), Next_Tours::timezone()) : $row['start_date']) . '</td>';
            echo '<td>' . esc_html($row['start_time']) . '</td>';
            echo '<td>' . esc_html(get_the_title((int) $row['product_id'])) . '</td>';
            echo '<td>' . esc_html($people) . '</td>';
            echo '<td>' . esc_html((string) $row['seats']) . '</td>';
            echo '<td>' . esc_html(isset($statuses[$row['status']]) ? $statuses[$row['status']] : $row['status']) . '</td>';
            echo '<td>' . ($order ? '<a href="' . esc_url($order->get_edit_order_url()) . '">#' . esc_html($order->get_order_number()) . '</a>' : '#' . esc_html((string) $order_id)) . '</td>';
            echo '<td>' . esc_html($order ? trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()) . ' · ' . $order->get_billing_phone() : '') . '</td>';
            echo '</tr>';
        }
        echo '</tbody></table>';
        echo '<p class="description">' . esc_html__('Posti = posti occupati (o unità, per i tour a unità). Le richieste e gli ordini non pagati occupano posti fino alla scadenza.', 'next-tours') . '</p>';
        echo '</div>';
    }
}
