=== Next FAQ ===
Requires at least: 6.0
Requires PHP: 7.4
Stable tag: 0.1.0
License: MIT

Domande frequenti per la vetrina Next.js, gestite dalla bacheca.

== Elenchi ==

Due elenchi fissi, scelti con le caselle "Elenchi FAQ" nell'editor:

- Home page        -> sezione FAQ in fondo alla home
- Pagine prodotto  -> sezione FAQ su ogni pagina prodotto/esperienza

Una FAQ può stare in entrambi. Senza elenco non compare da nessuna parte
(la colonna "Elenchi" lo segnala in rosso).

== Editor ==

- Titolo    = domanda
- Contenuto = risposta (link, elenchi e grassetto sono mantenuti)
- Attributi > Ordine = posizione nell'elenco (numeri bassi prima)
- Bozza = FAQ nascosta

== Traduzioni ==

Con Next i18n attivo, le FAQ hanno il box "Traduzioni" (titolo = domanda,
contenuto = risposta) con il pulsante DeepL; con la traduzione automatica
attiva (Impostazioni > Next i18n) le FAQ pubblicate vengono tradotte in
background come prodotti e pagine. Le lingue senza traduzione mostrano
l'italiano.

La risposta viene salvata con paragrafi <p> espliciti: DeepL ignora gli a capo
e senza i <p> le traduzioni unirebbero i paragrafi.

== Rivalidazione ==

Next.js Revalidation invia `next_faq` (o `next_faq_list`) al webhook della
vetrina a ogni salvataggio, cestino o ripristino: la vetrina aggiorna il tag
di cache `faqs`.

== REST API ==

GET /wp-json/next-faq/v1/faqs?list=home|product

  [ { "id", "question", "answer" (HTML), "order",
      "i18n": { "es": { "question", "answer" } } } ]

Solo FAQ pubblicate, ordinate per "Ordine" e data.
