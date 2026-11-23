<?php
/**
 * Settings > Next i18n — one page for:
 *   - the list of storefront languages (add / disable / remove rows),
 *   - background auto-translation,
 *   - the DeepL API key.
 *
 * The API key field is write-only: it is always rendered empty, an empty
 * submit keeps the current key, a new key is verified against DeepL before
 * being stored (encrypted, in its own option, never in this settings array).
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_I18n_Settings {
    const OPTION = 'next_i18n_settings';
    const PAGE = 'next-i18n';

    private static $key_handled = false;

    public static function init() {
        add_action('admin_menu', array(__CLASS__, 'menu'));
        add_action('admin_init', array(__CLASS__, 'register'));
        add_action('admin_enqueue_scripts', array(__CLASS__, 'assets'));
    }

    public static function defaults() {
        return array(
            'languages'      => array(
                array('code' => 'es', 'label' => 'Español', 'deepl' => 'ES', 'enabled' => 1),
                array('code' => 'en', 'label' => 'English', 'deepl' => 'EN-GB', 'enabled' => 1),
            ),
            'auto_translate' => 0,
        );
    }

    public static function get($name = null) {
        $options = wp_parse_args((array) get_option(self::OPTION, array()), self::defaults());
        if ($name === null) {
            return $options;
        }
        return isset($options[$name]) ? $options[$name] : null;
    }

    /** All configured languages (enabled or not), each {code, label, deepl, enabled}. */
    public static function get_languages() {
        $languages = self::get('languages');
        return is_array($languages) ? $languages : array();
    }

    public static function menu() {
        add_options_page('Next i18n', 'Next i18n', 'manage_options', self::PAGE, array(__CLASS__, 'render'));
    }

    public static function register() {
        register_setting(self::PAGE, self::OPTION, array(
            'type'              => 'array',
            'sanitize_callback' => array(__CLASS__, 'sanitize'),
            'default'           => self::defaults(),
        ));
    }

    public static function assets($hook) {
        if ($hook !== 'settings_page_' . self::PAGE) {
            return;
        }
        wp_enqueue_style('next-i18n-admin', NEXT_I18N_URL . 'assets/admin.css', array(), NEXT_I18N_VERSION);
        wp_enqueue_script('next-i18n-settings', NEXT_I18N_URL . 'assets/settings.js', array(), NEXT_I18N_VERSION, true);
    }

    public static function sanitize($input) {
        $input = is_array($input) ? $input : array();

        $languages = array();
        $seen = array();
        $rows = isset($input['languages']) && is_array($input['languages']) ? $input['languages'] : array();
        foreach ($rows as $row) {
            if (!is_array($row)) {
                continue;
            }
            $code = Next_I18n::normalize_locale(isset($row['code']) ? $row['code'] : '');
            if ($code === '' || $code === Next_I18n::SOURCE_LOCALE || isset($seen[$code])) {
                continue;
            }
            $seen[$code] = true;

            $deepl = strtoupper(sanitize_text_field(isset($row['deepl']) ? $row['deepl'] : ''));
            if (!preg_match('/^[A-Z]{2}(-[A-Z0-9]{2,4})?$/', $deepl)) {
                $deepl = Next_I18n::guess_deepl_target($code);
            }
            $label = sanitize_text_field(isset($row['label']) ? $row['label'] : '');

            $languages[] = array(
                'code'    => $code,
                'label'   => $label !== '' ? $label : strtoupper($code),
                'deepl'   => $deepl,
                'enabled' => empty($row['enabled']) ? 0 : 1,
            );
        }

        // WordPress may run this callback twice on the first save: handle the key once.
        if (!self::$key_handled) {
            self::$key_handled = true;
            self::handle_api_key($input);
        }

        // The API key is deliberately NOT part of the returned settings.
        return array(
            'languages'      => $languages,
            'auto_translate' => empty($input['auto_translate']) ? 0 : 1,
        );
    }

    private static function handle_api_key(array $input) {
        if (in_array(Next_I18n_DeepL::key_source(), array('constant', 'env'), true)) {
            return; // Managed outside the database.
        }

        if (!empty($input['deepl_remove'])) {
            Next_I18n_DeepL::delete_key();
            add_settings_error(self::OPTION, 'deepl_removed', __('Chiave DeepL rimossa.', 'next-i18n'), 'updated');
            return;
        }

        $key = isset($input['deepl_api_key']) ? trim(sanitize_text_field($input['deepl_api_key'])) : '';
        if ($key === '') {
            return; // Empty field = keep the current key.
        }

        if (!Next_I18n_DeepL::is_valid_format($key)) {
            add_settings_error(self::OPTION, 'deepl_format', __('Chiave non salvata: il formato non sembra una chiave DeepL.', 'next-i18n'));
            return;
        }

        $usage = Next_I18n_DeepL::usage($key);
        if (is_wp_error($usage)) {
            add_settings_error(self::OPTION, 'deepl_invalid', sprintf(
                /* translators: %s: error message */
                __('Chiave non salvata: %s', 'next-i18n'),
                $usage->get_error_message()
            ));
            return;
        }

        Next_I18n_DeepL::store_key($key);
        delete_transient(Next_I18n_DeepL::TARGETS_CACHE);
        add_settings_error(self::OPTION, 'deepl_saved', __('Chiave DeepL verificata e salvata (cifrata).', 'next-i18n'), 'updated');
    }

    public static function render() {
        if (!current_user_can('manage_options')) {
            return;
        }
        $options = self::get();
        $name = self::OPTION;
        ?>
        <div class="wrap next-i18n-settings">
            <h1>Next i18n</h1>
            <?php settings_errors(self::OPTION); ?>
            <form method="post" action="options.php" autocomplete="off">
                <?php settings_fields(self::PAGE); ?>

                <h2><?php esc_html_e('Lingue', 'next-i18n'); ?></h2>
                <p>
                    <?php
                    printf(
                        /* translators: %s: source language code */
                        esc_html__('Lingua sorgente: %s. I contenuti WordPress/WooCommerce si scrivono in italiano; qui sotto le lingue in cui tradurli.', 'next-i18n'),
                        '<code>' . esc_html(Next_I18n::SOURCE_LOCALE) . '</code>'
                    );
                    ?>
                </p>
                <?php self::render_languages($options['languages']); ?>
                <p class="description">
                    <?php esc_html_e('Il codice deve coincidere con una lingua di i18n/routing.ts nella vetrina Next.js. Disattivare o rimuovere una lingua non cancella le traduzioni già salvate.', 'next-i18n'); ?>
                </p>

                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><?php esc_html_e('Traduzione automatica', 'next-i18n'); ?></th>
                        <td>
                            <label>
                                <input type="checkbox" name="<?php echo esc_attr($name); ?>[auto_translate]" value="1" <?php checked($options['auto_translate'], 1); ?>>
                                <?php esc_html_e('Quando salvi un contenuto pubblicato, traduci in background le lingue mancanti o non aggiornate.', 'next-i18n'); ?>
                            </label>
                            <p class="description"><?php esc_html_e('Le traduzioni modificate a mano o segnate come revisionate non vengono mai sovrascritte.', 'next-i18n'); ?></p>
                        </td>
                    </tr>
                </table>

                <h2>DeepL</h2>
                <table class="form-table" role="presentation">
                    <?php self::render_key_row(); ?>
                </table>

                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    private static function render_languages(array $languages) {
        $targets = Next_I18n_DeepL::target_languages();
        ?>
        <table class="widefat striped next-i18n-languages">
            <thead>
                <tr>
                    <th scope="col"><?php esc_html_e('Attiva', 'next-i18n'); ?></th>
                    <th scope="col"><?php esc_html_e('Codice', 'next-i18n'); ?></th>
                    <th scope="col"><?php esc_html_e('Nome', 'next-i18n'); ?></th>
                    <th scope="col"><?php esc_html_e('Lingua DeepL', 'next-i18n'); ?></th>
                    <th scope="col"><span class="screen-reader-text"><?php esc_html_e('Azioni', 'next-i18n'); ?></span></th>
                </tr>
            </thead>
            <tbody>
                <?php
                foreach (array_values($languages) as $index => $language) {
                    self::render_language_row((string) $index, $language, $targets);
                }
                ?>
            </tbody>
        </table>
        <template id="next-i18n-language-row">
            <?php self::render_language_row('__INDEX__', array('code' => '', 'label' => '', 'deepl' => '', 'enabled' => 1), $targets); ?>
        </template>
        <p><button type="button" class="button next-i18n-add-language">+ <?php esc_html_e('Aggiungi lingua', 'next-i18n'); ?></button></p>
        <?php
    }

    private static function render_language_row($index, array $language, array $targets) {
        $base = self::OPTION . '[languages][' . $index . ']';
        $deepl = isset($language['deepl']) ? $language['deepl'] : '';
        if ($deepl !== '' && !isset($targets[$deepl])) {
            $targets[$deepl] = $deepl; // keep a saved value even if DeepL's list is unavailable
        }
        ?>
        <tr>
            <td><input type="checkbox" name="<?php echo esc_attr($base); ?>[enabled]" value="1" <?php checked(!empty($language['enabled'])); ?>></td>
            <td><input type="text" class="small-text code" data-role="code" maxlength="5" placeholder="fr" pattern="[A-Za-z]{2}(-[A-Za-z]{2})?" name="<?php echo esc_attr($base); ?>[code]" value="<?php echo esc_attr($language['code']); ?>"></td>
            <td><input type="text" class="regular-text" placeholder="Français" name="<?php echo esc_attr($base); ?>[label]" value="<?php echo esc_attr($language['label']); ?>"></td>
            <td>
                <select data-role="deepl" name="<?php echo esc_attr($base); ?>[deepl]">
                    <option value=""><?php esc_html_e('— automatica dal codice —', 'next-i18n'); ?></option>
                    <?php foreach ($targets as $code => $label) : ?>
                        <option value="<?php echo esc_attr($code); ?>" <?php selected($deepl, $code); ?>><?php echo esc_html($label . ' (' . $code . ')'); ?></option>
                    <?php endforeach; ?>
                </select>
            </td>
            <td><button type="button" class="button-link button-link-delete next-i18n-remove-language"><?php esc_html_e('Rimuovi', 'next-i18n'); ?></button></td>
        </tr>
        <?php
    }

    private static function render_key_row() {
        $name = self::OPTION;
        $source = Next_I18n_DeepL::key_source();
        $key = Next_I18n_DeepL::get_key();
        ?>
        <tr>
            <th scope="row"><label for="next-i18n-deepl-key"><?php esc_html_e('Chiave API', 'next-i18n'); ?></label></th>
            <td>
                <?php if ($source === 'constant' || $source === 'env') : ?>
                    <p>
                        <?php
                        echo esc_html($source === 'constant'
                            ? __('Definita in wp-config.php (NEXT_I18N_DEEPL_API_KEY).', 'next-i18n')
                            : __('Definita nella variabile d\'ambiente NEXT_I18N_DEEPL_API_KEY.', 'next-i18n'));
                        ?>
                        <code><?php echo esc_html(Next_I18n_DeepL::mask($key)); ?></code>
                    </p>
                <?php else : ?>
                    <?php if ($source === 'option' && $key !== '') : ?>
                        <p><?php esc_html_e('Configurata:', 'next-i18n'); ?> <code><?php echo esc_html(Next_I18n_DeepL::mask($key)); ?></code></p>
                    <?php elseif ($source === 'option') : ?>
                        <p class="notice notice-warning inline"><?php esc_html_e('Non è possibile decifrare la chiave salvata (le chiavi di sicurezza di WordPress sono cambiate?). Inseriscila di nuovo.', 'next-i18n'); ?></p>
                    <?php endif; ?>
                    <input
                        id="next-i18n-deepl-key"
                        type="password"
                        class="regular-text"
                        name="<?php echo esc_attr($name); ?>[deepl_api_key]"
                        value=""
                        autocomplete="new-password"
                        spellcheck="false"
                        placeholder="<?php echo esc_attr($source === 'option' ? __('Lascia vuoto per mantenere la chiave attuale', 'next-i18n') : 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx'); ?>"
                    >
                    <p class="description">
                        <?php esc_html_e('La chiave viene verificata con DeepL, salvata cifrata nel database e non viene più mostrata né inviata al browser.', 'next-i18n'); ?><br>
                        <?php esc_html_e('In produzione è preferibile definirla in wp-config.php:', 'next-i18n'); ?>
                        <code>define('NEXT_I18N_DEEPL_API_KEY', '...');</code>
                    </p>
                    <?php if ($source === 'option') : ?>
                        <p><label><input type="checkbox" name="<?php echo esc_attr($name); ?>[deepl_remove]" value="1"> <?php esc_html_e('Rimuovi la chiave salvata', 'next-i18n'); ?></label></p>
                    <?php endif; ?>
                <?php endif; ?>
            </td>
        </tr>
        <?php if ($key !== '') : ?>
            <tr>
                <th scope="row"><?php esc_html_e('Utilizzo questo mese', 'next-i18n'); ?></th>
                <td><?php self::render_usage(); ?></td>
            </tr>
        <?php endif; ?>
        <?php
    }

    private static function render_usage() {
        $usage = Next_I18n_DeepL::usage();
        if (is_wp_error($usage)) {
            echo '<p class="notice notice-error inline">' . esc_html($usage->get_error_message()) . '</p>';
            return;
        }
        $count = isset($usage['character_count']) ? (int) $usage['character_count'] : 0;
        $limit = isset($usage['character_limit']) ? (int) $usage['character_limit'] : 0;
        $percent = $limit > 0 ? min(100, round($count / $limit * 100, 1)) : 0;
        printf(
            '<p><strong>%s</strong> / %s %s (%s%%)</p><progress max="100" value="%s" class="next-i18n-usage"></progress>',
            esc_html(number_format_i18n($count)),
            esc_html(number_format_i18n($limit)),
            esc_html__('caratteri', 'next-i18n'),
            esc_html($percent),
            esc_attr($percent)
        );
    }
}
