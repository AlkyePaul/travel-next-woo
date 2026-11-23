<?php
/**
 * Product edit screen: four tabs in WooCommerce's "Product data" box, shown
 * only for the "Tour / Esperienza" type.
 *
 *   Tour             descriptive info (kind, duration, itinerary, includes…)
 *   Prenotazione     booking modes, confirmation, cutoff, limits
 *   Date             fixed departures, open-date rules, blackout dates
 *   Prezzi           pricing model and extras
 *
 * All fields post under next_tour[info|booking|pricing][…] and are sanitised
 * by Next_Tours::sanitize_*().
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_Tours_Admin_Product {

    public static function init() {
        add_filter('woocommerce_product_data_tabs', array(__CLASS__, 'tabs'));
        add_action('woocommerce_product_data_panels', array(__CLASS__, 'panels'));
        add_action('woocommerce_admin_process_product_object', array(__CLASS__, 'save'));
        add_action('admin_enqueue_scripts', array(__CLASS__, 'assets'));
    }

    public static function assets($hook) {
        if (!in_array($hook, array('post.php', 'post-new.php'), true)) {
            return;
        }
        $screen = get_current_screen();
        if (!$screen || $screen->post_type !== 'product') {
            return;
        }
        wp_enqueue_style('next-tours-admin', NEXT_TOURS_URL . 'assets/admin.css', array(), NEXT_TOURS_VERSION);
        wp_enqueue_script('next-tours-admin', NEXT_TOURS_URL . 'assets/admin.js', array('jquery'), NEXT_TOURS_VERSION, true);
        wp_localize_script('next-tours-admin', 'NextTours', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce(Next_Tours_Translations::NONCE),
            'i18n'    => array(
                'confirmRemove' => __('Rimuovere questa riga?', 'next-tours'),
                'translating'   => __('Traduzione in corso…', 'next-tours'),
                'translated'    => __('Campi tradotti. Salva il prodotto per aggiornare il sito.', 'next-tours'),
                'error'         => __('Traduzione non riuscita.', 'next-tours'),
            ),
        ));
    }

    public static function tabs($tabs) {
        foreach (array('inventory', 'shipping') as $key) {
            if (isset($tabs[$key])) {
                $tabs[$key]['class'][] = 'hide_if_tour';
            }
        }
        $tabs['next_tour_info'] = array(
            'label'    => __('Tour', 'next-tours'),
            'target'   => 'next_tour_info_data',
            'class'    => array('show_if_tour'),
            'priority' => 5,
        );
        $tabs['next_tour_booking'] = array(
            'label'    => __('Prenotazione', 'next-tours'),
            'target'   => 'next_tour_booking_data',
            'class'    => array('show_if_tour'),
            'priority' => 6,
        );
        $tabs['next_tour_dates'] = array(
            'label'    => __('Date', 'next-tours'),
            'target'   => 'next_tour_dates_data',
            'class'    => array('show_if_tour'),
            'priority' => 7,
        );
        $tabs['next_tour_pricing'] = array(
            'label'    => __('Prezzi', 'next-tours'),
            'target'   => 'next_tour_pricing_data',
            'class'    => array('show_if_tour'),
            'priority' => 8,
        );
        return $tabs;
    }

    public static function save($product) {
        if ($product->get_type() !== Next_Tours::TYPE) {
            return;
        }
        // Nonce already verified by WooCommerce (woocommerce_meta_nonce) before this hook.
        // phpcs:ignore WordPress.Security.NonceVerification.Missing
        $raw = isset($_POST['next_tour']) && is_array($_POST['next_tour']) ? $_POST['next_tour'] : array();

        $info = Next_Tours::sanitize_info(isset($raw['info']) ? $raw['info'] : array());
        $booking = Next_Tours::sanitize_booking(isset($raw['booking']) ? $raw['booking'] : array());
        $pricing = Next_Tours::sanitize_pricing(isset($raw['pricing']) ? $raw['pricing'] : array());

        $product->update_meta_data(Next_Tours::META_INFO, $info);
        $product->update_meta_data(Next_Tours::META_BOOKING, $booking);
        $product->update_meta_data(Next_Tours::META_PRICING, $pricing);

        // "From" price for listings, sorting and price filters.
        $from = Next_Tours_Pricing::from_price($pricing);
        $product->set_regular_price($from);
        $product->set_sale_price('');
        $product->set_price($from);

        $product->set_virtual(true);
        $product->set_downloadable(false);
        $product->set_sold_individually(true);
        $product->set_manage_stock(false);
        $product->set_stock_status('instock');
    }

    // -----------------------------------------------------------------------
    // Panels
    // -----------------------------------------------------------------------

    public static function panels() {
        global $post;
        $id = $post ? (int) $post->ID : 0;
        $info = Next_Tours::get_info($id);
        $booking = Next_Tours::get_booking($id);
        $pricing = Next_Tours::get_pricing($id);

        self::panel_info($id, $info);
        self::panel_booking($booking);
        self::panel_dates($id, $booking);
        self::panel_pricing($pricing);
    }

    private static function panel_info($id, array $info) {
        $n = 'next_tour[info]';
        echo '<div id="next_tour_info_data" class="panel woocommerce_options_panel hidden next-tours-panel">';

        echo '<div class="options_group">';
        self::select($n . '[kind]', __('Tipologia', 'next-tours'), $info['kind'], Next_Tours::kinds(), array('data-next-tours-kind' => '1'));
        echo '<p class="form-field next-tours-inline"><label>' . esc_html__('Durata', 'next-tours') . '</label>';
        echo '<input type="number" min="0" step="0.5" name="' . esc_attr($n . '[duration][value]') . '" value="' . esc_attr($info['duration']['value'] ? $info['duration']['value'] : '') . '" class="short" /> ';
        echo '<select name="' . esc_attr($n . '[duration][unit]') . '">';
        foreach (Next_Tours::duration_units() as $value => $label) {
            echo '<option value="' . esc_attr($value) . '"' . selected($info['duration']['unit'], $value, false) . '>' . esc_html($label) . '</option>';
        }
        echo '</select></p>';
        self::number($n . '[nights]', __('Notti', 'next-tours'), $info['nights'], array('wrapper_class' => 'next-tours-multi-day', 'description' => __('Per i pacchetti multi-giorno.', 'next-tours')));
        self::select($n . '[difficulty]', __('Difficoltà', 'next-tours'), $info['difficulty'], Next_Tours::difficulties());
        self::number($n . '[min_age]', __('Età minima', 'next-tours'), $info['min_age']);
        echo '<p class="form-field next-tours-inline"><label>' . esc_html__('Dimensione del gruppo', 'next-tours') . '</label>';
        echo '<input type="number" min="0" name="' . esc_attr($n . '[group_size][min]') . '" value="' . esc_attr($info['group_size']['min'] ? $info['group_size']['min'] : '') . '" placeholder="' . esc_attr__('min', 'next-tours') . '" class="short" /> – ';
        echo '<input type="number" min="0" name="' . esc_attr($n . '[group_size][max]') . '" value="' . esc_attr($info['group_size']['max'] ? $info['group_size']['max'] : '') . '" placeholder="' . esc_attr__('max', 'next-tours') . '" class="short" />';
        echo '<span class="description">' . esc_html__('Solo informativo (la capienza si imposta nelle Date).', 'next-tours') . '</span></p>';
        self::text($n . '[languages]', __('Lingue', 'next-tours'), implode(', ', $info['languages']), array('placeholder' => __('Italiano, Español, English', 'next-tours'), 'description' => __('Separate da virgola.', 'next-tours')));
        echo '</div>';

        echo '<div class="options_group">';
        self::text($n . '[meeting_point][address]', __('Punto d’incontro', 'next-tours'), $info['meeting_point']['address']);
        self::textarea($n . '[meeting_point][notes]', __('Indicazioni', 'next-tours'), $info['meeting_point']['notes'], array('rows' => 2));
        echo '<p class="form-field next-tours-inline"><label>' . esc_html__('Coordinate', 'next-tours') . '</label>';
        echo '<input type="text" name="' . esc_attr($n . '[meeting_point][lat]') . '" value="' . esc_attr($info['meeting_point']['lat']) . '" placeholder="' . esc_attr__('latitudine', 'next-tours') . '" class="short" /> ';
        echo '<input type="text" name="' . esc_attr($n . '[meeting_point][lng]') . '" value="' . esc_attr($info['meeting_point']['lng']) . '" placeholder="' . esc_attr__('longitudine', 'next-tours') . '" class="short" />';
        echo '<span class="description">' . esc_html__('Facoltative, per la mappa.', 'next-tours') . '</span></p>';
        self::text($n . '[end_point][address]', __('Punto di arrivo', 'next-tours'), $info['end_point']['address'], array('description' => __('Se diverso dal punto d’incontro.', 'next-tours')));
        echo '</div>';

        echo '<div class="options_group">';
        $one_per_line = __('Una voce per riga.', 'next-tours');
        self::textarea($n . '[highlights]', __('Punti salienti', 'next-tours'), implode("\n", $info['highlights']), array('rows' => 4, 'description' => $one_per_line));
        self::textarea($n . '[included]', __('Incluso', 'next-tours'), implode("\n", $info['included']), array('rows' => 4, 'description' => $one_per_line));
        self::textarea($n . '[not_included]', __('Non incluso', 'next-tours'), implode("\n", $info['not_included']), array('rows' => 4, 'description' => $one_per_line));
        self::textarea($n . '[what_to_bring]', __('Cosa portare', 'next-tours'), implode("\n", $info['what_to_bring']), array('rows' => 3, 'description' => $one_per_line));
        self::textarea($n . '[important_info]', __('Informazioni importanti', 'next-tours'), $info['important_info'], array('rows' => 3));
        self::textarea($n . '[cancellation_policy]', __('Politica di cancellazione', 'next-tours'), $info['cancellation_policy'], array('rows' => 3));
        echo '</div>';

        // Itinerary
        echo '<div class="options_group next-tours-section">';
        echo '<h4>' . esc_html__('Itinerario', 'next-tours') . '</h4>';
        echo '<p class="next-tours-help">' . esc_html__('Una tappa (o un giorno, per i pacchetti) per riga.', 'next-tours') . '</p>';
        echo '<div class="next-tours-repeater" data-next-tours-repeater>';
        echo '<div class="next-tours-cards" data-rows>';
        foreach ($info['itinerary'] as $i => $stop) {
            self::itinerary_row($n, (string) $i, $stop);
        }
        echo '</div><template data-template>';
        self::itinerary_row($n, '__i__', array('title' => '', 'description' => '', 'meals' => array(), 'accommodation' => ''));
        echo '</template>';
        echo '<button type="button" class="button" data-add>' . esc_html__('+ Aggiungi tappa / giorno', 'next-tours') . '</button>';
        echo '</div></div>';

        Next_Tours_Translations::render_box($id);

        echo '</div>';
    }

    private static function itinerary_row($n, $i, array $stop) {
        $p = $n . '[itinerary][' . $i . ']';
        echo '<div class="next-tours-card" data-row>';
        echo '<div class="next-tours-card-head"><span class="next-tours-handle" data-number></span>';
        echo '<input type="text" name="' . esc_attr($p . '[title]') . '" value="' . esc_attr($stop['title']) . '" placeholder="' . esc_attr__('Titolo (es. Giorno 1 – Siviglia)', 'next-tours') . '" class="next-tours-grow" />';
        echo '<button type="button" class="button-link next-tours-remove" data-remove aria-label="' . esc_attr__('Rimuovi', 'next-tours') . '">&times;</button></div>';
        echo '<textarea name="' . esc_attr($p . '[description]') . '" rows="3" placeholder="' . esc_attr__('Descrizione', 'next-tours') . '">' . esc_textarea($stop['description']) . '</textarea>';
        echo '<div class="next-tours-card-foot">';
        foreach (Next_Tours::meals() as $meal => $label) {
            echo '<label><input type="checkbox" name="' . esc_attr($p . '[meals][' . $meal . ']') . '" value="1"' . checked(in_array($meal, $stop['meals'], true), true, false) . ' /> ' . esc_html($label) . '</label> ';
        }
        echo '<input type="text" name="' . esc_attr($p . '[accommodation]') . '" value="' . esc_attr($stop['accommodation']) . '" placeholder="' . esc_attr__('Pernottamento (facoltativo)', 'next-tours') . '" class="next-tours-grow" />';
        echo '</div></div>';
    }

    private static function panel_booking(array $booking) {
        $n = 'next_tour[booking]';
        echo '<div id="next_tour_booking_data" class="panel woocommerce_options_panel hidden next-tours-panel">';

        echo '<div class="options_group">';
        echo '<p class="next-tours-help">' . esc_html__('Attiva una o entrambe le modalità. Le date si gestiscono nella scheda "Date".', 'next-tours') . '</p>';
        self::checkbox($n . '[fixed_departures]', __('Partenze fisse', 'next-tours'), $booking['fixed_departures'], __('Date programmate, ognuna con i propri posti (es. pacchetto con partenza il 12/12).', 'next-tours'), array('data-next-tours-toggle' => 'fixed'));
        self::checkbox($n . '[open_dates]', __('Date libere', 'next-tours'), $booking['open_dates'], __('Il cliente sceglie il giorno (e l’orario) in base a regole settimanali.', 'next-tours'), array('data-next-tours-toggle' => 'open'));
        echo '</div>';

        echo '<div class="options_group">';
        self::select($n . '[confirmation]', __('Conferma', 'next-tours'), $booking['confirmation'], Next_Tours::confirmation_modes(), array(
            'description' => __('"Su richiesta": il cliente invia una richiesta senza pagare; la confermi o rifiuti dall’ordine, poi riceve il link di pagamento. Si può cambiare per singola partenza.', 'next-tours'),
        ));
        self::number($n . '[cutoff_hours]', __('Prenotabile fino a (ore prima)', 'next-tours'), $booking['cutoff_hours'], array('description' => __('Es. 24 = non si può prenotare nelle 24 ore prima dell’inizio.', 'next-tours'), 'zero' => true));
        self::number($n . '[booking_window_days]', __('Prenotabile con anticipo massimo (giorni)', 'next-tours'), $booking['booking_window_days']);
        self::number($n . '[min_per_booking]', __('Minimo partecipanti per prenotazione', 'next-tours'), $booking['min_per_booking']);
        self::number($n . '[max_per_booking]', __('Massimo partecipanti per prenotazione', 'next-tours'), $booking['max_per_booking'], array('description' => __('0 = nessun limite.', 'next-tours'), 'zero' => true));
        echo '</div>';

        echo '</div>';
    }

    private static function panel_dates($id, array $booking) {
        $n = 'next_tour[booking]';
        $booked = $id ? Next_Tours_Bookings::seats_by_departure($id) : array();
        echo '<div id="next_tour_dates_data" class="panel woocommerce_options_panel hidden next-tours-panel">';

        // Fixed departures
        echo '<div class="options_group next-tours-section" data-next-tours-section="fixed">';
        echo '<h4>' . esc_html__('Partenze fisse', 'next-tours') . '</h4>';
        echo '<p class="next-tours-help" data-next-tours-off="fixed">' . esc_html__('Attiva "Partenze fisse" nella scheda Prenotazione per renderle prenotabili.', 'next-tours') . '</p>';
        echo '<div class="next-tours-repeater" data-next-tours-repeater><table class="widefat striped next-tours-table"><thead><tr>';
        foreach (array(
            __('Data', 'next-tours'),
            __('Ora', 'next-tours'),
            __('Fine', 'next-tours'),
            __('Posti', 'next-tours'),
            __('Prenotati', 'next-tours'),
            __('Prezzo ±%', 'next-tours'),
            __('Conferma', 'next-tours'),
            __('Stato', 'next-tours'),
            __('Garantita', 'next-tours'),
            __('Nota', 'next-tours'),
            '',
        ) as $heading) {
            echo '<th>' . esc_html($heading) . '</th>';
        }
        echo '</tr></thead><tbody data-rows>';
        foreach ($booking['departures'] as $i => $dep) {
            self::departure_row($n, (string) $i, $dep, isset($booked[$dep['id']]) ? $booked[$dep['id']] : 0);
        }
        echo '</tbody></table><template data-template>';
        self::departure_row($n, '__i__', array(
            'id' => '', 'date' => '', 'time' => '', 'end_date' => '', 'capacity' => 0, 'price_adjustment' => 0,
            'confirmation' => 'inherit', 'status' => 'open', 'guaranteed' => false, 'note' => '',
        ), null);
        echo '</template>';
        echo '<p><button type="button" class="button" data-add>' . esc_html__('+ Aggiungi partenza', 'next-tours') . '</button></p>';
        echo '<p class="next-tours-help">' . esc_html__('Posti 0 = illimitati. "Fine" vuoto = calcolata dalla durata. "Prezzo ±%" applica un supplemento (o sconto, con valore negativo) al prezzo base.', 'next-tours') . '</p>';
        echo '</div></div>';

        // Open dates
        echo '<div class="options_group next-tours-section" data-next-tours-section="open">';
        echo '<h4>' . esc_html__('Date libere', 'next-tours') . '</h4>';
        echo '<p class="next-tours-help" data-next-tours-off="open">' . esc_html__('Attiva "Date libere" nella scheda Prenotazione per renderle prenotabili.', 'next-tours') . '</p>';
        echo '<p class="next-tours-help">' . esc_html__('Per ogni giorno vale la prima regola che corrisponde (metti prima le regole più specifiche, es. alta stagione).', 'next-tours') . '</p>';
        echo '<div class="next-tours-repeater" data-next-tours-repeater><table class="widefat striped next-tours-table"><thead><tr>';
        foreach (array(
            __('Dal', 'next-tours'),
            __('Al', 'next-tours'),
            __('Giorni', 'next-tours'),
            __('Orari', 'next-tours'),
            __('Posti per orario', 'next-tours'),
            __('Prezzo ±%', 'next-tours'),
            '',
        ) as $heading) {
            echo '<th>' . esc_html($heading) . '</th>';
        }
        echo '</tr></thead><tbody data-rows>';
        foreach ($booking['rules'] as $i => $rule) {
            self::rule_row($n, (string) $i, $rule);
        }
        echo '</tbody></table><template data-template>';
        self::rule_row($n, '__i__', array('from' => '', 'to' => '', 'weekdays' => range(1, 7), 'times' => array(), 'capacity' => 0, 'price_adjustment' => 0));
        echo '</template>';
        echo '<p><button type="button" class="button" data-add>' . esc_html__('+ Aggiungi regola', 'next-tours') . '</button></p>';
        echo '<p class="next-tours-help">' . esc_html__('Date vuote = sempre. Orari separati da virgola (es. 09:00, 15:30); vuoto = giornata intera. Posti 0 = illimitati.', 'next-tours') . '</p>';
        echo '</div>';
        self::textarea($n . '[blackouts]', __('Date escluse', 'next-tours'), implode("\n", $booking['blackouts']), array(
            'rows'        => 3,
            'placeholder' => '2026-12-25',
            'description' => __('Una data per riga (AAAA-MM-GG): giorni senza date libere.', 'next-tours'),
        ));
        echo '</div>';

        echo '</div>';
    }

    private static function departure_row($n, $i, array $dep, $booked) {
        $p = $n . '[departures][' . $i . ']';
        echo '<tr data-row>';
        echo '<td><input type="hidden" name="' . esc_attr($p . '[id]') . '" value="' . esc_attr($dep['id']) . '" />';
        echo '<input type="date" name="' . esc_attr($p . '[date]') . '" value="' . esc_attr($dep['date']) . '" /></td>';
        echo '<td><input type="time" name="' . esc_attr($p . '[time]') . '" value="' . esc_attr($dep['time']) . '" /></td>';
        echo '<td><input type="date" name="' . esc_attr($p . '[end_date]') . '" value="' . esc_attr($dep['end_date']) . '" /></td>';
        echo '<td><input type="number" min="0" class="next-tours-xs" name="' . esc_attr($p . '[capacity]') . '" value="' . esc_attr($dep['capacity'] ? $dep['capacity'] : '') . '" /></td>';
        echo '<td class="next-tours-booked">' . ($booked === null ? '—' : esc_html((string) $booked)) . '</td>';
        echo '<td><input type="number" step="0.01" class="next-tours-xs" name="' . esc_attr($p . '[price_adjustment]') . '" value="' . esc_attr($dep['price_adjustment'] ? $dep['price_adjustment'] : '') . '" /></td>';
        echo '<td><select name="' . esc_attr($p . '[confirmation]') . '">';
        foreach (array(
            'inherit'    => __('Come prodotto', 'next-tours'),
            'instant'    => __('Immediata', 'next-tours'),
            'on_request' => __('Su richiesta', 'next-tours'),
        ) as $value => $label) {
            echo '<option value="' . esc_attr($value) . '"' . selected($dep['confirmation'], $value, false) . '>' . esc_html($label) . '</option>';
        }
        echo '</select></td>';
        echo '<td><select name="' . esc_attr($p . '[status]') . '">';
        foreach (Next_Tours::departure_statuses() as $value => $label) {
            echo '<option value="' . esc_attr($value) . '"' . selected($dep['status'], $value, false) . '>' . esc_html($label) . '</option>';
        }
        echo '</select></td>';
        echo '<td class="next-tours-center"><input type="checkbox" name="' . esc_attr($p . '[guaranteed]') . '" value="1"' . checked($dep['guaranteed'], true, false) . ' /></td>';
        echo '<td><input type="text" name="' . esc_attr($p . '[note]') . '" value="' . esc_attr($dep['note']) . '" /></td>';
        echo '<td><button type="button" class="button-link next-tours-remove" data-remove aria-label="' . esc_attr__('Rimuovi', 'next-tours') . '">&times;</button></td>';
        echo '</tr>';
    }

    private static function rule_row($n, $i, array $rule) {
        $p = $n . '[rules][' . $i . ']';
        $days = array(1 => 'L', 2 => 'M', 3 => 'M', 4 => 'G', 5 => 'V', 6 => 'S', 7 => 'D');
        echo '<tr data-row>';
        echo '<td><input type="date" name="' . esc_attr($p . '[from]') . '" value="' . esc_attr($rule['from']) . '" /></td>';
        echo '<td><input type="date" name="' . esc_attr($p . '[to]') . '" value="' . esc_attr($rule['to']) . '" /></td>';
        echo '<td class="next-tours-weekdays">';
        foreach ($days as $day => $letter) {
            echo '<label title="' . esc_attr(date_i18n('l', strtotime('Sunday +' . $day . ' days'))) . '"><input type="checkbox" name="' . esc_attr($p . '[weekdays][' . $day . ']') . '" value="1"' . checked(in_array($day, array_map('intval', $rule['weekdays']), true), true, false) . ' />' . esc_html($letter) . '</label>';
        }
        echo '</td>';
        echo '<td><input type="text" name="' . esc_attr($p . '[times]') . '" value="' . esc_attr(implode(', ', $rule['times'])) . '" placeholder="09:00, 15:00" /></td>';
        echo '<td><input type="number" min="0" class="next-tours-xs" name="' . esc_attr($p . '[capacity]') . '" value="' . esc_attr($rule['capacity'] ? $rule['capacity'] : '') . '" /></td>';
        echo '<td><input type="number" step="0.01" class="next-tours-xs" name="' . esc_attr($p . '[price_adjustment]') . '" value="' . esc_attr($rule['price_adjustment'] ? $rule['price_adjustment'] : '') . '" /></td>';
        echo '<td><button type="button" class="button-link next-tours-remove" data-remove aria-label="' . esc_attr__('Rimuovi', 'next-tours') . '">&times;</button></td>';
        echo '</tr>';
    }

    private static function panel_pricing(array $pricing) {
        $n = 'next_tour[pricing]';
        echo '<div id="next_tour_pricing_data" class="panel woocommerce_options_panel hidden next-tours-panel">';

        echo '<div class="options_group">';
        self::select($n . '[model]', __('Modello di prezzo', 'next-tours'), $pricing['model'], Next_Tours::pricing_models(), array('data-next-tours-model' => '1'));
        echo '<p class="next-tours-help">' . esc_html(sprintf(
            /* translators: %s: currency symbol */
            __('Prezzi in %s, inseriti come gli altri prezzi del negozio (IVA inclusa o esclusa secondo le impostazioni di WooCommerce).', 'next-tours'),
            get_woocommerce_currency_symbol()
        )) . '</p>';
        echo '</div>';

        // per_person
        echo '<div class="options_group" data-next-tours-model-section="per_person">';
        self::text($n . '[price]', __('Prezzo per persona', 'next-tours'), $pricing['price'], array('class' => 'short wc_input_price'));
        echo '</div>';

        // person_types
        echo '<div class="options_group next-tours-section" data-next-tours-model-section="person_types">';
        echo '<h4>' . esc_html__('Tipologie di partecipanti', 'next-tours') . '</h4>';
        echo '<div class="next-tours-repeater" data-next-tours-repeater><table class="widefat striped next-tours-table"><thead><tr>';
        foreach (array(
            __('Codice', 'next-tours'),
            __('Etichetta', 'next-tours'),
            __('Prezzo', 'next-tours'),
            __('Età da', 'next-tours'),
            __('Età a', 'next-tours'),
            __('Min', 'next-tours'),
            __('Max', 'next-tours'),
            __('Occupa posto', 'next-tours'),
            '',
        ) as $heading) {
            echo '<th>' . esc_html($heading) . '</th>';
        }
        echo '</tr></thead><tbody data-rows>';
        $types = $pricing['person_types'];
        if (!$types) {
            $types = array(
                array('key' => 'adult', 'label' => __('Adulto', 'next-tours'), 'price' => '', 'min_age' => 12, 'max_age' => 0, 'min' => 1, 'max' => 0, 'counts_capacity' => true),
                array('key' => 'child', 'label' => __('Bambino', 'next-tours'), 'price' => '', 'min_age' => 3, 'max_age' => 11, 'min' => 0, 'max' => 0, 'counts_capacity' => true),
                array('key' => 'infant', 'label' => __('Neonato', 'next-tours'), 'price' => '0', 'min_age' => 0, 'max_age' => 2, 'min' => 0, 'max' => 0, 'counts_capacity' => false),
            );
        }
        foreach ($types as $i => $type) {
            self::person_type_row($n, (string) $i, $type);
        }
        echo '</tbody></table><template data-template>';
        self::person_type_row($n, '__i__', array('key' => '', 'label' => '', 'price' => '', 'min_age' => 0, 'max_age' => 0, 'min' => 0, 'max' => 0, 'counts_capacity' => true));
        echo '</template>';
        echo '<p><button type="button" class="button" data-add>' . esc_html__('+ Aggiungi tipologia', 'next-tours') . '</button></p>';
        echo '<p class="next-tours-help">' . esc_html(sprintf(
            /* translators: %s: list of codes */
            __('Codici standard tradotti automaticamente sul sito: %s. Età 0 = nessun limite. "Occupa posto" disattivato = non conta nella capienza (es. neonati).', 'next-tours'),
            implode(', ', array_keys(Next_Tours::standard_person_types()))
        )) . '</p>';
        echo '</div></div>';

        // group_tiers
        echo '<div class="options_group next-tours-section" data-next-tours-model-section="group_tiers">';
        echo '<h4>' . esc_html__('Scaglioni (prezzo per persona)', 'next-tours') . '</h4>';
        echo '<div class="next-tours-repeater" data-next-tours-repeater><table class="widefat striped next-tours-table"><thead><tr>';
        foreach (array(__('Da (persone)', 'next-tours'), __('A (persone)', 'next-tours'), __('Prezzo per persona', 'next-tours'), '') as $heading) {
            echo '<th>' . esc_html($heading) . '</th>';
        }
        echo '</tr></thead><tbody data-rows>';
        foreach ($pricing['tiers'] as $i => $tier) {
            self::tier_row($n, (string) $i, $tier);
        }
        echo '</tbody></table><template data-template>';
        self::tier_row($n, '__i__', array('min' => '', 'max' => '', 'price' => ''));
        echo '</template>';
        echo '<p><button type="button" class="button" data-add>' . esc_html__('+ Aggiungi scaglione', 'next-tours') . '</button></p>';
        echo '<p class="next-tours-help">' . esc_html__('"A" vuoto = senza limite superiore.', 'next-tours') . '</p>';
        echo '</div></div>';

        // private_group
        echo '<div class="options_group" data-next-tours-model-section="private_group">';
        self::text($n . '[group][price]', __('Prezzo del gruppo', 'next-tours'), $pricing['group']['price'], array('class' => 'short wc_input_price'));
        self::number($n . '[group][included]', __('Persone incluse', 'next-tours'), $pricing['group']['included']);
        self::text($n . '[group][extra_price]', __('Prezzo per persona aggiuntiva', 'next-tours'), $pricing['group']['extra_price'], array('class' => 'short wc_input_price'));
        self::number($n . '[group][max_people]', __('Massimo persone', 'next-tours'), $pricing['group']['max_people'], array('description' => __('0 = nessun limite.', 'next-tours'), 'zero' => true));
        echo '</div>';

        // per_unit
        echo '<div class="options_group" data-next-tours-model-section="per_unit">';
        self::text($n . '[unit][label]', __('Nome dell’unità', 'next-tours'), $pricing['unit']['label'], array('placeholder' => __('Barca, Jeep, Camera…', 'next-tours')));
        self::text($n . '[unit][price]', __('Prezzo per unità', 'next-tours'), $pricing['unit']['price'], array('class' => 'short wc_input_price'));
        self::number($n . '[unit][capacity]', __('Persone per unità', 'next-tours'), $pricing['unit']['capacity'], array('description' => __('0 = nessun limite.', 'next-tours'), 'zero' => true));
        self::number($n . '[unit][max_units]', __('Massimo unità per prenotazione', 'next-tours'), $pricing['unit']['max_units'], array('description' => __('0 = nessun limite. I posti delle date si contano in unità.', 'next-tours'), 'zero' => true));
        echo '</div>';

        // quote
        echo '<div class="options_group" data-next-tours-model-section="quote">';
        echo '<p class="next-tours-help">' . esc_html__('Nessun prezzo mostrato: il cliente invia una richiesta, tu imposti il prezzo nell’ordine e lo confermi; il cliente riceve il link di pagamento.', 'next-tours') . '</p>';
        echo '</div>';

        // extras
        echo '<div class="options_group next-tours-section">';
        echo '<h4>' . esc_html__('Extra e supplementi', 'next-tours') . '</h4>';
        echo '<div class="next-tours-repeater" data-next-tours-repeater><table class="widefat striped next-tours-table"><thead><tr>';
        foreach (array(__('Codice', 'next-tours'), __('Etichetta', 'next-tours'), __('Prezzo', 'next-tours'), __('Calcolo', 'next-tours'), __('Obbligatorio', 'next-tours'), '') as $heading) {
            echo '<th>' . esc_html($heading) . '</th>';
        }
        echo '</tr></thead><tbody data-rows>';
        foreach ($pricing['extras'] as $i => $extra) {
            self::extra_row($n, (string) $i, $extra);
        }
        echo '</tbody></table><template data-template>';
        self::extra_row($n, '__i__', array('key' => '', 'label' => '', 'price' => '', 'per' => 'booking', 'required' => false));
        echo '</template>';
        echo '<p><button type="button" class="button" data-add>' . esc_html__('+ Aggiungi extra', 'next-tours') . '</button></p>';
        echo '<p class="next-tours-help">' . esc_html__('Es. transfer dall’hotel (per prenotazione), pranzo (per persona), supplemento singola (per giorno), assicurazione obbligatoria. Codice vuoto = generato dall’etichetta.', 'next-tours') . '</p>';
        echo '</div></div>';

        echo '</div>';
    }

    private static function person_type_row($n, $i, array $type) {
        $p = $n . '[person_types][' . $i . ']';
        echo '<tr data-row>';
        echo '<td><input type="text" class="next-tours-sm" name="' . esc_attr($p . '[key]') . '" value="' . esc_attr($type['key']) . '" placeholder="adult" /></td>';
        echo '<td><input type="text" name="' . esc_attr($p . '[label]') . '" value="' . esc_attr($type['label']) . '" /></td>';
        echo '<td><input type="text" class="next-tours-sm wc_input_price" name="' . esc_attr($p . '[price]') . '" value="' . esc_attr(wc_format_localized_price($type['price'])) . '" /></td>';
        foreach (array('min_age', 'max_age', 'min', 'max') as $field) {
            echo '<td><input type="number" min="0" class="next-tours-xs" name="' . esc_attr($p . '[' . $field . ']') . '" value="' . esc_attr($type[$field] ? $type[$field] : '') . '" /></td>';
        }
        echo '<td class="next-tours-center"><input type="checkbox" name="' . esc_attr($p . '[counts_capacity]') . '" value="1"' . checked($type['counts_capacity'], true, false) . ' /></td>';
        echo '<td><button type="button" class="button-link next-tours-remove" data-remove aria-label="' . esc_attr__('Rimuovi', 'next-tours') . '">&times;</button></td>';
        echo '</tr>';
    }

    private static function tier_row($n, $i, array $tier) {
        $p = $n . '[tiers][' . $i . ']';
        echo '<tr data-row>';
        echo '<td><input type="number" min="1" class="next-tours-xs" name="' . esc_attr($p . '[min]') . '" value="' . esc_attr($tier['min']) . '" /></td>';
        echo '<td><input type="number" min="0" class="next-tours-xs" name="' . esc_attr($p . '[max]') . '" value="' . esc_attr($tier['max'] ? $tier['max'] : '') . '" /></td>';
        echo '<td><input type="text" class="next-tours-sm wc_input_price" name="' . esc_attr($p . '[price]') . '" value="' . esc_attr(wc_format_localized_price($tier['price'])) . '" /></td>';
        echo '<td><button type="button" class="button-link next-tours-remove" data-remove aria-label="' . esc_attr__('Rimuovi', 'next-tours') . '">&times;</button></td>';
        echo '</tr>';
    }

    private static function extra_row($n, $i, array $extra) {
        $p = $n . '[extras][' . $i . ']';
        echo '<tr data-row>';
        echo '<td><input type="text" class="next-tours-sm" name="' . esc_attr($p . '[key]') . '" value="' . esc_attr($extra['key']) . '" /></td>';
        echo '<td><input type="text" name="' . esc_attr($p . '[label]') . '" value="' . esc_attr($extra['label']) . '" /></td>';
        echo '<td><input type="text" class="next-tours-sm wc_input_price" name="' . esc_attr($p . '[price]') . '" value="' . esc_attr(wc_format_localized_price($extra['price'])) . '" /></td>';
        echo '<td><select name="' . esc_attr($p . '[per]') . '">';
        foreach (Next_Tours::extra_per_options() as $value => $label) {
            echo '<option value="' . esc_attr($value) . '"' . selected($extra['per'], $value, false) . '>' . esc_html($label) . '</option>';
        }
        echo '</select></td>';
        echo '<td class="next-tours-center"><input type="checkbox" name="' . esc_attr($p . '[required]') . '" value="1"' . checked($extra['required'], true, false) . ' /></td>';
        echo '<td><button type="button" class="button-link next-tours-remove" data-remove aria-label="' . esc_attr__('Rimuovi', 'next-tours') . '">&times;</button></td>';
        echo '</tr>';
    }

    // -----------------------------------------------------------------------
    // Field helpers (WooCommerce "form-field" markup)
    // -----------------------------------------------------------------------

    private static function attrs(array $attrs) {
        $out = '';
        foreach ($attrs as $key => $value) {
            $out .= ' ' . esc_attr($key) . '="' . esc_attr($value) . '"';
        }
        return $out;
    }

    private static function field_id($name) {
        return trim(preg_replace('/[^a-z0-9]+/', '_', strtolower($name)), '_');
    }

    private static function open($name, $label, array $args) {
        $class = 'form-field ' . self::field_id($name) . '_field' . (!empty($args['wrapper_class']) ? ' ' . $args['wrapper_class'] : '');
        echo '<p class="' . esc_attr($class) . '"><label for="' . esc_attr(self::field_id($name)) . '">' . esc_html($label) . '</label>';
    }

    private static function close(array $args) {
        if (!empty($args['description'])) {
            echo '<span class="description">' . esc_html($args['description']) . '</span>';
        }
        echo '</p>';
    }

    private static function text($name, $label, $value, array $args = array()) {
        self::open($name, $label, $args);
        $class = isset($args['class']) ? $args['class'] : 'short';
        $display = strpos($class, 'wc_input_price') !== false ? wc_format_localized_price($value) : $value;
        echo '<input type="text" id="' . esc_attr(self::field_id($name)) . '" name="' . esc_attr($name) . '" value="' . esc_attr($display) . '" class="' . esc_attr($class) . '"'
            . (isset($args['placeholder']) ? ' placeholder="' . esc_attr($args['placeholder']) . '"' : '') . ' />';
        self::close($args);
    }

    private static function number($name, $label, $value, array $args = array()) {
        self::open($name, $label, $args);
        $shown = ($value || !empty($args['zero'])) ? $value : '';
        echo '<input type="number" min="0" step="1" id="' . esc_attr(self::field_id($name)) . '" name="' . esc_attr($name) . '" value="' . esc_attr($shown) . '" class="short" />';
        self::close($args);
    }

    private static function textarea($name, $label, $value, array $args = array()) {
        self::open($name, $label, $args);
        echo '<textarea id="' . esc_attr(self::field_id($name)) . '" name="' . esc_attr($name) . '" rows="' . esc_attr(isset($args['rows']) ? $args['rows'] : 3) . '" class="short"'
            . (isset($args['placeholder']) ? ' placeholder="' . esc_attr($args['placeholder']) . '"' : '') . '>' . esc_textarea($value) . '</textarea>';
        self::close($args);
    }

    private static function select($name, $label, $value, array $options, array $args = array()) {
        $extra = array();
        foreach ($args as $key => $attr) {
            if (strpos($key, 'data-') === 0) {
                $extra[$key] = $attr;
            }
        }
        self::open($name, $label, $args);
        echo '<select id="' . esc_attr(self::field_id($name)) . '" name="' . esc_attr($name) . '"' . self::attrs($extra) . '>';
        foreach ($options as $key => $option_label) {
            echo '<option value="' . esc_attr($key) . '"' . selected((string) $value, (string) $key, false) . '>' . esc_html($option_label) . '</option>';
        }
        echo '</select>';
        self::close($args);
    }

    private static function checkbox($name, $label, $checked, $description, array $extra = array()) {
        echo '<p class="form-field ' . esc_attr(self::field_id($name)) . '_field"><label for="' . esc_attr(self::field_id($name)) . '">' . esc_html($label) . '</label>';
        echo '<input type="checkbox" class="checkbox" id="' . esc_attr(self::field_id($name)) . '" name="' . esc_attr($name) . '" value="1"' . checked($checked, true, false) . self::attrs($extra) . ' /> ';
        echo '<span class="description">' . esc_html($description) . '</span></p>';
    }
}
