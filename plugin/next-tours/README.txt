=== Next Tours ===
Requires at least: 6.0
Requires PHP: 7.4
WC requires at least: 8.8
License: MIT

Tour products (experiences, day tours, multi-day packages) for the headless
Next.js storefront (travel-next-woo).

== What it adds ==

* Product type "Tour / Esperienza" with four tabs in "Dati prodotto":
  - Tour: kind, duration, nights, difficulty, min age, group size, languages,
    meeting/end point, highlights, itinerary (stops or days, with meals and
    accommodation), included / not included, what to bring, important info,
    cancellation policy.
  - Prenotazione: fixed departures and/or open dates (independent switches),
    instant or on-request confirmation, cutoff, booking window, min/max
    participants per booking.
  - Date: fixed departures (date, time, end date, seats, price ±%, per-departure
    confirmation override, open/closed/cancelled, guaranteed, note) and
    open-date rules (date range, weekdays, time slots, seats per slot,
    price ±%), plus blackout dates.
  - Prezzi: pricing model (per person · person types · group tiers · private
    group · per unit · quote) and extras (per booking / person / day / unit,
    optional or mandatory).
* Order status "Richiesta di prenotazione" (wc-tour-request) with Confirm /
  Decline in the order screen. Confirm → order "In attesa di pagamento" + e-mail
  with the payment link. Decline → order cancelled + e-mail.
* Seat ledger (table {prefix}next_tour_bookings) derived from orders, with
  holds that expire (WooCommerce → Impostazioni → Prodotti → Tour).
* WooCommerce → Prenotazioni tour: bookings by date (manifest).
* Four WooCommerce e-mails (WooCommerce → Impostazioni → Email).
* DeepL translations of the tour fields through the Next i18n plugin.

== REST API ==

* `tour` field on /wc/v3/products (null for other products).
* GET  /wp-json/next-tours/v1/availability?product=ID&from=Y-m-d&to=Y-m-d
* POST /wp-json/next-tours/v1/quote   { product_id, mode, departure_id | date+time,
                                       participants, units, extras }
* Store API: POST /wc/store/v1/cart/add-item accepts `next_tour` (the booking
  request); cart items expose extensions["next-tours"].booking.
* POST /wc/v3/orders: tour lines must carry meta `_next_tour_request` (JSON
  booking request). The plugin re-validates and re-prices them; if any needs
  confirmation the order is created as `tour-request`.

Prices are always computed by the plugin: the storefront only shows quotes.

== Installation ==

1. Upload `next-tours.zip` (Plugin → Aggiungi nuovo → Carica plugin), or copy
   the `next-tours` folder into wp-content/plugins.
2. Activate. Requires WooCommerce 8.8+ (Store API add-to-cart filter).
3. Optional: Next i18n (translations) and Next.js Revalidation.
4. Create a product, choose "Tour / Esperienza" as product type.

Existing products are not touched: everything applies only to products of
type "Tour / Esperienza".
