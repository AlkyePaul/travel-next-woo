// Seeds the destination page content (subtitle, intro, wine zones, grapes, best months,
// getting there) of the country categories. Galleries are left to the editors
// (media library), and fields already filled in WordPress are kept unless --force.
//
//   node scripts/seed-destinations.mjs --dry-run
//   node scripts/seed-destinations.mjs [--force]
//
// Needs Next Tours ≥ 0.2.0 on WordPress (the `destination` field on product categories)
// and a Read/Write key in WC_WRITE_KEY / WC_WRITE_SECRET.

import { readFileSync } from "node:fs";
import path from "node:path";

const DRY = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

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
const KEY = env.WC_WRITE_KEY || env.WC_CONSUMER_KEY;
const SECRET = env.WC_WRITE_SECRET || env.WC_CONSUMER_SECRET;
const AUTH = "Basic " + Buffer.from(`${KEY}:${SECRET}`).toString("base64");

async function wc(method, endpoint, body) {
  if (DRY && method !== "GET") return body;
  const res = await fetch(BASE + endpoint, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${endpoint}: ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

const p = (...paragraphs) => paragraphs.map((t) => `<p>${t}</p>`).join("");
const zone = (name, lat, lng, text) => ({ name, lat: String(lat), lng: String(lng), text });

const CONTENT = {
  it: {
    subtitle: "Cento vitigni autoctoni, dalle Alpi all’Etna",
    intro: p(
      "Nessun altro paese ha tanta varietà in così poco spazio: più di cinquecento vitigni autoctoni, vigne che salgono dalle colline moreniche ai pendii di un vulcano attivo, e una cucina che in ogni regione ha il suo vino accanto.",
      "Le nostre esperienze vanno dalla degustazione di un’ora in cantina al viaggio di più giorni: Nebbiolo nelle Langhe, Amarone in Valpolicella, bollicine tra Franciacorta e Prosecco, Sangiovese in Chianti e i vini di lava dell’Etna.",
    ),
    zones: [
      zone("Langhe", 44.65, 8.0, "Colline patrimonio UNESCO, Barolo e Barbaresco, tartufo bianco d’autunno."),
      zone("Franciacorta", 45.6, 10.0, "Il metodo classico italiano tra il lago d’Iseo e le colline bresciane."),
      zone("Valpolicella", 45.53, 10.9, "Uve messe ad appassire per l’Amarone, a pochi chilometri da Verona."),
      zone("Colline del Prosecco", 45.9, 12.2, "I ripidi «ciglioni» di Conegliano e Valdobbiadene, patrimonio UNESCO."),
      zone("Chianti Classico", 43.5, 11.3, "Sangiovese tra Firenze e Siena, borghi in pietra e cipressi."),
      zone("Etna", 37.75, 15.0, "Vigne ad alberello sulla lava, fino a mille metri sul vulcano."),
    ],
    grapes: ["Nebbiolo", "Sangiovese", "Corvina", "Glera", "Nerello Mascalese", "Lambrusco"],
    best_months: [4, 5, 6, 9, 10],
    getting_there: "Tutte le esperienze si raggiungono in treno o in auto: nella scheda di ognuna trovi il punto di ritrovo e la stazione più vicina.",
  },
  es: {
    subtitle: "Il Tempranillo tra Rioja e Duero",
    intro: p(
      "La Spagna è il paese con più ettari di vigna al mondo. Al nord, la Rioja e la Ribera del Duero raccontano due anime del Tempranillo: elegante e longevo la prima, potente e scuro la seconda.",
      "Intorno, un paese di bodegas centenarie e architetture d’autore, di tapas e asador, con la Galizia dell’Albariño sull’Atlantico e l’Andalusia dello Sherry a sud.",
    ),
    zones: [
      zone("Rioja", 42.47, -2.45, "Cantine storiche a Haro, borghi medievali e Gran Reserva da lungo invecchiamento."),
      zone("Ribera del Duero", 41.65, -3.7, "Altopiano a 800 metri, Tempranillo intenso e castelli sul fiume."),
      zone("Rías Baixas", 42.4, -8.7, "Albariño sull’oceano, tra fiordi galiziani e frutti di mare."),
      zone("Priorat", 41.2, 0.75, "Vigne su terrazze di ardesia nera nell’entroterra di Tarragona."),
      zone("Jerez", 36.68, -6.13, "La patria dello Sherry, tra solera, flamenco e cavalli andalusi."),
    ],
    grapes: ["Tempranillo", "Garnacha", "Albariño", "Verdejo", "Palomino"],
    best_months: [4, 5, 6, 9, 10],
    getting_there: "Voli diretti dall’Italia per Bilbao e Madrid (circa 2 ore e mezza). Tra le regioni del nord ci si sposta in minibus.",
  },
  us: {
    subtitle: "California e Oregon, la costa ovest del vino",
    intro: p(
      "Nel 1976, al «Giudizio di Parigi», un Cabernet della Napa Valley batté i grandi Bordeaux in una degustazione alla cieca: da allora la costa ovest degli Stati Uniti è tra le regioni del vino più visitate al mondo.",
      "In California si alternano tenute storiche e cantine d’avanguardia, tra cucina farm-to-table e paesaggi oceanici; più a nord, l’Oregon ha trovato nel clima fresco della Willamette Valley la casa ideale per il Pinot Noir.",
    ),
    zones: [
      zone("Napa Valley", 38.5, -122.35, "Cabernet Sauvignon di Oakville e Rutherford, la valle più famosa d’America."),
      zone("Sonoma", 38.45, -122.75, "Più selvaggia e varia: Pinot Noir e Chardonnay fino all’oceano."),
      zone("Paso Robles", 35.63, -120.7, "Ranch e Zinfandel a metà strada tra San Francisco e Los Angeles."),
      zone("Willamette Valley", 45.1, -123.05, "Il Pinot Noir dell’Oregon, la «Borgogna d’America»."),
    ],
    grapes: ["Cabernet Sauvignon", "Pinot Noir", "Chardonnay", "Zinfandel"],
    best_months: [5, 6, 9, 10],
    getting_there: "Voli per San Francisco e Portland con uno scalo (circa 14 ore). Serve l’autorizzazione ESTA.",
  },
  ar: {
    subtitle: "Malbec d’altura ai piedi delle Ande",
    intro: p(
      "Il Malbec, quasi scomparso in Francia, ha trovato in Argentina la sua seconda patria: vigne tra i 900 e i 1.500 metri, sole forte, notti fredde e l’acqua dei ghiacciai portata dai canali.",
      "Mendoza è il cuore del vino argentino; più a nord, Salta coltiva le vigne più alte del mondo, mentre la Patagonia regala vini freschi in un paesaggio di deserto e fiumi.",
    ),
    zones: [
      zone("Luján de Cuyo", -33.04, -68.88, "La culla del Malbec, a sud della città di Mendoza."),
      zone("Valle de Uco", -33.6, -69.2, "Cantine d’autore oltre i mille metri, con le Ande innevate sullo sfondo."),
      zone("Cafayate (Salta)", -26.07, -65.98, "Torrontés aromatico e vigne fino a 3.000 metri."),
      zone("Patagonia", -38.95, -68.06, "Pinot Noir e Malbec freschi tra deserto e fiumi."),
    ],
    grapes: ["Malbec", "Torrontés", "Bonarda", "Cabernet Franc"],
    best_months: [2, 3, 4, 10, 11],
    getting_there: "Voli per Buenos Aires da Roma (circa 13 ore), poi volo interno per Mendoza (1 ora e 50).",
  },
  gb: {
    subtitle: "Le bollicine nate sul gesso",
    intro: p(
      "Il sud dell’Inghilterra poggia sullo stesso banco di gesso della Champagne. Con il clima che cambia, negli ultimi trent’anni le South Downs e il Kent sono diventate terra di metodi classici sorprendenti.",
      "Un viaggio tra country house, pub di campagna e scogliere bianche, a un’ora di treno da Londra.",
    ),
    zones: [
      zone("Sussex", 50.9, -0.4, "Le tenute pioniere dello spumante inglese sulle South Downs."),
      zone("Kent", 51.2, 0.8, "Il «giardino d’Inghilterra»: frutteti, cantine giovani e Canterbury."),
      zone("Hampshire", 51.05, -1.3, "Vigne sul gesso tra Winchester e le colline del sud."),
    ],
    grapes: ["Chardonnay", "Pinot Noir", "Pinot Meunier", "Bacchus"],
    best_months: [5, 6, 7, 9],
    getting_there: "Voli per Londra da molte città italiane (circa 2 ore e mezza); il Sussex è a un’ora di treno dalla capitale.",
  },
  hu: {
    subtitle: "Tokaj e i vini dei vulcani",
    intro: p(
      "Il Tokaji Aszú era il «vino dei re e re dei vini» delle corti europee: nasce in colline vulcaniche dove la muffa nobile concentra gli acini di Furmint, e matura in cantine scavate nel tufo.",
      "Oltre a Tokaj, l’Ungheria ha rossi speziati a Eger e Villány e bianchi minerali sulle colline intorno al lago Balaton.",
    ),
    zones: [
      zone("Tokaj", 48.12, 21.4, "Vini dolci e Furmint secchi, cantine-labirinto e borghi patrimonio UNESCO."),
      zone("Eger", 47.9, 20.37, "La città del «Sangue di toro», il rosso che difese il castello."),
      zone("Villány", 45.87, 18.45, "Il sud caldo: rossi strutturati e cantine moderne."),
      zone("Lago Balaton", 46.85, 17.7, "Bianchi minerali sulle colline vulcaniche affacciate sul lago."),
    ],
    grapes: ["Furmint", "Hárslevelű", "Kékfrankos", "Kadarka"],
    best_months: [5, 6, 9, 10],
    getting_there: "Voli diretti per Budapest (circa 1 ora e mezza); Tokaj è a tre ore d’auto dalla capitale.",
  },
  au: {
    subtitle: "Shiraz da viti centenarie",
    intro: p(
      "Il South Australia non è mai stato toccato dalla fillossera: qui crescono alcune delle viti più vecchie del mondo, piantate dagli immigrati tedeschi a metà Ottocento.",
      "Dalla Barossa a McLaren Vale, dalle Adelaide Hills alla lontana Margaret River, l’Australia unisce cantine di famiglia, ristoranti tra le vigne e una natura che non si dimentica.",
    ),
    zones: [
      zone("Barossa Valley", -34.53, 138.95, "Shiraz da viti centenarie e cantine delle famiglie pioniere."),
      zone("McLaren Vale", -35.22, 138.55, "Grenache e Shiraz affacciati sull’oceano."),
      zone("Adelaide Hills", -34.95, 138.8, "Il fresco dell’altura: Sauvignon, Chardonnay e Pinot Noir."),
      zone("Yarra Valley", -37.7, 145.45, "Spumanti e Pinot Noir a un’ora da Melbourne."),
      zone("Margaret River", -33.95, 115.07, "Cabernet e Chardonnay tra surf e foreste di karri."),
    ],
    grapes: ["Shiraz", "Cabernet Sauvignon", "Grenache", "Riesling", "Chardonnay"],
    best_months: [2, 3, 4, 10, 11],
    getting_there: "Voli per Adelaide con uno o due scali (circa 22 ore). Serve il visto elettronico ETA.",
  },
  nz: {
    subtitle: "Sauvignon Blanc e Pinot Noir ai confini del mondo",
    intro: p(
      "La Nuova Zelanda produce vino da poco più di cinquant’anni ed è già un riferimento: il Sauvignon Blanc di Marlborough ha conquistato il mondo, il Pinot Noir di Central Otago cresce tra montagne e laghi glaciali.",
      "Il paese si scopre al meglio on the road, tra cantine, parchi nazionali e la costa selvaggia dell’Isola del Sud.",
    ),
    zones: [
      zone("Marlborough", -41.52, 173.85, "Il Sauvignon Blanc più famoso del Nuovo Mondo, nella Wairau Valley."),
      zone("Central Otago", -45.03, 169.2, "Il Pinot Noir più a sud del mondo, tra Queenstown e Cromwell."),
      zone("Hawke’s Bay", -39.6, 176.8, "Rossi bordolesi e Syrah sull’Isola del Nord."),
      zone("Martinborough", -41.22, 175.46, "Piccolo borgo del Pinot Noir a un’ora da Wellington."),
    ],
    grapes: ["Sauvignon Blanc", "Pinot Noir", "Chardonnay", "Syrah"],
    best_months: [2, 3, 4, 11, 12],
    getting_there: "Voli per Christchurch o Queenstown con due scali (circa 26 ore). Serve l’autorizzazione elettronica NZeTA.",
  },
  fr: {
    subtitle: "Le regioni che hanno dato il nome ai vini del mondo",
    intro: p(
      "Champagne, Borgogna, Bordeaux: in Francia molti nomi di vino sono nomi di luoghi. È il paese che ha inventato l’idea di terroir, con vigneti classificati parcella per parcella da secoli.",
      "Stiamo preparando esperienze tra le grandi maison della Champagne, i climats della Borgogna e gli châteaux di Bordeaux.",
    ),
    zones: [
      zone("Champagne", 49.05, 4.0, "Le crayères di Reims e le maison di Épernay."),
      zone("Borgogna", 47.05, 4.85, "La Côte d’Or: Pinot Noir e Chardonnay parcella per parcella."),
      zone("Bordeaux", 44.85, -0.55, "Gli châteaux del Médoc e di Saint-Émilion."),
      zone("Valle del Rodano", 45.07, 4.83, "Syrah sulle terrazze di Hermitage e Côte-Rôtie."),
      zone("Alsazia", 48.15, 7.3, "Riesling e Gewürztraminer tra villaggi a graticcio."),
    ],
    grapes: ["Pinot Noir", "Chardonnay", "Cabernet Sauvignon", "Merlot", "Syrah"],
    best_months: [5, 6, 9, 10],
    getting_there: "Treni ad alta velocità da Torino e Milano per Lione e Parigi; voli diretti per Bordeaux.",
  },
  de: {
    subtitle: "Riesling sulle rive dei fiumi",
    intro: p(
      "Le vigne tedesche seguono i fiumi: sui pendii vertiginosi della Mosella e lungo il Reno nasce il Riesling, capace di passare dal secco tagliente al dolce più raro.",
      "Stiamo preparando esperienze tra i castelli del Reno, le cantine della Mosella e i villaggi della Pfalz.",
    ),
    zones: [
      zone("Mosella", 49.92, 7.05, "Le vigne più ripide d’Europa, su ardesia blu."),
      zone("Rheingau", 50.0, 8.05, "Abbazie e castelli sul Reno, Riesling di lunga tradizione."),
      zone("Pfalz", 49.35, 8.15, "La «Toscana tedesca»: clima mite, mandorli e Pinot Nero."),
    ],
    grapes: ["Riesling", "Spätburgunder", "Silvaner", "Müller-Thurgau"],
    best_months: [5, 6, 9, 10],
    getting_there: "Voli diretti per Francoforte (circa 1 ora e mezza): Rheingau e Mosella sono a una o due ore d’auto.",
  },
};

const categories = await wc("GET", "products/categories?per_page=100&hide_empty=false");
let missingField = false;
for (const [code, content] of Object.entries(CONTENT)) {
  const category = categories.find((c) => c.slug === code);
  if (!category) {
    console.log(`  ? ${code}: category not found`);
    continue;
  }
  if (category.destination === undefined) {
    missingField = true;
    console.log(`  ! ${code}: no "destination" field (Next Tours ≥ 0.2.0 not active yet)`);
    continue;
  }
  const current = category.destination ?? {};
  // Keep what editors already wrote, unless --force
  const update = Object.fromEntries(
    Object.entries(content).filter(([key]) => {
      const value = current[key];
      return FORCE || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    }),
  );
  if (Object.keys(update).length === 0) {
    console.log(`  = ${code}`);
    continue;
  }
  await wc("PUT", `products/categories/${category.id}`, { destination: update });
  console.log(`  ${DRY ? "[dry-run] " : ""}~ ${code}: ${Object.keys(update).join(", ")}`);
}
if (missingField) process.exitCode = 1;
console.log(DRY ? "Dry run: nothing changed." : "Done.");
