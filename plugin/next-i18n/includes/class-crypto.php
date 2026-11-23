<?php
/**
 * Encrypts secrets at rest (the DeepL API key) with libsodium.
 *
 * The encryption key is derived from the site's AUTH_KEY/AUTH_SALT in
 * wp-config.php, so a database dump alone does not reveal the secret.
 * If those salts are rotated, the stored secret can no longer be decrypted
 * and must be entered again.
 *
 * Uses sodium, which ships with PHP 7.2+ and is polyfilled by WordPress core.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_I18n_Crypto {
    const PREFIX = 'v1:';

    private static function key() {
        return sodium_crypto_generichash(
            wp_salt('auth') . '|next-i18n',
            '',
            SODIUM_CRYPTO_SECRETBOX_KEYBYTES
        );
    }

    public static function encrypt($plain) {
        $nonce = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = sodium_crypto_secretbox((string) $plain, $nonce, self::key());
        return self::PREFIX . base64_encode($nonce . $cipher);
    }

    /** Returns '' when the value is missing, tampered with, or the salts changed. */
    public static function decrypt($stored) {
        if (!is_string($stored) || strpos($stored, self::PREFIX) !== 0) {
            return '';
        }
        $raw = base64_decode(substr($stored, strlen(self::PREFIX)), true);
        if ($raw === false || strlen($raw) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) {
            return '';
        }
        $nonce = substr($raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        $cipher = substr($raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES);
        try {
            $plain = sodium_crypto_secretbox_open($cipher, $nonce, self::key());
        } catch (Exception $e) {
            return '';
        }
        return $plain === false ? '' : $plain;
    }
}
