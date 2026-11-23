<?php
/**
 * Settings in WooCommerce → Impostazioni → Prodotti → Tour.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Settings {
    const SECTION = 'next_tours';

    public static function init() {
        add_filter('woocommerce_get_sections_products', array(__CLASS__, 'section'));
        add_filter('woocommerce_get_settings_products', array(__CLASS__, 'fields'), 10, 2);
    }

    public static function defaults() {
        return array(
            'next_tours_request_hold_hours'      => 48,
            'next_tours_payment_window_minutes'  => 60,
            'next_tours_confirmed_payment_hours' => 72,
            'next_tours_auto_cancel_unpaid'      => 'yes',
            'next_tours_admin_email'             => '',
        );
    }

    public static function get($name) {
        $defaults = self::defaults();
        $value = get_option($name, isset($defaults[$name]) ? $defaults[$name] : '');
        return $value === '' && isset($defaults[$name]) && is_int($defaults[$name]) ? $defaults[$name] : $value;
    }

    /** Hours a request keeps its seats while waiting for the admin (0 = seats not held). */
    public static function request_hold_hours() {
        return max(0, (int) self::get('next_tours_request_hold_hours'));
    }

    /** Minutes an instant booking keeps its seats while the customer pays. */
    public static function payment_window_minutes() {
        return max(5, (int) self::get('next_tours_payment_window_minutes'));
    }

    /** Hours a confirmed request keeps its seats while the customer pays. */
    public static function confirmed_payment_hours() {
        return max(1, (int) self::get('next_tours_confirmed_payment_hours'));
    }

    public static function auto_cancel_unpaid() {
        return self::get('next_tours_auto_cancel_unpaid') === 'yes';
    }

    public static function admin_email() {
        $email = sanitize_email((string) self::get('next_tours_admin_email'));
        return $email !== '' ? $email : get_option('admin_email');
    }

    public static function section($sections) {
        $sections[self::SECTION] = __('Tour', 'next-tours');
        return $sections;
    }

    public static function fields($settings, $current_section) {
        if ($current_section !== self::SECTION) {
            return $settings;
        }
        $d = self::defaults();
        return array(
            array(
                'title' => __('Prenotazioni tour', 'next-tours'),
                'type'  => 'title',
                'desc'  => __('Come vengono trattenuti i posti mentre una prenotazione attende conferma o pagamento.', 'next-tours'),
                'id'    => 'next_tours_options',
            ),
            array(
                'title'             => __('Posti trattenuti per le richieste (ore)', 'next-tours'),
                'desc'              => __('Per quante ore una richiesta "su richiesta" blocca i posti in attesa della tua risposta. 0 = i posti non vengono bloccati.', 'next-tours'),
                'id'                => 'next_tours_request_hold_hours',
                'type'              => 'number',
                'default'           => $d['next_tours_request_hold_hours'],
                'custom_attributes' => array('min' => 0, 'step' => 1),
            ),
            array(
                'title'             => __('Tempo per pagare, prenotazione immediata (minuti)', 'next-tours'),
                'desc'              => __('Dopo questo tempo un ordine non pagato libera i posti.', 'next-tours'),
                'id'                => 'next_tours_payment_window_minutes',
                'type'              => 'number',
                'default'           => $d['next_tours_payment_window_minutes'],
                'custom_attributes' => array('min' => 5, 'step' => 1),
            ),
            array(
                'title'             => __('Tempo per pagare, richiesta confermata (ore)', 'next-tours'),
                'desc'              => __('Dopo la tua conferma, il cliente ha questo tempo per pagare.', 'next-tours'),
                'id'                => 'next_tours_confirmed_payment_hours',
                'type'              => 'number',
                'default'           => $d['next_tours_confirmed_payment_hours'],
                'custom_attributes' => array('min' => 1, 'step' => 1),
            ),
            array(
                'title'   => __('Annulla gli ordini non pagati', 'next-tours'),
                'desc'    => __('Annulla automaticamente gli ordini di tour non pagati alla scadenza (altrimenti i posti vengono solo liberati).', 'next-tours'),
                'id'      => 'next_tours_auto_cancel_unpaid',
                'type'    => 'checkbox',
                'default' => $d['next_tours_auto_cancel_unpaid'],
            ),
            array(
                'title'       => __('Email per le richieste', 'next-tours'),
                'desc'        => __('Dove inviare le nuove richieste di prenotazione. Vuoto = email dell’amministratore.', 'next-tours'),
                'id'          => 'next_tours_admin_email',
                'type'        => 'email',
                'placeholder' => get_option('admin_email'),
                'default'     => '',
            ),
            array('type' => 'sectionend', 'id' => 'next_tours_options'),
        );
    }
}
