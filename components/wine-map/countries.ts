// Wine countries always shown on <WineMap>, keyed by ISO 3166-1 alpha-2 code.
// The same code, lowercase, is the slug of the country's WooCommerce category
// (child of "destinazioni"): when that category has products, the country shows
// its experience count and links to /shop/category/{code}. Countries listed here
// without products are shown anyway, without a count. A destination category for
// a country not listed here appears on the map automatically.
//
// `anchor` [lat, lon] moves the marker to the wine area (default: the country's centroid);
// `group` overrides the legend group (default: from the continent).

export type MapGroup = "europe" | "americas" | "africa" | "asia" | "oceania";

export const mapGroups: MapGroup[] = ["europe", "americas", "africa", "asia", "oceania"];

export const wineCountries: Record<string, { anchor?: [number, number]; group?: MapGroup }> = {
  // Europe
  IT: {},
  FR: {},
  ES: {},
  PT: {},
  DE: {},
  HU: { anchor: [47.6, 19.8] },
  GB: { anchor: [52.2, -1.2] },
  // Asia
  GE: { group: "asia" }, // outside the Western Europe lens: a spot on the world map
  // Americas
  US: { anchor: [41.5, -121.5] }, // West Coast: California, Oregon
  AR: { anchor: [-34.5, -65] },
  CL: { anchor: [-34, -71.4] },
  // Africa
  ZA: { anchor: [-32.5, 21] }, // Western Cape
  // Oceania
  AU: { anchor: [-31, 137] }, // South Australia
  NZ: {},
};

/** Legend group from the continent code in map-data. */
export function groupForContinent(continent: string): MapGroup | null {
  switch (continent) {
    case "EU":
      return "europe";
    case "NA":
    case "SA":
      return "americas";
    case "AF":
      return "africa";
    case "AS":
      return "asia";
    case "OC":
      return "oceania";
    default:
      return null;
  }
}
