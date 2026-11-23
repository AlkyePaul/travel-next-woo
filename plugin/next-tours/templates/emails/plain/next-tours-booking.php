<?php
/**
 * Next Tours booking e-mail (plain text).
 *
 * Override in a theme: yourtheme/woocommerce/emails/plain/next-tours-booking.php
 */

defined('ABSPATH') || exit;

echo "=================================================\n";
echo esc_html(wp_strip_all_tags($email_heading));
echo "\n=================================================\n\n";

echo esc_html(wp_strip_all_tags(wptexturize($intro))) . "\n\n";

if ($message !== '') {
    echo esc_html($message) . "\n\n";
}

if ($button_url !== '') {
    echo esc_html($button_label) . ': ' . esc_url_raw($button_url) . "\n\n";
}

echo "----------------------------------------\n\n";

do_action('woocommerce_email_order_details', $order, $sent_to_admin, $plain_text, $email);

echo "\n----------------------------------------\n\n";

do_action('woocommerce_email_order_meta', $order, $sent_to_admin, $plain_text, $email);
do_action('woocommerce_email_customer_details', $order, $sent_to_admin, $plain_text, $email);

if ($additional_content) {
    echo esc_html(wp_strip_all_tags(wptexturize($additional_content))) . "\n\n";
}

echo wp_kses_post(apply_filters('woocommerce_email_footer_text', get_option('woocommerce_email_footer_text')));
