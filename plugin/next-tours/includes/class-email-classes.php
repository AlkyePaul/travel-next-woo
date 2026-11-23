<?php
/**
 * WC_Email subclasses. Loaded from the woocommerce_email_classes filter, when
 * WC_Email is available.
 */

if (!defined('ABSPATH')) {
    exit;
}

abstract class Next_Tours_Email extends WC_Email {

    public function __construct() {
        $this->template_html = 'emails/next-tours-booking.php';
        $this->template_plain = 'emails/plain/next-tours-booking.php';
        $this->template_base = NEXT_TOURS_DIR . 'templates/';
        $this->placeholders = array(
            '{order_date}'   => '',
            '{order_number}' => '',
        );
        parent::__construct();
    }

    /** Main paragraph. */
    abstract protected function intro();

    /** Personal message from the shop (admin), if any. */
    protected function message() {
        return '';
    }

    /** [url, label] for the call-to-action button, or null. */
    protected function button() {
        return null;
    }

    public function trigger($order_id, $order = false) {
        $this->setup_locale();

        if ($order_id && !($order instanceof WC_Order)) {
            $order = wc_get_order($order_id);
        }
        if ($order instanceof WC_Order) {
            $this->object = $order;
            if ($this->customer_email) {
                $this->recipient = $order->get_billing_email();
            }
            $this->placeholders['{order_date}'] = wc_format_datetime($order->get_date_created());
            $this->placeholders['{order_number}'] = $order->get_order_number();
        }

        if ($this->is_enabled() && $this->get_recipient()) {
            $this->send($this->get_recipient(), $this->get_subject(), $this->get_content(), $this->get_headers(), $this->get_attachments());
        }

        $this->restore_locale();
    }

    private function template_args($plain_text) {
        $button = $this->button();
        return array(
            'order'              => $this->object,
            'email_heading'      => $this->get_heading(),
            'intro'              => $this->format_string($this->intro()),
            'message'            => $this->message(),
            'button_url'         => $button ? $button[0] : '',
            'button_label'       => $button ? $button[1] : '',
            'additional_content' => $this->get_additional_content(),
            'sent_to_admin'      => !$this->customer_email,
            'plain_text'         => $plain_text,
            'email'              => $this,
        );
    }

    public function get_content_html() {
        return wc_get_template_html($this->template_html, $this->template_args(false), '', $this->template_base);
    }

    public function get_content_plain() {
        return wc_get_template_html($this->template_plain, $this->template_args(true), '', $this->template_base);
    }

    public function get_default_additional_content() {
        return '';
    }
}

class Next_Tours_Email_Request_Customer extends Next_Tours_Email {
    public function __construct() {
        $this->id = 'next_tours_request_customer';
        $this->customer_email = true;
        $this->title = __('Tour: richiesta ricevuta (cliente)', 'next-tours');
        $this->description = __('Inviata al cliente quando invia una richiesta di prenotazione da confermare.', 'next-tours');
        parent::__construct();
    }

    public function get_default_subject() {
        return __('Abbiamo ricevuto la tua richiesta di prenotazione #{order_number}', 'next-tours');
    }

    public function get_default_heading() {
        return __('Richiesta ricevuta', 'next-tours');
    }

    protected function intro() {
        return __('Grazie! Abbiamo ricevuto la tua richiesta di prenotazione. Verifichiamo la disponibilità e ti rispondiamo al più presto: se confermata, riceverai un’email con il link per il pagamento. Per ora non ti è stato addebitato nulla.', 'next-tours');
    }
}

class Next_Tours_Email_Request_Admin extends Next_Tours_Email {
    public function __construct() {
        $this->id = 'next_tours_request_admin';
        $this->customer_email = false;
        $this->title = __('Tour: nuova richiesta (negozio)', 'next-tours');
        $this->description = __('Inviata al negozio quando arriva una richiesta di prenotazione da confermare.', 'next-tours');
        parent::__construct();
        $this->recipient = $this->get_option('recipient', Next_Tours_Settings::admin_email());
    }

    public function init_form_fields() {
        parent::init_form_fields();
        $this->form_fields = array_merge(
            array(
                'recipient' => array(
                    'title'       => __('Destinatari', 'next-tours'),
                    'type'        => 'text',
                    'description' => __('Separati da virgola.', 'next-tours'),
                    'placeholder' => Next_Tours_Settings::admin_email(),
                    'default'     => '',
                    'desc_tip'    => true,
                ),
            ),
            $this->form_fields
        );
    }

    public function get_recipient() {
        $recipient = parent::get_recipient();
        return $recipient !== '' ? $recipient : Next_Tours_Settings::admin_email();
    }

    public function get_default_subject() {
        return __('[{site_title}] Nuova richiesta di prenotazione #{order_number}', 'next-tours');
    }

    public function get_default_heading() {
        return __('Nuova richiesta di prenotazione', 'next-tours');
    }

    protected function intro() {
        $name = $this->object ? trim($this->object->get_billing_first_name() . ' ' . $this->object->get_billing_last_name()) : '';
        return sprintf(
            /* translators: %s: customer name */
            __('%s ha inviato una richiesta di prenotazione. Controlla disponibilità e prezzo, poi confermala o rifiutala dalla pagina dell’ordine.', 'next-tours'),
            $name !== '' ? $name : __('Un cliente', 'next-tours')
        );
    }

    protected function button() {
        return $this->object ? array($this->object->get_edit_order_url(), __('Apri l’ordine', 'next-tours')) : null;
    }
}

class Next_Tours_Email_Confirmed extends Next_Tours_Email {
    public function __construct() {
        $this->id = 'next_tours_confirmed';
        $this->customer_email = true;
        $this->title = __('Tour: richiesta confermata (cliente)', 'next-tours');
        $this->description = __('Inviata al cliente quando confermi una richiesta: contiene il link per pagare.', 'next-tours');
        parent::__construct();
    }

    public function get_default_subject() {
        return __('Prenotazione confermata: completa il pagamento (#{order_number})', 'next-tours');
    }

    public function get_default_heading() {
        return __('La tua prenotazione è confermata', 'next-tours');
    }

    protected function intro() {
        return sprintf(
            /* translators: %d: hours */
            __('Buone notizie: abbiamo confermato la tua richiesta! Completa il pagamento entro %d ore per garantire i posti.', 'next-tours'),
            Next_Tours_Settings::confirmed_payment_hours()
        );
    }

    protected function message() {
        return $this->object ? (string) $this->object->get_meta(Next_Tours_Admin_Orders::MESSAGE_META) : '';
    }

    protected function button() {
        return $this->object ? array($this->object->get_checkout_payment_url(), __('Paga ora', 'next-tours')) : null;
    }
}

class Next_Tours_Email_Declined extends Next_Tours_Email {
    public function __construct() {
        $this->id = 'next_tours_declined';
        $this->customer_email = true;
        $this->title = __('Tour: richiesta rifiutata (cliente)', 'next-tours');
        $this->description = __('Inviata al cliente quando rifiuti una richiesta di prenotazione.', 'next-tours');
        parent::__construct();
    }

    public function get_default_subject() {
        return __('La tua richiesta di prenotazione #{order_number}', 'next-tours');
    }

    public function get_default_heading() {
        return __('Richiesta non disponibile', 'next-tours');
    }

    protected function intro() {
        return __('Ci dispiace, non possiamo confermare la tua richiesta di prenotazione. Non ti è stato addebitato nulla. Rispondi pure a questa email se vuoi valutare un’alternativa.', 'next-tours');
    }

    protected function message() {
        return $this->object ? (string) $this->object->get_meta(Next_Tours_Admin_Orders::DECLINE_META) : '';
    }
}
