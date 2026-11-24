<?php
/**
 * Plugin Name: Next FAQ
 * Description: Domande frequenti per la vetrina Next.js: due elenchi (home page e pagine prodotto) gestiti dalla bacheca, ordinabili e traducibili con Next i18n.
 * Version: 0.1.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: AlkyePaul
 * License: MIT
 * Text Domain: next-faq
 */

if (!defined('ABSPATH')) {
    exit;
}

define('NEXT_FAQ_VERSION', '0.1.0');

/*
 * Modello
 *
 *   Ogni FAQ è un post `next_faq`: titolo = domanda, contenuto = risposta,
 *   "Ordine" (attributi pagina) = posizione nell'elenco.
 *   Gli elenchi sono i termini della tassonomia `next_faq_list`:
 *     home     -> home page
 *     product  -> tutte le pagine prodotto
 *   Una FAQ può stare in entrambi gli elenchi.
 *
 * REST (pubblico, solo FAQ pubblicate):
 *   GET /wp-json/next-faq/v1/faqs?list=home|product
 *   -> [ { id, question, answer, order, i18n: { es: { question, answer } } } ]
 *
 * Traduzioni: se Next i18n è attivo, il box "Traduzioni" compare anche sulle FAQ
 * (titolo = domanda, contenuto = risposta). La rivalidazione della vetrina arriva
 * da Next.js Revalidation (contentType `next_faq` / `next_faq_list`).
 */
class Next_FAQ {
    const POST_TYPE = 'next_faq';
    const TAXONOMY  = 'next_faq_list';
    const REST_NS   = 'next-faq/v1';

    /** Elenchi fissi: slug => etichetta. */
    public static function lists() {
        return array(
            'home'    => __('Home page', 'next-faq'),
            'product' => __('Pagine prodotto', 'next-faq'),
        );
    }

    public static function init() {
        add_action('init', array(__CLASS__, 'register'));
        add_action('init', array(__CLASS__, 'ensure_lists'), 20);
        add_action('rest_api_init', array(__CLASS__, 'register_rest'));
        add_filter('wp_insert_post_data', array(__CLASS__, 'explicit_paragraphs'), 10, 2);

        // Box traduzioni di Next i18n anche sulle FAQ
        add_filter('next_i18n_post_types', array(__CLASS__, 'add_i18n_post_type'));

        // Admin
        add_filter('manage_' . self::POST_TYPE . '_posts_columns', array(__CLASS__, 'columns'));
        add_action('manage_' . self::POST_TYPE . '_posts_custom_column', array(__CLASS__, 'column'), 10, 2);
        add_filter('manage_edit-' . self::POST_TYPE . '_sortable_columns', array(__CLASS__, 'sortable_columns'));
        add_action('restrict_manage_posts', array(__CLASS__, 'list_filter'));
        add_action('pre_get_posts', array(__CLASS__, 'admin_order'));
        add_filter('enter_title_here', array(__CLASS__, 'title_placeholder'), 10, 2);
        add_action('admin_head', array(__CLASS__, 'admin_css'));
    }

    public static function register() {
        register_post_type(self::POST_TYPE, array(
            'labels' => array(
                'name'               => __('FAQ', 'next-faq'),
                'singular_name'      => __('FAQ', 'next-faq'),
                'menu_name'          => __('FAQ', 'next-faq'),
                'add_new'            => __('Aggiungi FAQ', 'next-faq'),
                'add_new_item'       => __('Nuova FAQ', 'next-faq'),
                'edit_item'          => __('Modifica FAQ', 'next-faq'),
                'new_item'           => __('Nuova FAQ', 'next-faq'),
                'view_item'          => __('Vedi FAQ', 'next-faq'),
                'search_items'       => __('Cerca FAQ', 'next-faq'),
                'not_found'          => __('Nessuna FAQ', 'next-faq'),
                'not_found_in_trash' => __('Nessuna FAQ nel cestino', 'next-faq'),
                'all_items'          => __('Tutte le FAQ', 'next-faq'),
            ),
            'public'              => false,
            'show_ui'             => true,
            'show_in_menu'        => true,
            'show_in_rest'        => false, // la vetrina usa /next-faq/v1/faqs (e niente editor a blocchi)
            'menu_position'       => 25,
            'menu_icon'           => 'dashicons-editor-help',
            'supports'            => array('title', 'editor', 'page-attributes', 'revisions'),
            'hierarchical'        => false,
            'has_archive'         => false,
            'rewrite'             => false,
            'query_var'           => false,
            'exclude_from_search' => true,
            'capability_type'     => 'page',
            'map_meta_cap'        => true,
        ));

        register_taxonomy(self::TAXONOMY, self::POST_TYPE, array(
            'labels' => array(
                'name'          => __('Elenchi FAQ', 'next-faq'),
                'singular_name' => __('Elenco FAQ', 'next-faq'),
                'menu_name'     => __('Elenchi', 'next-faq'),
            ),
            'public'            => false,
            'show_ui'           => true,
            'show_in_menu'      => false, // elenchi fissi: niente pagina di gestione
            'show_admin_column' => false, // colonna personalizzata, vedi column()
            'show_in_rest'      => false,
            'hierarchical'      => true,  // caselle di spunta nell'editor
            'rewrite'           => false,
            'capabilities'      => array(
                'manage_terms' => 'manage_options',
                'edit_terms'   => 'manage_options',
                'delete_terms' => 'manage_options',
                'assign_terms' => 'edit_pages',
            ),
        ));
    }

    /** Crea gli elenchi fissi se mancano (anche dopo un'attivazione senza init). */
    public static function ensure_lists() {
        if (get_option('next_faq_lists_version') === NEXT_FAQ_VERSION) {
            return;
        }
        foreach (self::lists() as $slug => $label) {
            if (!term_exists($slug, self::TAXONOMY)) {
                wp_insert_term($label, self::TAXONOMY, array('slug' => $slug));
            }
        }
        update_option('next_faq_lists_version', NEXT_FAQ_VERSION, false);
    }

    /**
     * Risposta salvata con <p> espliciti: DeepL (tag_handling html) ignora gli a capo,
     * quindi senza questi le traduzioni di Next i18n unirebbero i paragrafi.
     */
    public static function explicit_paragraphs($data, $postarr) {
        if ($data['post_type'] !== self::POST_TYPE || trim($data['post_content']) === '') {
            return $data;
        }
        $content = wp_unslash($data['post_content']);
        if (!preg_match('/<p[\s>]/i', $content)) {
            $data['post_content'] = wp_slash(trim(wpautop($content)));
        }
        return $data;
    }

    public static function add_i18n_post_type($types) {
        $types[] = self::POST_TYPE;
        return array_values(array_unique($types));
    }

    // ---------------------------------------------------------------------
    // REST
    // ---------------------------------------------------------------------

    public static function register_rest() {
        register_rest_route(self::REST_NS, '/faqs', array(
            'methods'             => 'GET',
            'permission_callback' => '__return_true',
            'callback'            => array(__CLASS__, 'rest_faqs'),
            'args'                => array(
                'list' => array(
                    'required'          => true,
                    'validate_callback' => function ($value) {
                        return array_key_exists($value, Next_FAQ::lists());
                    },
                ),
            ),
        ));
    }

    public static function rest_faqs(WP_REST_Request $request) {
        $posts = get_posts(array(
            'post_type'        => self::POST_TYPE,
            'post_status'      => 'publish',
            'posts_per_page'   => 100,
            'orderby'          => array('menu_order' => 'ASC', 'date' => 'ASC'),
            'no_found_rows'    => true,
            'suppress_filters' => false,
            'tax_query'        => array(array(
                'taxonomy' => self::TAXONOMY,
                'field'    => 'slug',
                'terms'    => $request['list'],
            )),
        ));

        $out = array();
        foreach ($posts as $post) {
            $out[] = array(
                'id'       => $post->ID,
                'question' => html_entity_decode(get_the_title($post), ENT_QUOTES, 'UTF-8'),
                'answer'   => self::format_answer($post->post_content),
                'order'    => (int) $post->menu_order,
                'i18n'     => (object) self::translations($post->ID),
            );
        }

        return rest_ensure_response($out);
    }

    /** Traduzioni da Next i18n: { es: { question, answer } }, solo le lingue compilate. */
    private static function translations($post_id) {
        if (!class_exists('Next_I18n') || !method_exists('Next_I18n', 'get_translations')) {
            return array();
        }

        $out = array();
        $all = Next_I18n::get_translations($post_id);
        $locales = method_exists('Next_I18n', 'target_locales') ? Next_I18n::target_locales() : array_keys((array) $all);
        foreach ($locales as $locale) {
            if (empty($all[$locale]) || !is_array($all[$locale])) {
                continue;
            }
            $entry    = $all[$locale];
            $question = isset($entry['title']) ? trim((string) $entry['title']) : '';
            $answer   = isset($entry['content']) ? trim((string) $entry['content']) : '';
            if ($question === '' && $answer === '') {
                continue;
            }
            $out[$locale] = array(
                'question' => $question,
                'answer'   => $answer === '' ? '' : self::format_answer($answer),
            );
        }
        return $out;
    }

    /** Paragrafi automatici + HTML ammesso nei post (link, elenchi, grassetto…). */
    private static function format_answer($content) {
        $content = trim((string) $content);
        if ($content === '') {
            return '';
        }
        return trim(wp_kses_post(wpautop(do_shortcode($content))));
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    public static function title_placeholder($text, $post) {
        return $post->post_type === self::POST_TYPE ? __('Domanda', 'next-faq') : $text;
    }

    public static function columns($columns) {
        $out = array();
        foreach ($columns as $key => $label) {
            $out[$key] = $label;
            if ($key === 'title') {
                $out['next_faq_lists'] = __('Elenchi', 'next-faq');
                $out['next_faq_order'] = __('Ordine', 'next-faq');
            }
        }
        return $out;
    }

    public static function column($column, $post_id) {
        if ($column === 'next_faq_order') {
            echo (int) get_post_field('menu_order', $post_id);
            return;
        }
        if ($column !== 'next_faq_lists') {
            return;
        }
        $terms = get_the_terms($post_id, self::TAXONOMY);
        if (empty($terms) || is_wp_error($terms)) {
            echo '<span class="next-faq-none">' . esc_html__('Nessuno (non visibile)', 'next-faq') . '</span>';
            return;
        }
        $links = array();
        foreach ($terms as $term) {
            $url = add_query_arg(array('post_type' => self::POST_TYPE, self::TAXONOMY => $term->slug), admin_url('edit.php'));
            $links[] = '<a href="' . esc_url($url) . '">' . esc_html($term->name) . '</a>';
        }
        echo implode(', ', $links); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- già escapato sopra.
    }

    public static function sortable_columns($columns) {
        $columns['next_faq_order'] = 'menu_order';
        return $columns;
    }

    public static function list_filter($post_type) {
        if ($post_type !== self::POST_TYPE) {
            return;
        }
        // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- filtro di sola lettura.
        $current = isset($_GET[self::TAXONOMY]) ? sanitize_key(wp_unslash($_GET[self::TAXONOMY])) : '';
        echo '<select name="' . esc_attr(self::TAXONOMY) . '">';
        echo '<option value="">' . esc_html__('Tutti gli elenchi', 'next-faq') . '</option>';
        foreach (self::lists() as $slug => $label) {
            printf('<option value="%s" %s>%s</option>', esc_attr($slug), selected($current, $slug, false), esc_html($label));
        }
        echo '</select>';
    }

    /** Elenco in bacheca nello stesso ordine della vetrina. */
    public static function admin_order($query) {
        if (!is_admin() || !$query->is_main_query() || $query->get('post_type') !== self::POST_TYPE) {
            return;
        }
        if (!$query->get('orderby')) {
            $query->set('orderby', array('menu_order' => 'ASC', 'date' => 'ASC'));
        }
    }

    public static function admin_css() {
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if (!$screen || $screen->post_type !== self::POST_TYPE) {
            return;
        }
        ?>
        <style>
            .column-next_faq_order { width: 70px; }
            .column-next_faq_lists { width: 200px; }
            .next-faq-none { color: #b32d2e; }
            /* Box Traduzioni di Next i18n: per una FAQ servono solo domanda e risposta */
            #next-i18n p:has([data-field="slug"]),
            #next-i18n p:has([data-field="excerpt"]) { display: none; }
            /* Box elenchi: niente "Aggiungi nuovo elenco" né scheda "Più usati" */
            #<?php echo esc_attr(self::TAXONOMY); ?>-adder,
            #<?php echo esc_attr(self::TAXONOMY); ?>-tabs { display: none; }
        </style>
        <?php
    }
}

Next_FAQ::init();

register_activation_hook(__FILE__, function () {
    Next_FAQ::register();
    delete_option('next_faq_lists_version');
    Next_FAQ::ensure_lists();
});
