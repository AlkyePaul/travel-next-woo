=== Next i18n ===
Requires at least: 6.0
Requires PHP: 7.4
Stable tag: 0.2.0
License: MIT

Traduzioni dei contenuti per la vetrina Next.js, senza WPML/Polylang.

== Modello ==

Un solo prodotto/post per tutte le lingue: l'italiano resta nei campi nativi di
WordPress/WooCommerce, le altre lingue sono campi aggiuntivi dello stesso oggetto.
Prezzi, stock, partenze e ordini restano unici.

== Installazione ==

1. Carica next-i18n.zip da Plugin > Aggiungi nuovo > Carica plugin e attivalo.
2. Impostazioni > Next i18n:
   - Lingue: aggiungi/disattiva/rimuovi righe (codice, nome, lingua DeepL).
     Il codice deve esistere anche in i18n/routing.ts della vetrina Next.js.
   - Chiave API DeepL (anche Free, termina con ":fx").
   - Traduzione automatica in background (opzionale).
3. Aggiorna anche next-revalidate: rivalida la vetrina quando arrivano
   traduzioni automatiche in background.

== Chiave DeepL ==

Ordine di lettura: costante in wp-config.php > variabile d'ambiente > impostazioni.

  define('NEXT_I18N_DEEPL_API_KEY', 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx:fx');

Se salvata dalle impostazioni: verificata con DeepL prima del salvataggio,
cifrata con libsodium (chiave derivata da AUTH_KEY/AUTH_SALT di wp-config.php),
non caricata in autoload, mai mostrata di nuovo né inviata al browser.
Se cambi le chiavi di sicurezza di WordPress va reinserita.

== Editor ==

Il box "Traduzioni" su prodotti, articoli e pagine ha, per ogni lingua:
titolo, slug, descrizione breve/riassunto, descrizione/contenuto (HTML),
pulsante "Traduci con DeepL" e la casella "Revisionata".

Stati: Mancante, Automatica, Manuale, Revisionata, Da aggiornare (l'italiano
è cambiato dopo la traduzione).

La traduzione automatica in background non sovrascrive mai le traduzioni
modificate a mano o revisionate.

== REST API ==

- Campo `i18n` su /wp/v2/posts, /wp/v2/pages e /wc/v3/products:
  { "es": { "title", "slug", "excerpt", "content", "outdated" }, ... }
- GET /wp-json/next-i18n/v1/config  -> lingua sorgente e lingue attive
- GET /wp-json/next-i18n/v1/slugs?type=product  -> slug per lingua di ogni elemento pubblicato

== Hook ==

- next_i18n_post_types (filter): post type con il box traduzioni.
- next_i18n_deepl_target (filter): codice DeepL per una lingua.
- next_i18n_translations_updated (action): dopo una traduzione in background.
