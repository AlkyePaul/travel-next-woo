<?php
/**
 * Plugin Name: Next Tours
 * Description: Prodotti "Tour" per la vetrina Next.js: esperienze, tour giornalieri e pacchetti multi-giorno con partenze fisse e/o date libere, conferma immediata o su richiesta, e modelli di prezzo flessibili.
 * Version: 0.2.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * WC requires at least: 8.8
 * Author: AlkyePaul
 * License: MIT
 * Text Domain: next-tours
 */

if (!defined('ABSPATH')) {
    exit;
}

define('NEXT_TOURS_VERSION', '0.2.0');
define('NEXT_TOURS_FILE', __FILE__);
define('NEXT_TOURS_DIR', plugin_dir_path(__FILE__));
define('NEXT_TOURS_URL', plugin_dir_url(__FILE__));

require_once NEXT_TOURS_DIR . 'includes/class-next-tours.php';
require_once NEXT_TOURS_DIR . 'includes/class-settings.php';
require_once NEXT_TOURS_DIR . 'includes/class-bookings.php';
require_once NEXT_TOURS_DIR . 'includes/class-availability.php';
require_once NEXT_TOURS_DIR . 'includes/class-pricing.php';
require_once NEXT_TOURS_DIR . 'includes/class-product-type.php';
require_once NEXT_TOURS_DIR . 'includes/class-admin-product.php';
require_once NEXT_TOURS_DIR . 'includes/class-rest.php';
require_once NEXT_TOURS_DIR . 'includes/class-cart.php';
require_once NEXT_TOURS_DIR . 'includes/class-orders.php';
require_once NEXT_TOURS_DIR . 'includes/class-admin-orders.php';
require_once NEXT_TOURS_DIR . 'includes/class-emails.php';
require_once NEXT_TOURS_DIR . 'includes/class-translations.php';
require_once NEXT_TOURS_DIR . 'includes/class-catalog.php';
require_once NEXT_TOURS_DIR . 'includes/class-destinations.php';

// Orders are only read/written through WooCommerce CRUD, so HPOS is supported.
add_action('before_woocommerce_init', function () {
    if (class_exists('\Automattic\WooCommerce\Utilities\FeaturesUtil')) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', NEXT_TOURS_FILE, true);
    }
});

add_action('plugins_loaded', function () {
    if (!class_exists('WooCommerce')) {
        add_action('admin_notices', function () {
            echo '<div class="notice notice-error"><p>' . esc_html__('Next Tours richiede WooCommerce attivo.', 'next-tours') . '</p></div>';
        });
        return;
    }

    Next_Tours_Bookings::maybe_upgrade();

    Next_Tours_Settings::init();
    Next_Tours_Product_Type::init();
    Next_Tours_Admin_Product::init();
    Next_Tours_Rest::init();
    Next_Tours_Cart::init();
    Next_Tours_Orders::init();
    Next_Tours_Admin_Orders::init();
    Next_Tours_Emails::init();
    Next_Tours_Translations::init();
    Next_Tours_Catalog::init();
    Next_Tours_Destinations::init();
    Next_Tours_Bookings::init();
}, 20);

register_activation_hook(__FILE__, function () {
    Next_Tours_Bookings::install();
    if (!wp_next_scheduled(Next_Tours_Bookings::CRON_HOOK)) {
        wp_schedule_event(time() + 300, 'hourly', Next_Tours_Bookings::CRON_HOOK);
    }
});

register_deactivation_hook(__FILE__, function () {
    wp_clear_scheduled_hook(Next_Tours_Bookings::CRON_HOOK);
    wp_unschedule_hook(Next_Tours_Translations::HOOK);
});
