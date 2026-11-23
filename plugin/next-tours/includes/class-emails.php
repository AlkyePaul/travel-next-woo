<?php
/**
 * Booking e-mails, registered as WooCommerce e-mails (editable in
 * WooCommerce → Impostazioni → Email):
 *
 *   next_tours_request_customer  request received (customer)
 *   next_tours_request_admin     new request to review (shop)
 *   next_tours_confirmed         request confirmed + payment link (customer)
 *   next_tours_declined          request declined (customer)
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Emails {
    const SENT_META = '_next_tours_request_emailed';

    private static $classes = array(
        'request_customer' => 'Next_Tours_Email_Request_Customer',
        'request_admin'    => 'Next_Tours_Email_Request_Admin',
        'confirmed'        => 'Next_Tours_Email_Confirmed',
        'declined'         => 'Next_Tours_Email_Declined',
    );

    public static function init() {
        add_filter('woocommerce_email_classes', array(__CLASS__, 'register'));
        // Orders moved to "Richiesta di prenotazione" by hand also notify (once).
        add_action('woocommerce_order_status_' . Next_Tours_Orders::STATUS, array(__CLASS__, 'on_request_status'), 10, 2);
    }

    public static function register($emails) {
        require_once NEXT_TOURS_DIR . 'includes/class-email-classes.php';
        foreach (self::$classes as $class) {
            $emails[$class] = new $class();
        }
        return $emails;
    }

    public static function on_request_status($order_id, $order = null) {
        $order = $order instanceof WC_Order ? $order : wc_get_order($order_id);
        if ($order) {
            self::send_request_emails($order);
        }
    }

    public static function send_request_emails($order) {
        if ($order->get_meta(self::SENT_META) === 'yes') {
            return;
        }
        $order->update_meta_data(self::SENT_META, 'yes');
        $order->save_meta_data();
        self::send('request_customer', $order);
        self::send('request_admin', $order);
    }

    public static function send($type, $order) {
        if (!isset(self::$classes[$type]) || !function_exists('WC')) {
            return;
        }
        $emails = WC()->mailer()->get_emails();
        $class = self::$classes[$type];
        if (isset($emails[$class])) {
            $emails[$class]->trigger($order->get_id(), $order);
        }
    }
}
