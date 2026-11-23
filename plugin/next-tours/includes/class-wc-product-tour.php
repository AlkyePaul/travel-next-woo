<?php
/**
 * Product class for the "tour" type. Loaded by Next_Tours_Product_Type once
 * WooCommerce is available.
 */

if (!defined('ABSPATH')) {
    exit;
}

class WC_Product_Tour extends WC_Product_Simple {

    public function get_type() {
        return 'tour';
    }

    public function is_virtual() {
        return true;
    }

    /** One cart line = one booking; the number of people is part of the booking. */
    public function is_sold_individually() {
        return true;
    }

    /** Bookable even with no advertised price ("price on request" tours). */
    public function is_purchasable() {
        $purchasable = $this->exists()
            && ($this->get_status() === 'publish' || current_user_can('edit_post', $this->get_id()));
        return apply_filters('woocommerce_is_purchasable', $purchasable, $this);
    }

    /** Availability is handled by departures/slots, not by WooCommerce stock. */
    public function managing_stock() {
        return false;
    }

    public function is_in_stock() {
        return true;
    }

    public function add_to_cart_text() {
        return apply_filters('woocommerce_product_add_to_cart_text', __('Prenota', 'next-tours'), $this);
    }

    public function single_add_to_cart_text() {
        return apply_filters('woocommerce_product_single_add_to_cart_text', __('Prenota', 'next-tours'), $this);
    }
}
