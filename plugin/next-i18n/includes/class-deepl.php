<?php
/**
 * Minimal DeepL API client.
 *
 * Key lookup order (first match wins):
 *   1. constant NEXT_I18N_DEEPL_API_KEY in wp-config.php  (recommended in production)
 *   2. environment variable NEXT_I18N_DEEPL_API_KEY
 *   3. encrypted option saved from Settings > Next i18n
 *
 * The key is only ever used server-side: it is never printed in admin pages,
 * sent to the browser or written to logs.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_I18n_DeepL {
    const OPTION = 'next_i18n_deepl_key';
    const ENV = 'NEXT_I18N_DEEPL_API_KEY';
    const TARGETS_CACHE = 'next_i18n_deepl_targets';

    /** Used when there is no key yet or DeepL can't be reached. */
    const FALLBACK_TARGETS = array(
        'BG' => 'Bulgarian', 'CS' => 'Czech', 'DA' => 'Danish', 'DE' => 'German',
        'EL' => 'Greek', 'EN-GB' => 'English (British)', 'EN-US' => 'English (American)',
        'ES' => 'Spanish', 'ET' => 'Estonian', 'FI' => 'Finnish', 'FR' => 'French',
        'HU' => 'Hungarian', 'ID' => 'Indonesian', 'JA' => 'Japanese', 'KO' => 'Korean',
        'LT' => 'Lithuanian', 'LV' => 'Latvian', 'NB' => 'Norwegian (Bokmål)', 'NL' => 'Dutch',
        'PL' => 'Polish', 'PT-BR' => 'Portuguese (Brazilian)', 'PT-PT' => 'Portuguese (European)',
        'RO' => 'Romanian', 'RU' => 'Russian', 'SK' => 'Slovak', 'SL' => 'Slovenian',
        'SV' => 'Swedish', 'TR' => 'Turkish', 'UK' => 'Ukrainian',
        'ZH-HANS' => 'Chinese (simplified)', 'ZH-HANT' => 'Chinese (traditional)',
    );

    /** 'constant' | 'env' | 'option' | '' */
    public static function key_source() {
        if (defined(self::ENV) && constant(self::ENV)) {
            return 'constant';
        }
        if (getenv(self::ENV)) {
            return 'env';
        }
        if (get_option(self::OPTION)) {
            return 'option';
        }
        return '';
    }

    public static function get_key() {
        switch (self::key_source()) {
            case 'constant':
                return trim((string) constant(self::ENV));
            case 'env':
                return trim((string) getenv(self::ENV));
            case 'option':
                return Next_I18n_Crypto::decrypt(get_option(self::OPTION));
        }
        return '';
    }

    public static function store_key($key) {
        // autoload = false: the encrypted value is not loaded on every request
        update_option(self::OPTION, Next_I18n_Crypto::encrypt($key), false);
    }

    public static function delete_key() {
        delete_option(self::OPTION);
    }

    public static function is_valid_format($key) {
        return (bool) preg_match('/^[A-Za-z0-9-]{20,}(:fx)?$/', $key);
    }

    public static function is_free_key($key) {
        return substr($key, -3) === ':fx';
    }

    /** "••••1a2b:fx": enough to recognise the key, useless to anyone else. */
    public static function mask($key) {
        $core = self::is_free_key($key) ? substr($key, 0, -3) : $key;
        return '••••' . substr($core, -4) . (self::is_free_key($key) ? ':fx' : '');
    }

    /**
     * Target languages DeepL currently supports, as [code => name].
     * Fetched from the API (cached for a week) so new DeepL languages show up
     * in the settings without a plugin update.
     */
    public static function target_languages() {
        $cached = get_transient(self::TARGETS_CACHE);
        if (is_array($cached) && $cached) {
            return $cached;
        }
        if (self::get_key() === '') {
            return self::FALLBACK_TARGETS;
        }

        $response = self::request('GET', '/v2/languages?type=target');
        if (is_wp_error($response) || !is_array($response)) {
            return self::FALLBACK_TARGETS;
        }

        $targets = array();
        foreach ($response as $language) {
            if (isset($language['language'], $language['name'])) {
                $targets[strtoupper($language['language'])] = sanitize_text_field($language['name']);
            }
        }
        if (!$targets) {
            return self::FALLBACK_TARGETS;
        }
        ksort($targets);
        set_transient(self::TARGETS_CACHE, $targets, WEEK_IN_SECONDS);
        return $targets;
    }

    /** Character usage for the current billing period. */
    public static function usage($key = null) {
        return self::request('GET', '/v2/usage', null, $key);
    }

    /**
     * Translate a keyed list of Italian strings (HTML allowed).
     * Empty strings are skipped and returned empty, so they cost no quota.
     *
     * @return array|WP_Error same keys as $texts
     */
    public static function translate(array $texts, $target_lang) {
        $keys = array();
        $payload = array();
        foreach ($texts as $name => $text) {
            if (is_string($text) && trim($text) !== '') {
                $keys[] = $name;
                $payload[] = $text;
            }
        }

        $out = array_fill_keys(array_keys($texts), '');
        if (empty($payload)) {
            return $out;
        }

        $response = self::request('POST', '/v2/translate', array(
            'text'         => $payload,
            'source_lang'  => strtoupper(Next_I18n::SOURCE_LOCALE),
            'target_lang'  => $target_lang,
            'tag_handling' => 'html',
        ));
        if (is_wp_error($response)) {
            return $response;
        }

        $translations = isset($response['translations']) && is_array($response['translations'])
            ? $response['translations']
            : array();
        foreach ($translations as $i => $translation) {
            if (isset($keys[$i])) {
                $out[$keys[$i]] = isset($translation['text']) ? (string) $translation['text'] : '';
            }
        }
        return $out;
    }

    private static function request($method, $path, $body = null, $key = null) {
        $key = $key !== null ? $key : self::get_key();
        if ($key === '') {
            return new WP_Error('next_i18n_no_key', __('Chiave API DeepL non configurata.', 'next-i18n'));
        }

        $base = self::is_free_key($key) ? 'https://api-free.deepl.com' : 'https://api.deepl.com';
        $args = array(
            'method'  => $method,
            'timeout' => 45,
            'headers' => array(
                'Authorization' => 'DeepL-Auth-Key ' . $key,
                'Content-Type'  => 'application/json',
                'User-Agent'    => 'next-i18n/' . NEXT_I18N_VERSION,
            ),
        );
        if ($body !== null) {
            $args['body'] = wp_json_encode($body);
        }

        $response = wp_remote_request($base . $path, $args);
        if (is_wp_error($response)) {
            return new WP_Error('next_i18n_http', sprintf(
                /* translators: %s: transport error */
                __('Impossibile contattare DeepL: %s', 'next-i18n'),
                $response->get_error_message()
            ));
        }

        $code = (int) wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);
        if ($code >= 200 && $code < 300) {
            return is_array($data) ? $data : array();
        }

        $known = array(
            403 => __('Chiave API DeepL non valida o non autorizzata.', 'next-i18n'),
            429 => __('Troppe richieste a DeepL, riprova tra qualche secondo.', 'next-i18n'),
            456 => __('Quota mensile di caratteri DeepL esaurita.', 'next-i18n'),
        );
        $message = isset($known[$code])
            ? $known[$code]
            : sprintf(
                /* translators: 1: HTTP status, 2: DeepL message */
                __('Errore DeepL (HTTP %1$d) %2$s', 'next-i18n'),
                $code,
                isset($data['message']) ? sanitize_text_field($data['message']) : ''
            );
        return new WP_Error('next_i18n_deepl_' . $code, trim($message), array('status' => $code));
    }
}
