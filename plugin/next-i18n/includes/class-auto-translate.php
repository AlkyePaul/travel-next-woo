<?php
/**
 * Background auto-translation on save (opt-in from the settings page).
 *
 * After a published product/post is saved, a one-off WP-Cron event translates
 * the locales that are missing, or outdated AND previously machine-translated.
 * Translations edited by hand or marked "reviewed" are never overwritten.
 */

if (!defined('ABSPATH')) {
    exit;
}

class Next_I18n_Auto_Translate {
    const HOOK = 'next_i18n_auto_translate';
    const ERROR_META = '_next_i18n_last_error';

    public static function init() {
        // Priority 20: after the metabox has saved the submitted translations (priority 5).
        add_action('save_post', array(__CLASS__, 'maybe_schedule'), 20, 2);
        add_action(self::HOOK, array(__CLASS__, 'run'));
    }

    public static function maybe_schedule($post_id, $post) {
        if (!Next_I18n_Settings::get('auto_translate')) {
            return;
        }
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }
        if ($post->post_status !== 'publish' || !in_array($post->post_type, Next_I18n::post_types(), true)) {
            return;
        }
        if (Next_I18n_DeepL::get_key() === '' || !self::pending_locales($post)) {
            return;
        }
        if (!wp_next_scheduled(self::HOOK, array($post_id))) {
            wp_schedule_single_event(time() + 10, self::HOOK, array($post_id));
        }
    }

    /** Locales that should be (re)translated automatically. */
    public static function pending_locales($post) {
        $translations = Next_I18n::get_translations($post->ID);
        $pending = array();
        foreach (Next_I18n::target_locales() as $locale) {
            $entry = isset($translations[$locale]) && is_array($translations[$locale]) ? $translations[$locale] : array();
            if (!empty($entry['reviewed'])) {
                continue;
            }
            $missing = empty($entry['title']) && empty($entry['content']);
            $outdated_machine = Next_I18n::is_stale($entry, $post)
                && isset($entry['translated_by']) && $entry['translated_by'] === 'deepl';
            if ($missing || $outdated_machine) {
                $pending[] = $locale;
            }
        }
        return $pending;
    }

    public static function run($post_id) {
        $post = get_post($post_id);
        if (!$post || $post->post_status !== 'publish') {
            return;
        }

        $updated = false;
        foreach (self::pending_locales($post) as $locale) {
            $result = Next_I18n::translate_post($post, $locale);
            if (is_wp_error($result)) {
                // Stop on the first error (e.g. quota exhausted); retried on the next save.
                error_log(sprintf('Next i18n: auto-translation of post %d to %s failed: %s', $post_id, $locale, $result->get_error_message()));
                update_post_meta($post_id, self::ERROR_META, $result->get_error_message());
                break;
            }

            $translations = Next_I18n::get_translations($post_id);
            $old = isset($translations[$locale]) && is_array($translations[$locale]) ? $translations[$locale] : array();
            Next_I18n::save_locale($post_id, $locale, array_merge($old, $result, array(
                'source_hash'   => Next_I18n::source_hash($post),
                'translated_by' => 'deepl',
                'reviewed'      => false,
                'updated_at'    => time(),
            )));
            $updated = true;
        }

        if ($updated) {
            delete_post_meta($post_id, self::ERROR_META);
            // Lets next-revalidate refresh the storefront (meta updates don't fire save_post).
            do_action('next_i18n_translations_updated', $post_id, $post->post_type);
        }
    }
}
