// Seeds the WooCommerce destinations and a set of multi-day wine trips abroad.
//
//   node scripts/seed-wine-trips.mjs --dry-run   # show what would change
//   node scripts/seed-wine-trips.mjs             # apply
//
// Idempotent: categories and products are matched by slug and updated in place.
// Reads WORDPRESS_URL from .env, plus a WooCommerce key with Read/Write permission:
// WC_WRITE_KEY / WC_WRITE_SECRET (the storefront's WC_CONSUMER_KEY is
// read-only and is used only as a fallback, e.g. for --dry-run).
//
// 1. Destinations: parent category "destinazioni", one child per country whose slug is
//    the lowercase ISO 3166-1 alpha-2 code (it, es, us…) and whose name is Italian.
//    Older country categories (italia, spain, usa…) are renamed in place, keeping their products.
// 2. The Italian experiences already in the catalogue are filed under "it".
// 3. Multi-day trips ("viaggi-del-vino") in other countries, each booked differently:
//    guaranteed departures with instant payment, departures confirmed on request,
//    open dates, private groups, quotes.
//
// Tour data is written straight into the Next Tours meta keys (_next_tour,
// _next_tour_booking, _next_tour_pricing), in the shape the plugin's sanitizers produce;
// regular_price is the "from" price the plugin would compute (from_price()).

import { readFileSync } from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");

// --- WooCommerce REST ----------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(path.resolve(import.meta.dirname, "../.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "").trim()];
    }),
);
const BASE = `${env.WORDPRESS_URL.replace(/\/$/, "")}/wp-json/wc/v3/`;
const KEY = env.WC_WRITE_KEY || env.WC_WRITE_CONSUMER_KEY || env.WC_CONSUMER_KEY;
const SECRET = env.WC_WRITE_SECRET || env.WC_WRITE_CONSUMER_SECRET || env.WC_CONSUMER_SECRET;
const AUTH = "Basic " + Buffer.from(`${KEY}:${SECRET}`).toString("base64");

async function wc(method, endpoint, body) {
  if (DRY && method !== "GET") {
    console.log(`  [dry-run] ${method} ${endpoint}`);
    return { id: 0, ...body };
  }
  const res = await fetch(BASE + endpoint, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${endpoint}: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

// --- 1. Destinations -------------------------------------------------------------
const ROOT = { slug: "destinazioni", name: "Destinazioni" };
// code → older slug to rename (null = create)
const DESTINATIONS = {
  it: "italia",
  es: "spain",
  gb: "great-britain",
  us: "usa",
  ar: "argentina",
  au: "australia",
  nz: "new-zealand",
  fr: "france",
  de: "germany",
  hu: null,
};
const italianName = new Intl.DisplayNames(["it"], { type: "region" });

async function seedDestinations() {
  console.log("Destinations");
  const all = await wc("GET", "products/categories?per_page=100&hide_empty=false");
  const bySlug = new Map(all.map((c) => [c.slug, c]));

  let root = bySlug.get(ROOT.slug);
  if (!root) {
    root = await wc("POST", "products/categories", { ...ROOT, parent: 0 });
    console.log(`  + ${ROOT.slug}`);
  }

  const ids = {};
  for (const [code, legacy] of Object.entries(DESTINATIONS)) {
    const wanted = { slug: code, name: italianName.of(code.toUpperCase()), parent: root.id };
    const current = bySlug.get(code) ?? (legacy ? bySlug.get(legacy) : undefined);
    if (!current) {
      ids[code] = (await wc("POST", "products/categories", wanted)).id;
      console.log(`  + ${code} (${wanted.name})`);
    } else if (current.slug !== code || current.name !== wanted.name || current.parent !== root.id) {
      ids[code] = (await wc("PUT", `products/categories/${current.id}`, wanted)).id;
      console.log(`  ~ ${current.slug} → ${code} (${wanted.name})`);
    } else {
      ids[code] = current.id;
      console.log(`  = ${code}`);
    }
  }
  return { ids, bySlug };
}

// --- 2. Italian experiences already in the catalogue ---------------------------
const ITALIAN_PRODUCTS = [
  "team-building-in-cantina-la-sfida-del-blend",
  "sicilia-del-vino-su-misura-etna-marsala-e-pantelleria",
  "grand-tour-del-piemonte-langhe-roero-e-monferrato",
  "weekend-in-franciacorta-bollicine-e-lago-diseo",
  "vespa-tra-le-vigne-del-chianti",
  "valpolicella-privata-con-autista",
  "e-bike-tra-le-colline-del-prosecco",
  "masterclass-amarone-e-cioccolato-in-valpolicella",
  "vendemmia-del-sangiovese-colline-di-romagna",
  "lambrusco-di-sorbara-degustazione-in-cantina",
];

async function fileItalianProducts(italyId) {
  console.log("Italian experiences → it");
  for (const slug of ITALIAN_PRODUCTS) {
    const [product] = await wc("GET", `products?slug=${slug}&status=any`);
    if (!product) {
      console.log(`  ? ${slug} not found`);
      continue;
    }
    if (product.categories.some((c) => c.id === italyId)) {
      console.log(`  = ${slug}`);
      continue;
    }
    await wc("PUT", `products/${product.id}`, {
      categories: [...product.categories.map((c) => ({ id: c.id })), { id: italyId }],
    });
    console.log(`  ~ ${slug}`);
  }
}

// --- 3. Trips --------------------------------------------------------------------
const POLICY_STANDARD =
  "Cancellazione gratuita fino a 45 giorni dalla partenza. Da 44 a 15 giorni: penale del 30%. Nei 14 giorni precedenti la partenza la quota non è rimborsabile.";
const POLICY_REQUEST =
  "Nessun addebito fino alla conferma. Dopo la conferma: cancellazione gratuita fino a 60 giorni dalla partenza, penale del 50% fino a 21 giorni, poi quota non rimborsabile.";
const ALWAYS_NOT_INCLUDED = ["Voli internazionali", "Assicurazione di viaggio", "Mance e spese personali"];
const WHAT_TO_BRING = ["Scarpe comode per le vigne", "Una giacca leggera per le cantine", "Passaporto valido"];

const info = (t) => ({
  kind: "multi_day",
  duration: { value: t.days, unit: "days" },
  nights: t.days - 1,
  difficulty: "easy",
  min_age: 18,
  group_size: { min: t.group[0], max: t.group[1] },
  languages: ["Italiano", "Inglese"],
  meeting_point: { address: t.meet[0], notes: t.meet[1], lat: String(t.meet[2]), lng: String(t.meet[3]) },
  end_point: { address: t.end },
  highlights: t.highlights,
  itinerary: t.itinerary.map(([title, description, meals, accommodation]) => ({
    title,
    description,
    meals,
    accommodation: accommodation ?? "",
  })),
  included: t.included,
  not_included: [...ALWAYS_NOT_INCLUDED, ...(t.notIncluded ?? [])],
  what_to_bring: WHAT_TO_BRING,
  important_info: t.important ?? "",
  cancellation_policy: t.booking.confirmation === "on_request" ? POLICY_REQUEST : POLICY_STANDARD,
});

const addDays = (date, n) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Departure row as the plugin stores it; `id` is stable so re-seeding keeps bookings attached. */
const departure = (prefix, days, date, opts = {}) => ({
  id: `${prefix}${date.replace(/-/g, "").slice(2)}`,
  date,
  time: "",
  end_date: addDays(date, days - 1),
  capacity: opts.capacity ?? 0,
  price_adjustment: opts.adjust ?? 0,
  confirmation: opts.confirmation ?? "inherit",
  status: "open",
  guaranteed: opts.guaranteed ?? false,
  note: opts.note ?? "",
});

const booking = (b) => ({
  fixed_departures: Boolean(b.departures?.length),
  open_dates: Boolean(b.rules?.length),
  confirmation: b.confirmation,
  cutoff_hours: b.cutoffDays * 24,
  booking_window_days: 450,
  min_per_booking: b.min ?? 1,
  max_per_booking: b.max ?? 0,
  departures: b.departures ?? [],
  rules: (b.rules ?? []).map((r) => ({
    from: r.from,
    to: r.to,
    weekdays: r.weekdays ?? [1, 2, 3, 4, 5, 6, 7],
    times: [],
    capacity: r.capacity ?? 0,
    price_adjustment: 0,
  })),
  blackouts: [],
});

const pricing = (p) => ({
  model: p.model,
  price: p.price ?? "",
  person_types: (p.personTypes ?? []).map((t) => ({
    min_age: 0,
    max_age: 0,
    min: 0,
    max: 0,
    counts_capacity: true,
    ...t,
  })),
  tiers: p.tiers ?? [],
  group: { price: "", included: 1, extra_price: "", max_people: 0, ...p.group },
  unit: { label: "", price: "", capacity: 0, max_units: 0, ...p.unit },
  extras: (p.extras ?? []).map((e) => ({ required: false, ...e })),
});

/** Same rule as Next_Tours_Pricing::from_price(). */
function fromPrice(p) {
  switch (p.model) {
    case "per_person":
      return p.price;
    case "person_types":
      return (p.person_types.find((t) => t.key === "adult") ?? p.person_types[0])?.price ?? "";
    case "group_tiers":
      return String(Math.min(...p.tiers.map((t) => Number(t.price))));
    case "private_group":
      return p.group.price;
    case "per_unit":
      return p.unit.price;
    default:
      return ""; // quote
  }
}

const TRIPS = [
  {
    country: "es",
    slug: "rioja-e-ribera-del-duero-5-giorni",
    name: "Rioja e Ribera del Duero: cinque giorni tra bodegas e borghi di pietra",
    short: "Il Tempranillo nelle sue due patrie: cantine storiche di Haro, architetture d’autore a Laguardia e i grandi rossi del Duero. Partenze garantite, conferma immediata.",
    description:
      "<p>Un viaggio nel nord della Spagna che mette a confronto due modi di intendere il Tempranillo. In Rioja si visitano le bodegas centenarie del Barrio de la Estación di Haro e le cantine firmate dai grandi architetti; sul Duero si scoprono i vini potenti di Ribera e le cattedrali sotterranee di Peñafiel.</p><p>Gruppi piccoli, accompagnatore italiano, hotel di charme tra i vigneti.</p>",
    days: 5,
    group: [4, 16],
    meet: ["Aeroporto di Bilbao (BIO), area arrivi", "Ritrovo alle 12:00 con l’accompagnatore.", 43.3011, -2.9106],
    end: "Madrid, stazione di Atocha",
    highlights: [
      "Le bodegas storiche del Barrio de la Estación di Haro",
      "Laguardia, borgo medievale costruito sopra le cantine",
      "Degustazione verticale di Ribera del Duero a Peñafiel",
      "Cena in un asador tradizionale con agnello al forno a legna",
    ],
    itinerary: [
      ["Bilbao – Haro", "Trasferimento in Rioja Alta e prima visita a una bodega storica del Barrio de la Estación.", ["dinner"], "Hotel tra i vigneti di Haro"],
      ["Rioja Alta e Laguardia", "Mattina tra le cantine sotterranee di Laguardia, pomeriggio in una bodega d’autore con degustazione di Reserva e Gran Reserva.", ["breakfast", "lunch"], "Hotel tra i vigneti di Haro"],
      ["Verso il Duero", "Sosta a Burgos e alla sua cattedrale, arrivo nella Ribera del Duero.", ["breakfast", "dinner"], "Posada a Peñafiel"],
      ["Ribera del Duero", "Castello di Peñafiel e museo del vino, visita a due cantine e degustazione verticale.", ["breakfast", "lunch"], "Posada a Peñafiel"],
      ["Peñafiel – Madrid", "Ultima colazione tra le vigne e trasferimento a Madrid.", ["breakfast"]],
    ],
    included: ["4 notti in hotel con colazione", "Trasporti in minibus privato", "Accompagnatore italiano", "6 visite in cantina con degustazione", "2 pranzi e 2 cene con vini in abbinamento"],
    booking: {
      confirmation: "instant",
      cutoffDays: 21,
      max: 6,
      departures: [
        ["2027-04-21", { guaranteed: true, capacity: 16 }],
        ["2027-06-09", { guaranteed: true, capacity: 16 }],
        ["2027-09-22", { capacity: 16, adjust: 10, note: "Settimana della vendemmia" }],
        ["2027-10-13", { guaranteed: true, capacity: 16 }],
      ],
    },
    pricing: {
      model: "per_person",
      price: "1290",
      extras: [{ key: "camera_singola", label: "Supplemento camera singola", price: "260", per: "person" }],
    },
  },
  {
    country: "gb",
    slug: "inghilterra-spumante-sussex-e-kent-4-giorni",
    name: "Inghilterra spumante: Sussex e Kent in quattro giorni",
    short: "Le bollicine inglesi nate sul gesso delle South Downs, tra tenute di campagna e scogliere bianche. Partenze confermate al raggiungimento del gruppo minimo: più siete, meno si spende.",
    description:
      "<p>Sullo stesso banco di gesso della Champagne, il sud dell’Inghilterra produce oggi alcuni dei metodi classici più interessanti d’Europa. Quattro giorni tra Sussex e Kent, con visite a tenute pionieristiche e giovani cantine.</p><p>La partenza viene confermata quando si raggiungono 6 partecipanti: la quota scende con il crescere del gruppo.</p>",
    days: 4,
    group: [6, 12],
    meet: ["Londra, stazione di St Pancras International", "Ritrovo alle 10:00 sotto l’orologio.", 51.5317, -0.1263],
    end: "Londra, stazione di St Pancras International",
    highlights: [
      "Metodo classico sul gesso delle South Downs",
      "Pranzo in una tenuta di campagna del Sussex",
      "Le scogliere bianche e i vigneti del Kent",
    ],
    itinerary: [
      ["Londra – Sussex", "Trasferimento nelle South Downs e visita a una delle tenute che hanno fatto nascere lo spumante inglese.", ["lunch", "dinner"], "Country house nel West Sussex"],
      ["Sussex", "Due cantine, una passeggiata sul crinale delle Downs e degustazione di vecchie annate.", ["breakfast", "lunch"], "Country house nel West Sussex"],
      ["Kent", "Il «giardino d’Inghilterra»: cantine giovani, frutteti e una sosta a Canterbury.", ["breakfast", "dinner"], "Hotel a Canterbury"],
      ["Kent – Londra", "Mattina sulle scogliere di Dover e rientro a Londra.", ["breakfast"]],
    ],
    included: ["3 notti con colazione", "Trasporti privati", "Accompagnatore italiano", "5 visite in cantina con degustazione", "2 pranzi e 2 cene"],
    important: "La partenza è confermata al raggiungimento di 6 partecipanti: riceverai una e-mail con il link di pagamento entro 30 giorni dalla data.",
    booking: {
      confirmation: "on_request",
      cutoffDays: 30,
      max: 12,
      departures: [
        ["2027-05-13", { capacity: 12 }],
        ["2027-06-17", { capacity: 12 }],
        ["2027-09-09", { capacity: 12, note: "Durante la vendemmia" }],
      ],
    },
    pricing: {
      model: "group_tiers",
      tiers: [
        { min: 1, max: 5, price: "1490" },
        { min: 6, max: 9, price: "1290" },
        { min: 10, max: 12, price: "1150" },
      ],
    },
  },
  {
    country: "hu",
    slug: "tokaj-su-misura-4-giorni",
    name: "Tokaj su misura: il vino dei re in quattro giorni",
    short: "Un viaggio privato tra le cantine scavate nel tufo di Tokaj e i caffè di Budapest. Scegli tu la data, noi confermiamo la disponibilità delle cantine.",
    description:
      "<p>Il Tokaji Aszú, il vino dolce delle corti europee, nasce in colline vulcaniche dove la muffa nobile appassisce gli acini di Furmint. Un itinerario privato con autista e guida, costruito sulle vostre date.</p><p>Il prezzo è per un gruppo privato fino a 2 persone; ogni persona in più ha un costo aggiuntivo.</p>",
    days: 4,
    group: [1, 8],
    meet: ["Budapest, il tuo hotel", "Partenza alle 9:00 con autista privato.", 47.4979, 19.0402],
    end: "Budapest, il tuo hotel",
    highlights: [
      "Cantine sotterranee scavate nel tufo vulcanico",
      "Degustazione di Tokaji Aszú da 3 a 6 puttonyos",
      "Autista e guida privati per tutto il viaggio",
    ],
    itinerary: [
      ["Budapest – Tokaj", "Viaggio verso nord-est e prima degustazione in una cantina storica di Tolcsva.", ["lunch", "dinner"], "Boutique hotel a Mád"],
      ["Mád e Tarcal", "Furmint secchi e vini dolci: tre cantine, dai produttori storici ai nuovi vignaioli.", ["breakfast", "lunch"], "Boutique hotel a Mád"],
      ["Sárospatak", "Le cantine-labirinto di Sárospatak e il castello Rákóczi.", ["breakfast", "dinner"], "Boutique hotel a Mád"],
      ["Tokaj – Budapest", "Rientro a Budapest con sosta a Eger.", ["breakfast"]],
    ],
    included: ["3 notti in boutique hotel con colazione", "Auto privata con autista", "Guida privata in italiano", "6 visite in cantina", "2 pranzi e 2 cene"],
    booking: {
      confirmation: "on_request",
      cutoffDays: 21,
      max: 8,
      rules: [{ from: "2027-03-15", to: "2027-11-15" }],
    },
    pricing: {
      model: "private_group",
      group: { price: "2400", included: 2, extra_price: "950", max_people: 8 },
    },
  },
  {
    country: "us",
    slug: "napa-e-sonoma-6-giorni",
    name: "Napa e Sonoma: sei giorni nella California del vino",
    short: "Cabernet di Napa, Pinot Noir della costa di Sonoma e la cucina della Bay Area. Date garantite con conferma immediata.",
    description:
      "<p>Dalle tenute storiche della Napa Valley alle vigne nella nebbia della Sonoma Coast: sei giorni nella regione che ha cambiato la storia del vino americano, con un finale a San Francisco.</p><p>Tutte le date sono garantite. Chi viaggia con voi ma non degusta paga una quota ridotta.</p>",
    days: 6,
    group: [2, 14],
    meet: ["San Francisco, aeroporto SFO", "Ritrovo alle 11:00 all’uscita degli arrivi internazionali.", 37.6213, -122.379],
    end: "San Francisco, Union Square",
    highlights: [
      "Degustazione di Cabernet Sauvignon a Oakville e Rutherford",
      "Pinot Noir e Chardonnay sulla Sonoma Coast",
      "Pranzo in una cantina con orto e cucina propria",
      "Ultima sera a San Francisco",
    ],
    itinerary: [
      ["San Francisco – Napa", "Trasferimento in valle e benvenuto in una tenuta storica.", ["dinner"], "Inn a Yountville"],
      ["Napa Valley", "Oakville e Rutherford: i Cabernet che hanno vinto il Giudizio di Parigi.", ["breakfast", "lunch"], "Inn a Yountville"],
      ["Stags Leap e Calistoga", "Cantine nella roccia e terme naturali di Calistoga.", ["breakfast"], "Inn a Yountville"],
      ["Sonoma", "Healdsburg e la Russian River Valley.", ["breakfast", "lunch"], "Hotel a Healdsburg"],
      ["Sonoma Coast", "Vigne nella nebbia dell’oceano e pranzo a Bodega Bay.", ["breakfast", "lunch"], "Hotel a Healdsburg"],
      ["Sonoma – San Francisco", "Rientro in città attraverso il Golden Gate.", ["breakfast"]],
    ],
    included: ["5 notti con colazione", "Trasporti in van privato", "Accompagnatore italiano", "8 visite in cantina con degustazione", "3 pranzi e 1 cena"],
    booking: {
      confirmation: "instant",
      cutoffDays: 30,
      max: 6,
      departures: [
        ["2027-05-03", { guaranteed: true, capacity: 14 }],
        ["2027-09-13", { guaranteed: true, capacity: 14, adjust: 8, note: "Vendemmia" }],
        ["2027-10-04", { guaranteed: true, capacity: 14 }],
      ],
    },
    pricing: {
      model: "person_types",
      personTypes: [
        { key: "adult", label: "Adulto", price: "2890", min_age: 21 },
        { key: "companion", label: "Accompagnatore che non degusta", price: "2590", min_age: 18 },
      ],
      extras: [{ key: "mongolfiera", label: "Volo in mongolfiera sulla Napa Valley", price: "320", per: "person" }],
    },
  },
  {
    country: "us",
    slug: "oregon-pinot-noir-willamette-valley-5-giorni",
    name: "Oregon, terra di Pinot Noir: cinque giorni nella Willamette Valley",
    short: "Il Pinot Noir del Nuovo Mondo che somiglia di più alla Borgogna, tra fattorie, foreste e piccoli produttori. Partenza il lunedì o il giovedì, conferma immediata.",
    description:
      "<p>La Willamette Valley è la Borgogna d’America: suoli vulcanici, clima fresco, famiglie di vignaioli arrivate negli anni Sessanta. Cinque giorni tra Dundee Hills, Eola-Amity Hills e la cucina farm-to-table di Portland.</p><p>Partenze ogni lunedì e giovedì da maggio a metà ottobre, massimo 8 viaggiatori.</p>",
    days: 5,
    group: [2, 8],
    meet: ["Portland, aeroporto PDX", "Ritrovo alle 12:00 agli arrivi.", 45.5898, -122.5951],
    end: "Portland, Pearl District",
    highlights: [
      "Pinot Noir delle Dundee Hills e delle Eola-Amity Hills",
      "Cena farm-to-table con i produttori",
      "Un giorno a Portland tra mercati e birrifici",
    ],
    itinerary: [
      ["Portland – Dundee", "Arrivo nelle Red Hills e prima degustazione.", ["dinner"], "Lodge a Dundee"],
      ["Dundee Hills", "Tre cantine pioniere del Pinot Noir dell’Oregon.", ["breakfast", "lunch"], "Lodge a Dundee"],
      ["Eola-Amity Hills", "Vigneti ventosi e Chardonnay, cena con i vignaioli.", ["breakfast", "dinner"], "Lodge a Dundee"],
      ["Portland", "Mercati, food cart e birrifici artigianali.", ["breakfast"], "Hotel nel Pearl District"],
      ["Partenza", "Colazione e fine dei servizi.", ["breakfast"]],
    ],
    included: ["4 notti con colazione", "Trasporti privati", "Guida locale in italiano", "6 visite in cantina", "1 pranzo e 2 cene"],
    booking: {
      confirmation: "instant",
      cutoffDays: 14,
      min: 2,
      max: 8,
      rules: [{ from: "2027-05-01", to: "2027-10-15", weekdays: [1, 4], capacity: 8 }],
    },
    pricing: { model: "per_person", price: "1890" },
  },
  {
    country: "ar",
    slug: "mendoza-e-valle-de-uco-7-giorni",
    name: "Mendoza e Valle de Uco: il Malbec ai piedi delle Ande in sette giorni",
    short: "Vigneti a mille metri con le Ande innevate sullo sfondo, asado e Malbec d’altura. Date garantite con conferma immediata, altre partenze su richiesta.",
    description:
      "<p>Mendoza è la capitale del vino argentino: canali d’irrigazione, viali alberati e cantine con vista sull’Aconcagua. Il viaggio sale fino alla Valle de Uco, dove il Malbec cresce oltre i mille metri.</p><p>Le date di vendemmia e di marzo sono garantite; le partenze di aprile e novembre sono confermate al raggiungimento di 6 partecipanti.</p>",
    days: 7,
    group: [4, 14],
    meet: ["Mendoza, aeroporto El Plumerillo (MDZ)", "Ritrovo all’arrivo del volo da Buenos Aires.", -32.8317, -68.7929],
    end: "Mendoza, aeroporto El Plumerillo (MDZ)",
    highlights: [
      "Malbec d’altura nella Valle de Uco",
      "Asado in una estancia con vista sulle Ande",
      "Un giorno in alta montagna fino all’Aconcagua",
      "Degustazione alla cieca guidata da un enologo",
    ],
    itinerary: [
      ["Arrivo a Mendoza", "Benvenuto e cena nel centro città.", ["dinner"], "Hotel a Chacras de Coria"],
      ["Luján de Cuyo", "Le cantine storiche del Malbec e pranzo tra le vigne.", ["breakfast", "lunch"], "Hotel a Chacras de Coria"],
      ["Maipú", "In bicicletta tra cantine e uliveti.", ["breakfast", "lunch"], "Hotel a Chacras de Coria"],
      ["Alta montagna", "Escursione fino al belvedere dell’Aconcagua.", ["breakfast", "lunch"], "Hotel a Chacras de Coria"],
      ["Valle de Uco", "Salita a 1.100 metri: cantine d’autore e asado in estancia.", ["breakfast", "lunch", "dinner"], "Lodge nella Valle de Uco"],
      ["Valle de Uco", "Degustazione alla cieca con un enologo e pomeriggio libero.", ["breakfast", "lunch"], "Lodge nella Valle de Uco"],
      ["Partenza", "Rientro all’aeroporto di Mendoza.", ["breakfast"]],
    ],
    included: ["6 notti con colazione", "Trasporti privati", "Accompagnatore italiano", "8 visite in cantina", "5 pranzi e 2 cene"],
    notIncluded: ["Volo interno Buenos Aires – Mendoza"],
    booking: {
      confirmation: "instant",
      cutoffDays: 30,
      max: 6,
      departures: [
        ["2027-02-25", { guaranteed: true, capacity: 14, adjust: 12, note: "Vendimia: la festa della vendemmia" }],
        ["2027-03-18", { guaranteed: true, capacity: 14 }],
        ["2027-04-15", { capacity: 14, confirmation: "on_request", note: "Confermata con almeno 6 partecipanti" }],
        ["2027-11-04", { capacity: 14, confirmation: "on_request", note: "Confermata con almeno 6 partecipanti" }],
      ],
    },
    pricing: {
      model: "per_person",
      price: "2350",
      extras: [{ key: "buenos_aires", label: "Estensione a Buenos Aires (2 notti)", price: "480", per: "person" }],
    },
  },
  {
    country: "au",
    slug: "south-australia-su-misura-barossa-mclaren-vale-adelaide-hills",
    name: "South Australia su misura: Barossa, McLaren Vale e Adelaide Hills",
    short: "Lo Shiraz delle vecchie vigne di Barossa, il mare di McLaren Vale e i bianchi freschi delle Adelaide Hills. Itinerario costruito su di voi: chiedi un preventivo.",
    description:
      "<p>Il South Australia custodisce alcune delle viti più vecchie del mondo, sopravvissute alla fillossera. Proponiamo un itinerario di sette giorni da adattare a date, budget e interessi: cantine di famiglia, ristoranti tra le vigne, natura e fauna di Kangaroo Island.</p><p>Il prezzo dipende da stagione, hotel e servizi scelti: invia una richiesta e ti mandiamo un preventivo.</p>",
    days: 7,
    group: [2, 10],
    meet: ["Adelaide, aeroporto ADL", "Trasferimento privato dall’aeroporto.", -34.945, 138.5306],
    end: "Adelaide, aeroporto ADL",
    highlights: [
      "Shiraz da viti centenarie nella Barossa Valley",
      "Degustazioni con vista oceano a McLaren Vale",
      "Estensione possibile a Kangaroo Island",
    ],
    itinerary: [
      ["Adelaide", "Arrivo e cena al Central Market.", ["dinner"], "Hotel ad Adelaide"],
      ["Barossa Valley", "Le cantine storiche delle famiglie tedesche e lo Shiraz delle vecchie vigne.", ["breakfast", "lunch"], "Lodge nella Barossa"],
      ["Barossa ed Eden Valley", "Riesling d’altura e pranzo in cantina.", ["breakfast", "lunch"], "Lodge nella Barossa"],
      ["Adelaide Hills", "Sauvignon e Chardonnay tra boschi di eucalipto.", ["breakfast"], "Cottage nelle Adelaide Hills"],
      ["McLaren Vale", "Cantine sul mare e il cubo di vetro più fotografato d’Australia.", ["breakfast", "lunch"], "Hotel a McLaren Vale"],
      ["McLaren Vale", "Giornata libera tra spiagge e cantine o escursione facoltativa.", ["breakfast"], "Hotel a McLaren Vale"],
      ["Partenza", "Trasferimento all’aeroporto di Adelaide.", ["breakfast"]],
    ],
    included: ["6 notti con colazione", "Auto privata con autista o noleggio, a scelta", "Visite in cantina prenotate per voi", "Assistenza in italiano 24 ore su 24"],
    booking: {
      confirmation: "on_request",
      cutoffDays: 45,
      max: 10,
      rules: [{ from: "2027-01-10", to: "2027-12-15" }],
    },
    pricing: {
      model: "quote",
      extras: [{ key: "kangaroo_island", label: "Estensione a Kangaroo Island (2 notti)", price: "690", per: "person" }],
    },
  },
  {
    country: "nz",
    slug: "nuova-zelanda-in-camper-da-marlborough-a-central-otago-8-giorni",
    name: "Nuova Zelanda in camper: da Marlborough a Central Otago in otto giorni",
    short: "Sauvignon Blanc di Marlborough, Pinot Noir di Central Otago e la West Coast in libertà, in camper con itinerario e cantine prenotate. Prezzo per camper.",
    description:
      "<p>L’Isola del Sud in camper: si parte da Blenheim, capitale del Sauvignon Blanc, si attraversa la costa ovest tra ghiacciai e foreste pluviali e si arriva tra le montagne di Central Otago, patria del Pinot Noir più a sud del mondo.</p><p>Il prezzo è per camper (2 persone). La partenza di marzo, in piena vendemmia, è garantita e si paga subito; le altre sono confermate su richiesta in base alla disponibilità dei mezzi.</p>",
    days: 8,
    group: [2, 12],
    meet: ["Blenheim, deposito camper vicino all’aeroporto", "Consegna del camper alle 10:00 e briefing.", -41.5183, 173.8703],
    end: "Queenstown, deposito camper",
    highlights: [
      "Sauvignon Blanc nella Wairau Valley",
      "La West Coast e i ghiacciai Franz Josef e Fox",
      "Pinot Noir a Gibbston Valley e Bannockburn",
      "Campeggi panoramici già prenotati",
    ],
    itinerary: [
      ["Blenheim", "Ritiro del camper e prime cantine della Wairau Valley.", [], "Campeggio a Blenheim"],
      ["Marlborough", "Sauvignon Blanc e Pinot Gris, pranzo in cantina.", ["lunch"], "Campeggio a Blenheim"],
      ["Verso la West Coast", "Attraverso il Lewis Pass fino a Punakaiki.", [], "Campeggio a Punakaiki"],
      ["Ghiacciai", "Franz Josef e passeggiata nella foresta pluviale.", [], "Campeggio a Franz Josef"],
      ["Haast Pass – Wanaka", "Laghi e montagne fino a Wanaka.", [], "Campeggio a Wanaka"],
      ["Central Otago", "Bannockburn e Cromwell: il Pinot Noir più a sud del mondo.", ["lunch"], "Campeggio a Cromwell"],
      ["Gibbston Valley", "Cantine nella roccia e il ponte del primo bungee jumping.", [], "Campeggio a Queenstown"],
      ["Queenstown", "Riconsegna del camper.", []],
    ],
    included: ["Camper 2 posti per 8 giorni, chilometraggio illimitato", "7 notti in campeggi selezionati", "6 visite in cantina prenotate", "2 pranzi in cantina", "Roadbook in italiano e assistenza 24 ore su 24"],
    notIncluded: ["Carburante", "Traghetto tra Isola del Nord e del Sud"],
    important: "Serve la patente di guida internazionale. In Nuova Zelanda si guida a sinistra.",
    booking: {
      confirmation: "on_request",
      cutoffDays: 30,
      max: 3,
      departures: [
        ["2027-02-15", { capacity: 6 }],
        ["2027-03-08", { capacity: 6, guaranteed: true, confirmation: "instant", note: "Vendemmia, partenza garantita" }],
        ["2027-11-15", { capacity: 6 }],
      ],
    },
    pricing: {
      model: "per_unit",
      unit: { label: "Camper per 2 persone", price: "3200", capacity: 2, max_units: 3 },
    },
  },
];

async function seedTrips(categoryIds, bySlug) {
  console.log("Trips");
  const parents = ["enoturismo", "viaggi-del-vino"].map((slug) => {
    const c = bySlug.get(slug);
    if (!c) throw new Error(`Category ${slug} not found`);
    return { id: c.id };
  });

  for (const t of TRIPS) {
    const prefix = t.country;
    const b = booking({
      ...t.booking,
      departures: t.booking.departures?.map(([date, opts]) => departure(prefix, t.days, date, opts)),
    });
    const p = pricing(t.pricing);
    const body = {
      name: t.name,
      slug: t.slug,
      type: "tour",
      status: "publish",
      virtual: true,
      sold_individually: true,
      manage_stock: false,
      stock_status: "instock",
      regular_price: fromPrice(p),
      short_description: `<p>${t.short}</p>`,
      description: t.description,
      categories: [...parents, { id: categoryIds[t.country] }],
      meta_data: [
        { key: "_next_tour", value: info({ ...t, booking: b }) },
        { key: "_next_tour_booking", value: b },
        { key: "_next_tour_pricing", value: p },
      ],
    };

    const [existing] = await wc("GET", `products?slug=${t.slug}&status=any`);
    if (existing) {
      await wc("PUT", `products/${existing.id}`, body);
      console.log(`  ~ ${t.country} ${t.slug}`);
    } else {
      const created = await wc("POST", "products", body);
      console.log(`  + ${t.country} ${t.slug} (#${created.id})`);
    }
  }
}

const { ids, bySlug } = await seedDestinations();
await fileItalianProducts(ids.it);
await seedTrips(ids, bySlug);
console.log(DRY ? "Dry run: nothing changed." : "Done.");
