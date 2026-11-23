<?php
/**
 * Plugin Name: Headless Admin Menu
 * Description: Semplifica la sidebar di WordPress per usare WooCommerce come backend/headless CMS.
 * Version: 1.2.0
 * Author: Los 7 Secretos
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/*
 * Struttura della sidebar (solo per gli amministratori, capability manage_options):
 *
 *   Primo piano   Catalogo · Pagamenti · Ordini · Media · Utenti · Prenotazioni
 *   ─────────
 *   Secondario    Sito / Marketing · Impostazioni Backend · Analytics, Next.js, …
 *   ─────────
 *   In fondo      SiteGround (a tendina: Speed Optimizer, Security Optimizer, AI Agent)
 *
 * Catalogo, Media, Utenti e Pagamenti sono i menu nativi di WordPress/WooCommerce, solo
 * spostati e rinominati: sottovoci ed evidenziazione restano quelle originali.
 *
 * Le pagine dei plugin SiteGround restano registrate sotto il loro menu originale (nascosto)
 * e il menu "SiteGround" contiene solo link: gli screen id che quei plugin usano per caricare
 * i propri script non cambiano.
 */

add_action( 'admin_menu', 'l7s_headless_admin_menu', 999 );
// Dopo Next Tours (1000), che aggiunge le sue voci al menu Prenotazioni.
add_action( 'admin_menu', 'l7s_headless_admin_menu_finalize', 9999 );
add_filter( 'next_tours_admin_menu_parent', 'l7s_ham_bookings_parent' );
add_filter( 'custom_menu_order', 'l7s_ham_custom_menu_order' );
add_filter( 'menu_order', 'l7s_ham_menu_order', 9999 );
add_filter( 'parent_file', 'l7s_ham_parent_file', 999 );
add_filter( 'submenu_file', 'l7s_ham_submenu_file', 999 );
add_action( 'admin_head', 'l7s_ham_admin_css' );
// La Bacheca è nascosta: dopo il login (e aprendo /wp-admin/) si atterra sugli Ordini.
add_filter( 'login_redirect', 'l7s_ham_login_redirect', 20, 3 );
add_action( 'load-index.php', 'l7s_ham_dashboard_redirect' );

/**
 * Il menu riorganizzato vale solo per gli amministratori; gli altri ruoli
 * (es. shop manager) vedono il menu standard di WooCommerce.
 */
function l7s_ham_applies() {
    return current_user_can( 'manage_options' );
}

/**
 * Valori calcolati durante admin_menu e riusati dai filtri successivi.
 */
function l7s_ham_state( $key, $value = null ) {
    static $state = array();
    if ( null !== $value ) {
        $state[ $key ] = $value;
    }
    return isset( $state[ $key ] ) ? $state[ $key ] : null;
}

/**
 * Menu dei plugin SiteGround da raggruppare: slug del menu originale => etichetta.
 */
function l7s_ham_siteground_plugins() {
    return apply_filters(
        'l7s_headless_siteground_menus',
        array(
            'sg-cachepress' => 'Speed Optimizer',
            'sg-security'   => 'Security Optimizer',
            'sg-ai-studio'  => 'AI Agent',
        )
    );
}

/**
 * Lista ordini WooCommerce: schermata HPOS se attiva, altrimenti quella classica.
 */
function l7s_ham_orders_url() {
    $hpos = class_exists( '\Automattic\WooCommerce\Utilities\OrderUtil' )
        && \Automattic\WooCommerce\Utilities\OrderUtil::custom_orders_table_usage_is_enabled();
    return $hpos ? 'admin.php?page=wc-orders' : 'edit.php?post_type=shop_order';
}

/**
 * Ordini filtrati sullo stato "Richiesta di prenotazione" (Next Tours), '' se il plugin non è attivo.
 */
function l7s_ham_bookings_url() {
    if ( class_exists( 'Next_Tours_Admin_Orders' ) && method_exists( 'Next_Tours_Admin_Orders', 'requests_url' ) ) {
        return Next_Tours_Admin_Orders::requests_url();
    }
    return '';
}

/**
 * Next Tours aggiunge le sue voci (Richieste di prenotazione, Prenotazioni tour,
 * Impostazioni tour, Email prenotazioni) sotto il nostro menu Prenotazioni.
 */
function l7s_ham_bookings_parent( $parent ) {
    if ( ! l7s_ham_applies() ) {
        return 'woocommerce';
    }
    $bookings = l7s_ham_state( 'bookings' );
    return $bookings ? $bookings : 'woocommerce';
}

/**
 * URL admin di una voce di menu: le pagine dei plugin diventano admin.php?page=…
 */
function l7s_ham_page_url( $slug ) {
    return ( false !== strpos( $slug, '.php' ) ) ? $slug : 'admin.php?page=' . $slug;
}

/**
 * Indice in $menu della voce con lo slug dato, null se assente.
 */
function l7s_ham_menu_key( $slug ) {
    global $menu;
    foreach ( (array) $menu as $key => $item ) {
        if ( isset( $item[2] ) && $item[2] === $slug ) {
            return $key;
        }
    }
    return null;
}

/**
 * Slug della prima voce di primo livello che inizia con uno dei prefissi dati.
 */
function l7s_ham_find_menu( $prefixes ) {
    global $menu;
    foreach ( (array) $menu as $item ) {
        if ( ! isset( $item[2] ) ) {
            continue;
        }
        foreach ( $prefixes as $prefix ) {
            if ( 0 === strpos( $item[2], $prefix ) ) {
                return $item[2];
            }
        }
    }
    return null;
}

/**
 * Rinomina una voce di primo livello mantenendo eventuali badge (<span …>) dopo il testo.
 */
function l7s_ham_rename_menu( $slug, $title ) {
    global $menu;
    $key = l7s_ham_menu_key( $slug );
    if ( null === $key ) {
        return;
    }
    $current = (string) $menu[ $key ][0];
    $badge   = strpos( $current, '<' );
    $menu[ $key ][0] = $title . ( false !== $badge ? ' ' . trim( substr( $current, $badge ) ) : '' ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
}

/**
 * Aggiunge il contatore (stile "awaiting-mod" di WordPress) a una voce di primo livello.
 */
function l7s_ham_append_bubble( $slug, $count ) {
    global $menu;
    $key = l7s_ham_menu_key( $slug );
    if ( null === $key || $count < 1 ) {
        return;
    }
    $menu[ $key ][0] .= ' <span class="awaiting-mod count-' . $count . '"><span class="pending-count">' . number_format_i18n( $count ) . '</span></span>'; // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
}

/**
 * Riorganizza il menu admin per un uso headless/backend.
 */
function l7s_headless_admin_menu() {
    if ( ! l7s_ham_applies() ) {
        return;
    }

    /**
     * Primo piano: e-commerce.
     */

    // Catalogo = menu Prodotti di WooCommerce (tutti i prodotti, aggiungi, categorie, tag, attributi, recensioni).
    l7s_ham_rename_menu( 'edit.php?post_type=product', 'Catalogo' );

    // Pagamenti = voce "Payments" di WooCommerce (o di WooPayments, se collegato); se manca la creiamo.
    $payments = l7s_ham_find_menu( array( 'admin.php?page=wc-settings&tab=checkout', 'wc-admin&path=/payments/' ) );
    if ( null === $payments ) {
        $payments = 'admin.php?page=wc-settings&tab=checkout';
        add_menu_page( 'Pagamenti', 'Pagamenti', 'manage_woocommerce', $payments, '', 'dashicons-money-alt', 4 );
    } else {
        l7s_ham_rename_menu( $payments, 'Pagamenti' );
    }
    l7s_ham_state( 'payments', $payments );

    // Ordini: link diretto alla lista ordini di WooCommerce.
    $orders = l7s_ham_orders_url();
    add_menu_page( 'Ordini', 'Ordini', 'edit_shop_orders', $orders, '', 'dashicons-cart', 5 );
    l7s_ham_state( 'orders', $orders );

    // Prenotazioni: lo slug coincide con la voce "Richieste di prenotazione" di Next Tours,
    // così il clic sul menu apre direttamente le richieste da confermare.
    $bookings = l7s_ham_bookings_url();
    if ( $bookings ) {
        add_menu_page( 'Richieste di prenotazione', 'Prenotazioni', 'edit_shop_orders', $bookings, '', 'dashicons-calendar-alt', 6 );
        l7s_ham_state( 'bookings', $bookings );
    }

    /**
     * Area secondaria per ciò che riguarda sito, aspetto e marketing on-page.
     * Articoli e landing pages NON vengono aggiunti qui.
     */
    add_menu_page(
        'Sito / Marketing / Aspetto',
        'Sito / Marketing',
        'manage_options',
        'l7s-site-marketing',
        'l7s_site_marketing_page',
        'dashicons-megaphone',
        58
    );

    add_submenu_page(
        'l7s-site-marketing',
        'Panoramica',
        'Panoramica',
        'manage_options',
        'l7s-site-marketing',
        'l7s_site_marketing_page'
    );

    add_submenu_page(
        'l7s-site-marketing',
        'Pagine',
        'Pagine',
        'edit_pages',
        'edit.php?post_type=page'
    );

    add_submenu_page(
        'l7s-site-marketing',
        'Aspetto',
        'Aspetto',
        'edit_theme_options',
        'themes.php'
    );

    add_submenu_page(
        'l7s-site-marketing',
        'Menu',
        'Menu',
        'edit_theme_options',
        'nav-menus.php'
    );

    add_submenu_page(
        'l7s-site-marketing',
        'Personalizza',
        'Personalizza',
        'edit_theme_options',
        'customize.php'
    );

    /**
     * Impostazioni tecniche.
     */
    add_menu_page(
        'Impostazioni Backend',
        'Impostazioni Backend',
        'manage_options',
        'l7s-backend-settings',
        'l7s_backend_settings_page',
        'dashicons-admin-generic',
        80
    );

    add_submenu_page(
        'l7s-backend-settings',
        'Impostazioni WordPress',
        'WordPress',
        'manage_options',
        'options-general.php'
    );

    add_submenu_page(
        'l7s-backend-settings',
        'Plugin',
        'Plugin',
        'activate_plugins',
        'plugins.php'
    );

    add_submenu_page(
        'l7s-backend-settings',
        'Strumenti',
        'Strumenti',
        'manage_options',
        'tools.php'
    );

    // Impostazioni del plugin Next i18n (traduzioni DeepL), registrate sotto Impostazioni che è nascosto.
    if ( class_exists( 'Next_I18n_Settings' ) ) {
        add_submenu_page(
            'l7s-backend-settings',
            'Next i18n',
            'Next i18n',
            'manage_options',
            'options-general.php?page=' . Next_I18n_Settings::PAGE
        );
    }

    /**
     * Nasconde le voci originali ridondanti.
     * Le sezioni restano raggiungibili dai menu personalizzati.
     */
    remove_menu_page( 'index.php' );                       // Bacheca
    remove_menu_page( 'edit.php' );                        // Articoli
    remove_menu_page( 'edit.php?post_type=page' );         // Pagine
    remove_menu_page( 'edit-comments.php' );               // Commenti
    remove_menu_page( 'themes.php' );                      // Aspetto
    remove_menu_page( 'plugins.php' );                     // Plugin
    remove_menu_page( 'tools.php' );                       // Strumenti
    remove_menu_page( 'options-general.php' );             // Impostazioni

    // Menu WooCommerce: ordini, pagamenti e catalogo sono già in primo piano.
    remove_menu_page( 'woocommerce' );

    /**
     * Landing pages.
     * Alcuni plugin usano slug diversi. Questi sono esempi comuni.
     * Se il tuo plugin landing page usa un altro slug, va aggiunto qui.
     */
    remove_menu_page( 'edit.php?post_type=landing-page' );
    remove_menu_page( 'edit.php?post_type=landing_page' );
    remove_menu_page( 'edit.php?post_type=elementor_library' );
}

/**
 * Ultimo passaggio, quando tutti i plugin hanno registrato i loro menu.
 */
function l7s_headless_admin_menu_finalize() {
    if ( ! l7s_ham_applies() ) {
        return;
    }

    // Contatori: ordini in lavorazione (come fa WooCommerce) e richieste di prenotazione da gestire.
    $orders = l7s_ham_state( 'orders' );
    if ( $orders && function_exists( 'wc_processing_order_count' )
        && apply_filters( 'woocommerce_include_processing_order_count_in_menu', true )
        && current_user_can( 'edit_others_shop_orders' ) ) {
        l7s_ham_append_bubble( $orders, (int) wc_processing_order_count() );
    }

    $bookings = l7s_ham_state( 'bookings' );
    if ( $bookings && function_exists( 'wc_orders_count' ) && class_exists( 'Next_Tours_Orders' ) ) {
        l7s_ham_append_bubble( $bookings, (int) wc_orders_count( Next_Tours_Orders::STATUS ) );
    }

    l7s_ham_group_siteground();
    l7s_ham_reset_separators();
}

/**
 * Raccoglie i menu dei plugin SiteGround in un'unica voce "SiteGround" a tendina.
 * Ogni plugin compare come intestazione (link alla sua dashboard) seguita dalle sue pagine.
 */
function l7s_ham_group_siteground() {
    global $menu, $submenu;

    $items = array();
    $urls  = array();

    foreach ( l7s_ham_siteground_plugins() as $slug => $label ) {
        $key = l7s_ham_menu_key( $slug );
        if ( null === $key ) {
            continue; // Plugin non attivo.
        }

        $items[] = array(
            'title' => $label,
            'cap'   => $menu[ $key ][1],
            'url'   => l7s_ham_page_url( $slug ),
            'class' => 'l7s-sg-head',
        );

        if ( ! empty( $submenu[ $slug ] ) ) {
            foreach ( $submenu[ $slug ] as $sub ) {
                if ( $sub[2] === $slug ) {
                    continue; // Copia della voce principale ("Dashboard").
                }
                $items[] = array(
                    'title' => trim( wp_strip_all_tags( $sub[0] ) ),
                    'cap'   => $sub[1],
                    'url'   => l7s_ham_page_url( $sub[2] ),
                    'class' => 'l7s-sg-sub',
                );
            }
        }

        remove_menu_page( $slug );
    }

    if ( ! $items ) {
        return;
    }

    // Lo slug del menu coincide con la prima voce: niente doppione "SiteGround" nella tendina.
    $parent = $items[0]['url'];
    add_menu_page( 'SiteGround', 'SiteGround', $items[0]['cap'], $parent, '', 'dashicons-cloud', 99 );

    foreach ( $items as $item ) {
        add_submenu_page(
            $parent,
            $item['title'],
            '<span class="' . $item['class'] . '">' . esc_html( $item['title'] ) . '</span>',
            $item['cap'],
            $item['url']
        );
        $urls[] = $item['url'];
    }

    l7s_ham_state( 'siteground', $parent );
    l7s_ham_state( 'siteground_urls', $urls );
}

/**
 * Sostituisce i separatori (WordPress, WooCommerce, …) con i due usati tra i blocchi del menu.
 */
function l7s_ham_reset_separators() {
    global $menu;

    foreach ( $menu as $key => $item ) {
        if ( isset( $item[4] ) && false !== strpos( (string) $item[4], 'wp-menu-separator' ) ) {
            unset( $menu[ $key ] );
        }
    }

    $menu[] = array( '', 'read', 'l7s-separator-shop', '', 'wp-menu-separator' ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
    $menu[] = array( '', 'read', 'l7s-separator-hosting', '', 'wp-menu-separator' ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited
}

function l7s_ham_custom_menu_order( $custom ) {
    return l7s_ham_applies() ? true : $custom;
}

/**
 * Ordine finale: e-commerce in primo piano, poi il resto, SiteGround in fondo.
 */
function l7s_ham_menu_order( $order ) {
    if ( ! l7s_ham_applies() || ! is_array( $order ) ) {
        return $order;
    }

    $front = array_values(
        array_intersect(
            array_filter(
                array(
                    'edit.php?post_type=product',   // Catalogo
                    l7s_ham_state( 'payments' ),    // Pagamenti
                    l7s_ham_state( 'orders' ),      // Ordini
                    'upload.php',                   // Media
                    'users.php',                    // Utenti
                    l7s_ham_state( 'bookings' ),    // Prenotazioni
                )
            ),
            $order
        )
    );

    $siteground = l7s_ham_state( 'siteground' );
    $back       = ( $siteground && in_array( $siteground, $order, true ) ) ? array( $siteground ) : array();
    $separators = array( 'l7s-separator-shop', 'l7s-separator-hosting' );

    $rest = array();
    foreach ( $order as $slug ) {
        if ( in_array( $slug, $front, true ) || in_array( $slug, $back, true ) || in_array( $slug, $separators, true ) ) {
            continue;
        }
        $rest[] = $slug;
    }

    return array_merge( $front, array( 'l7s-separator-shop' ), $rest, array( 'l7s-separator-hosting' ), $back );
}

/**
 * Menu (e sottovoce) da evidenziare per la pagina corrente, quando l'originale è nascosto.
 *
 * @return array|null array( parent_file, submenu_file|null )
 */
function l7s_ham_current_target() {
    global $plugin_page, $typenow;

    if ( ! l7s_ham_applies() ) {
        return null;
    }

    // phpcs:disable WordPress.Security.NonceVerification.Recommended -- sola lettura per evidenziare il menu.
    $page     = isset( $plugin_page ) ? (string) $plugin_page : '';
    $bookings = l7s_ham_state( 'bookings' );

    // Ordini (HPOS: admin.php?page=wc-orders, classico: edit.php?post_type=shop_order).
    if ( 'wc-orders' === $page || ( '' === $page && 'shop_order' === $typenow ) ) {
        $status = '';
        if ( isset( $_GET['status'] ) ) {
            $status = sanitize_key( wp_unslash( $_GET['status'] ) );
        } elseif ( isset( $_GET['post_status'] ) ) {
            $status = sanitize_key( wp_unslash( $_GET['post_status'] ) );
        }
        if ( $bookings && class_exists( 'Next_Tours_Orders' ) && 'wc-' . Next_Tours_Orders::STATUS === $status ) {
            return array( $bookings, $bookings );
        }
        $orders = l7s_ham_state( 'orders' );
        return $orders ? array( $orders, null ) : null;
    }

    // Manifest "Prenotazioni tour" di Next Tours.
    if ( $bookings && class_exists( 'Next_Tours_Admin_Orders' ) && Next_Tours_Admin_Orders::PAGE === $page ) {
        return array( $bookings, Next_Tours_Admin_Orders::PAGE );
    }

    // Impostazioni WooCommerce raggiungibili dal menu.
    if ( 'wc-settings' === $page ) {
        $tab     = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : '';
        $section = isset( $_GET['section'] ) ? sanitize_key( wp_unslash( $_GET['section'] ) ) : '';

        if ( 'checkout' === $tab && l7s_ham_state( 'payments' ) ) {
            return array( l7s_ham_state( 'payments' ), null );
        }
        if ( $bookings && 'products' === $tab && class_exists( 'Next_Tours_Settings' ) && Next_Tours_Settings::SECTION === $section ) {
            return array( $bookings, 'admin.php?page=wc-settings&tab=products&section=' . Next_Tours_Settings::SECTION );
        }
        if ( $bookings && 'email' === $tab ) {
            return array( $bookings, 'admin.php?page=wc-settings&tab=email' );
        }
    }
    // phpcs:enable

    // Pagine dei plugin SiteGround.
    $sg_urls = l7s_ham_state( 'siteground_urls' );
    if ( '' !== $page && $sg_urls && in_array( 'admin.php?page=' . $page, $sg_urls, true ) ) {
        return array( l7s_ham_state( 'siteground' ), 'admin.php?page=' . $page );
    }

    // Impostazioni Next i18n.
    if ( class_exists( 'Next_I18n_Settings' ) && Next_I18n_Settings::PAGE === $page ) {
        return array( 'l7s-backend-settings', 'options-general.php?page=' . Next_I18n_Settings::PAGE );
    }

    return null;
}

/**
 * Menu nativi nascosti => gruppo personalizzato che ne contiene le voci.
 */
function l7s_ham_hidden_parents() {
    return array(
        'options-general.php'     => 'l7s-backend-settings',
        'plugins.php'             => 'l7s-backend-settings',
        'tools.php'               => 'l7s-backend-settings',
        'edit.php?post_type=page' => 'l7s-site-marketing',
        'themes.php'              => 'l7s-site-marketing',
    );
}

function l7s_ham_parent_file( $parent_file ) {
    $target = l7s_ham_current_target();
    if ( $target ) {
        return $target[0];
    }

    // Pagine sotto un menu nativo nascosto (es. Impostazioni → Lettura): apre il gruppo che lo sostituisce.
    $hidden = l7s_ham_hidden_parents();
    if ( l7s_ham_applies() && is_string( $parent_file ) && isset( $hidden[ $parent_file ] ) ) {
        return $hidden[ $parent_file ];
    }

    return $parent_file;
}

/**
 * Vero se l'URL è la home dell'admin (/wp-admin/ o vuoto), cioè nessuna pagina specifica richiesta.
 */
function l7s_ham_is_admin_home( $url ) {
    if ( '' === (string) $url ) {
        return true;
    }
    if ( '' !== (string) wp_parse_url( $url, PHP_URL_QUERY ) ) {
        return false;
    }
    $path = (string) wp_parse_url( $url, PHP_URL_PATH );
    $home = (string) wp_parse_url( admin_url(), PHP_URL_PATH );
    $path = preg_replace( '#index\.php$#', '', $path );
    return trim( $path, '/' ) === trim( $home, '/' );
}

/**
 * Dopo il login gli amministratori arrivano sugli Ordini, salvo che chiedessero una pagina precisa.
 */
function l7s_ham_login_redirect( $redirect_to, $requested_redirect_to, $user ) {
    if ( ! ( $user instanceof WP_User ) || ! user_can( $user, 'manage_options' ) ) {
        return $redirect_to;
    }
    if ( ! l7s_ham_is_admin_home( $requested_redirect_to ) || ! l7s_ham_is_admin_home( $redirect_to ) ) {
        return $redirect_to;
    }
    return admin_url( l7s_ham_orders_url() );
}

/**
 * Aprendo /wp-admin/ si va agli Ordini. La Bacheca resta raggiungibile da /wp-admin/index.php.
 */
function l7s_ham_dashboard_redirect() {
    if ( ! l7s_ham_applies() || ! empty( $_GET ) ) { // phpcs:ignore WordPress.Security.NonceVerification.Recommended
        return;
    }
    $request_path = (string) wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? wp_unslash( $_SERVER['REQUEST_URI'] ) : '', PHP_URL_PATH ); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
    if ( '' === $request_path || 'index.php' === basename( $request_path ) ) {
        return;
    }
    wp_safe_redirect( admin_url( l7s_ham_orders_url() ) );
    exit;
}

function l7s_ham_submenu_file( $submenu_file ) {
    $target = l7s_ham_current_target();
    return ( $target && null !== $target[1] ) ? $target[1] : $submenu_file;
}

/**
 * Stile della tendina SiteGround: nome del plugin in grassetto, pagine rientrate.
 */
function l7s_ham_admin_css() {
    if ( ! l7s_ham_applies() ) {
        return;
    }
    ?>
    <style id="l7s-headless-admin-menu">
        #adminmenu .wp-submenu .l7s-sg-head { font-weight: 600; }
        #adminmenu .wp-submenu li:not(.wp-first-item) > a > .l7s-sg-head { display: inline-block; margin-top: 6px; }
        #adminmenu .wp-submenu .l7s-sg-sub { display: inline-block; padding-left: 12px; }
    </style>
    <?php
}

/**
 * Pagina introduttiva Sito / Marketing.
 */
function l7s_site_marketing_page() {
    ?>
    <div class="wrap">
        <h1>Sito / Marketing / Aspetto</h1>
        <p>Area secondaria per pagine, aspetto, menu e configurazioni legate alla presenza on-page.</p>
        <p>Articoli e landing pages sono volutamente esclusi dal flusso principale.</p>
    </div>
    <?php
}

/**
 * Pagina introduttiva Impostazioni Backend.
 */
function l7s_backend_settings_page() {
    ?>
    <div class="wrap">
        <h1>Impostazioni Backend</h1>
        <p>Area tecnica per WordPress, plugin e strumenti.</p>
    </div>
    <?php
}
