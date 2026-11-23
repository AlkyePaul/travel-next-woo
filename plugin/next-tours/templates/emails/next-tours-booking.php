<?php
/**
 * Next Tours booking e-mail (HTML).
 *
 * Override in a theme: yourtheme/woocommerce/emails/next-tours-booking.php
 *
 * @var WC_Order $order
 * @var string   $email_heading
 * @var string   $intro
 * @var string   $message
 * @var string   $button_url
 * @var string   $button_label
 * @var string   $additional_content
 * @var bool     $sent_to_admin
 * @var bool     $plain_text
 * @var WC_Email $email
 */

defined('ABSPATH') || exit;

$base_color = get_option('woocommerce_email_base_color', '#7f54b3');

do_action('woocommerce_email_header', $email_heading, $email);

echo wp_kses_post(wpautop(wptexturize($intro)));

if ($message !== '') {
    echo '<blockquote style="margin:16px 0;padding:12px 16px;border-left:4px solid ' . esc_attr($base_color) . ';background:#f6f6f6;">'
        . wp_kses_post(wpautop(esc_html($message)))
        . '</blockquote>';
}

if ($button_url !== '') {
    echo '<p style="margin:24px 0;"><a href="' . esc_url($button_url) . '" style="display:inline-block;padding:12px 24px;background:' . esc_attr($base_color) . ';color:#ffffff;text-decoration:none;border-radius:4px;font-weight:bold;">'
        . esc_html($button_label)
        . '</a></p>';
}

do_action('woocommerce_email_order_details', $order, $sent_to_admin, $plain_text, $email);
do_action('woocommerce_email_order_meta', $order, $sent_to_admin, $plain_text, $email);
do_action('woocommerce_email_customer_details', $order, $sent_to_admin, $plain_text, $email);

if ($additional_content) {
    echo wp_kses_post(wpautop(wptexturize($additional_content)));
}

do_action('woocommerce_email_footer', $email);
