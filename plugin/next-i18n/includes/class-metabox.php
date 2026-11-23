<?php
/**
 * "Traduzioni" box on products, posts and pages, plus the AJAX endpoint
 * behind its "Traduci con DeepL" button.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_I18n_Metabox {
    const NONCE_SAVE = 'next_i18n_save';
    const NONCE_AJAX = 'next_i18n_translate';

    public static function init() {
        add_action('add_meta_boxes', array(__CLASS__, 'add'));
        // Priority 5: save translations before the Next.js revalidation webhook (priority 10) fires.
        add_action('save_post', array(__CLASS__, 'save'), 5, 2);
        add_action('admin_enqueue_scripts', array(__CLASS__, 'assets'));
        add_action('wp_ajax_next_i18n_translate', array(__CLASS__, 'ajax_translate'));
    }

    public static function add() {
        foreach (Next_I18n::post_types() as $post_type) {
            // 'high': right below the main editor, above WooCommerce's "Product data"
            add_meta_box('next-i18n', __('Traduzioni', 'next-i18n'), array(__CLASS__, 'render'), $post_type, 'normal', 'high');
        }
    }

    public static function assets($hook) {
        if (!in_array($hook, array('post.php', 'post-new.php'), true)) {
            return;
        }
        $screen = get_current_screen();
        if (!$screen || !in_array($screen->post_type, Next_I18n::post_types(), true)) {
            return;
        }
        wp_enqueue_style('next-i18n-admin', NEXT_I18N_URL . 'assets/admin.css', array(), NEXT_I18N_VERSION);
        wp_enqueue_script('next-i18n-admin', NEXT_I18N_URL . 'assets/admin.js', array(), NEXT_I18N_VERSION, true);
        wp_localize_script('next-i18n-admin', 'NextI18n', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce(self::NONCE_AJAX),
            'i18n'    => array(
                'working'   => __('Traduzione in corso…', 'next-i18n'),
                'done'      => __('Tradotto. Controlla il testo e salva il contenuto.', 'next-i18n'),
                'error'     => __('Traduzione non riuscita.', 'next-i18n'),
                'overwrite' => __('Sostituire il testo già presente in questa lingua con la traduzione DeepL?', 'next-i18n'),
            ),
        ));
    }

    public static function render($post) {
        wp_nonce_field(self::NONCE_SAVE, 'next_i18n_nonce');

        $translations = Next_I18n::get_translations($post->ID);
        $has_key = Next_I18n_DeepL::get_key() !== '';
        $is_new = $post->post_status === 'auto-draft';
        $locales = Next_I18n::target_locales();
        $is_product = $post->post_type === 'product';

        echo '<div class="next-i18n">';

        if (!$has_key) {
            echo '<p class="next-i18n-note">';
            esc_html_e('Traduzione automatica non disponibile: chiave DeepL non configurata.', 'next-i18n');
            if (current_user_can('manage_options')) {
                echo ' <a href="' . esc_url(admin_url('options-general.php?page=' . Next_I18n_Settings::PAGE)) . '">' . esc_html__('Impostazioni', 'next-i18n') . '</a>';
            }
            echo '</p>';
        } elseif ($is_new) {
            echo '<p class="next-i18n-note">' . esc_html__('Salva una bozza per poter usare la traduzione automatica.', 'next-i18n') . '</p>';
        } else {
            echo '<p class="next-i18n-note">' . esc_html__('DeepL traduce il testo italiano salvato: salva prima le modifiche all\'italiano.', 'next-i18n') . '</p>';
        }

        foreach ($locales as $index => $locale) {
            $entry = isset($translations[$locale]) && is_array($translations[$locale]) ? $translations[$locale] : array();
            $value = function ($field) use ($entry) {
                return isset($entry[$field]) ? (string) $entry[$field] : '';
            };
            $field_name = function ($field) use ($locale) {
                return 'next_i18n[' . $locale . '][' . $field . ']';
            };
            $field_id = function ($field) use ($locale) {
                return 'next-i18n-' . $locale . '-' . $field;
            };

            if ($value('title') === '' && $value('content') === '') {
                $badge = array('missing', __('Mancante', 'next-i18n'));
            } elseif (Next_I18n::is_stale($entry, $post)) {
                $badge = array('stale', __('Da aggiornare: l\'italiano è cambiato', 'next-i18n'));
            } elseif (!empty($entry['reviewed'])) {
                $badge = array('reviewed', __('Revisionata', 'next-i18n'));
            } elseif ($value('translated_by') === 'deepl') {
                $badge = array('auto', __('Automatica', 'next-i18n'));
            } else {
                $badge = array('manual', __('Manuale', 'next-i18n'));
            }
            ?>
            <details class="next-i18n-locale" data-locale="<?php echo esc_attr($locale); ?>" <?php echo $index === 0 ? 'open' : ''; ?>>
                <summary>
                    <strong><?php echo esc_html(strtoupper($locale)); ?></strong>
                    <span class="next-i18n-badge is-<?php echo esc_attr($badge[0]); ?>"><?php echo esc_html($badge[1]); ?></span>
                </summary>

                <div class="next-i18n-actions">
                    <button type="button" class="button next-i18n-translate"
                        data-locale="<?php echo esc_attr($locale); ?>"
                        data-post="<?php echo esc_attr($post->ID); ?>"
                        <?php disabled(!$has_key || $is_new); ?>>
                        <?php esc_html_e('Traduci con DeepL', 'next-i18n'); ?>
                    </button>
                    <span class="next-i18n-status" aria-live="polite"></span>
                </div>

                <p>
                    <label for="<?php echo esc_attr($field_id('title')); ?>"><?php esc_html_e('Titolo', 'next-i18n'); ?></label>
                    <input type="text" class="widefat" data-field="title"
                        id="<?php echo esc_attr($field_id('title')); ?>"
                        name="<?php echo esc_attr($field_name('title')); ?>"
                        value="<?php echo esc_attr($value('title')); ?>">
                </p>
                <p>
                    <label for="<?php echo esc_attr($field_id('slug')); ?>"><?php esc_html_e('Slug (URL)', 'next-i18n'); ?></label>
                    <input type="text" class="widefat code" data-field="slug"
                        id="<?php echo esc_attr($field_id('slug')); ?>"
                        name="<?php echo esc_attr($field_name('slug')); ?>"
                        value="<?php echo esc_attr($value('slug')); ?>">
                </p>
                <p>
                    <label for="<?php echo esc_attr($field_id('excerpt')); ?>"><?php echo esc_html($is_product ? __('Descrizione breve', 'next-i18n') : __('Riassunto', 'next-i18n')); ?></label>
                    <textarea class="widefat" rows="3" data-field="excerpt"
                        id="<?php echo esc_attr($field_id('excerpt')); ?>"
                        name="<?php echo esc_attr($field_name('excerpt')); ?>"><?php echo esc_textarea($value('excerpt')); ?></textarea>
                </p>
                <p>
                    <label for="<?php echo esc_attr($field_id('content')); ?>"><?php echo esc_html($is_product ? __('Descrizione (HTML)', 'next-i18n') : __('Contenuto (HTML)', 'next-i18n')); ?></label>
                    <textarea class="widefat code" rows="10" data-field="content"
                        id="<?php echo esc_attr($field_id('content')); ?>"
                        name="<?php echo esc_attr($field_name('content')); ?>"><?php echo esc_textarea($value('content')); ?></textarea>
                </p>
                <p>
                    <label>
                        <input type="checkbox" value="1" data-field="reviewed"
                            name="<?php echo esc_attr($field_name('reviewed')); ?>"
                            <?php checked(!empty($entry['reviewed'])); ?>>
                        <?php esc_html_e('Revisionata: la traduzione automatica non la sovrascrive', 'next-i18n'); ?>
                    </label>
                </p>

                <input type="hidden" class="next-i18n-by" name="<?php echo esc_attr($field_name('translated_by')); ?>" value="">
                <?php /* Detects background auto-translations made while this form was open. */ ?>
                <input type="hidden" name="<?php echo esc_attr($field_name('rev')); ?>" value="<?php echo esc_attr(isset($entry['updated_at']) ? (int) $entry['updated_at'] : 0); ?>">
            </details>
            <?php
        }

        echo '</div>';
    }

    public static function save($post_id, $post) {
        if (!isset($_POST['next_i18n_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['next_i18n_nonce'])), self::NONCE_SAVE)) {
            return;
        }
        if ((defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) || wp_is_post_revision($post_id)) {
            return;
        }
        if (!current_user_can('edit_post', $post_id) || !in_array($post->post_type, Next_I18n::post_types(), true)) {
            return;
        }

        $input = isset($_POST['next_i18n']) && is_array($_POST['next_i18n']) ? wp_unslash($_POST['next_i18n']) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput -- sanitized per field below
        $stored = Next_I18n::get_translations($post_id);
        $hash = Next_I18n::source_hash($post);

        foreach (Next_I18n::target_locales() as $locale) {
            $in = isset($input[$locale]) && is_array($input[$locale]) ? $input[$locale] : null;
            if ($in === null) {
                continue;
            }
            $old = isset($stored[$locale]) && is_array($stored[$locale]) ? $stored[$locale] : array();

            // A background auto-translation landed after this form was loaded: keep it.
            $rev = isset($in['rev']) ? (int) $in['rev'] : 0;
            if (!empty($old['updated_at']) && $rev < (int) $old['updated_at']) {
                continue;
            }

            $text = function ($key) use ($in) {
                // Browsers submit textarea newlines as CRLF; normalise to avoid false "changed".
                return isset($in[$key]) ? str_replace("\r\n", "\n", (string) $in[$key]) : '';
            };
            $new = array(
                'title'   => sanitize_text_field($text('title')),
                'slug'    => sanitize_title($text('slug')),
                'excerpt' => wp_kses_post($text('excerpt')),
                'content' => wp_kses_post($text('content')),
            );

            $changed = false;
            foreach (Next_I18n::FIELDS as $field) {
                if ((isset($old[$field]) ? (string) $old[$field] : '') !== $new[$field]) {
                    $changed = true;
                    break;
                }
            }

            $entry = array_merge($old, $new);
            $entry['reviewed'] = !empty($in['reviewed']);
            if ($changed) {
                $entry['source_hash'] = $hash;
                $entry['translated_by'] = (isset($in['translated_by']) && $in['translated_by'] === 'deepl') ? 'deepl' : 'manual';
                $entry['updated_at'] = time();
            }

            Next_I18n::save_locale($post_id, $locale, $entry);
        }
    }

    public static function ajax_translate() {
        check_ajax_referer(self::NONCE_AJAX, 'nonce');

        $post_id = isset($_POST['post_id']) ? absint($_POST['post_id']) : 0;
        $locale = isset($_POST['locale']) ? Next_I18n::normalize_locale(sanitize_text_field(wp_unslash($_POST['locale']))) : '';

        if (!$post_id || !current_user_can('edit_post', $post_id)) {
            wp_send_json_error(array('message' => __('Permesso negato.', 'next-i18n')), 403);
        }
        if (!in_array($locale, Next_I18n::target_locales(), true)) {
            wp_send_json_error(array('message' => __('Lingua non configurata.', 'next-i18n')), 400);
        }

        $result = Next_I18n::translate_post($post_id, $locale);
        if (is_wp_error($result)) {
            wp_send_json_error(array('message' => $result->get_error_message()), 502);
        }
        wp_send_json_success($result);
    }
}
