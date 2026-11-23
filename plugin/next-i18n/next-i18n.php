<?php
/**
 * Plugin Name: Next i18n
 * Description: Traduzioni dei contenuti per la vetrina Next.js. Ogni lingua è salvata come campo dello stesso prodotto/post (un solo prodotto, un solo stock), con traduzione automatica tramite DeepL.
 * Version: 0.2.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: AlkyePaul
 * License: MIT
 * Text Domain: next-i18n
 */

if (!defined('ABSPATH')) {
    exit;
}

define('NEXT_I18N_VERSION', '0.2.0');
define('NEXT_I18N_DIR', plugin_dir_path(__FILE__));
define('NEXT_I18N_URL', plugin_dir_url(__FILE__));

require_once NEXT_I18N_DIR . 'includes/class-next-i18n.php';
require_once NEXT_I18N_DIR . 'includes/class-crypto.php';
require_once NEXT_I18N_DIR . 'includes/class-deepl.php';
require_once NEXT_I18N_DIR . 'includes/class-settings.php';
require_once NEXT_I18N_DIR . 'includes/class-metabox.php';
require_once NEXT_I18N_DIR . 'includes/class-auto-translate.php';
require_once NEXT_I18N_DIR . 'includes/class-rest.php';
require_once NEXT_I18N_DIR . 'includes/class-store-api.php';

add_action('plugins_loaded', function () {
    Next_I18n_Settings::init();
    Next_I18n_Metabox::init();
    Next_I18n_Auto_Translate::init();
    Next_I18n_Rest::init();
    Next_I18n_Store_Api::init();
});

register_deactivation_hook(__FILE__, function () {
    wp_clear_scheduled_hook(Next_I18n_Auto_Translate::HOOK);
});
