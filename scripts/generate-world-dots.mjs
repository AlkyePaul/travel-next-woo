// Generates components/wine-map/map-data.ts: the dotted world map used by <WineMap>.
//
// Every land dot is tagged with the ISO 3166-1 alpha-2 code of its country, so the
// map can colour any country (the same codes are the WooCommerce destination slugs).
// Two grids: the world at 2°, and a finer 1° grid for the Europe magnifier lens.
// Also emitted for every country: an anchor point (centroid of its largest polygon)
// and its continent.
//
// The output is committed, so this only needs to run again to change grids or crop.
// Its dependencies are not project dependencies; install them anywhere and point MAP_DEPS there:
//
//   npm i --prefix <dir> d3-geo@3 topojson-client@3 world-atlas@2 i18n-iso-countries@7 countries-list@3
//   MAP_DEPS=<dir> node scripts/generate-world-dots.mjs
//
// Country shapes: Natural Earth 1:50m via world-atlas (public domain).

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";

const depsDir = process.env.MAP_DEPS;
if (!depsDir) throw new Error("Set MAP_DEPS to the folder where the dependencies are installed");
const require = createRequire(path.resolve(depsDir, "package.json"));

const { geoContains, geoBounds, geoArea, geoCentroid } = require("d3-geo");
const { feature } = require("topojson-client");
const isoCountries = require("i18n-iso-countries");
const { countries: countryInfo } = require("countries-list");
const atlas = require("world-atlas/countries-50m.json");

// World crop (equirectangular): whole longitude range, no Antarctica or high Arctic.
const WORLD = { lonMin: -180, lonMax: 180, latMax: 75, latMin: -56, step: 2 };
// Europe lens: a circle of LENS.radius degrees around LENS.center, on a finer grid.
const LENS = { center: { lat: 46, lon: 18.5 }, radius: 30, step: 1 };

// --- Countries with code, bounding box (for a quick pre-check) ---------------
const countries = feature(atlas, atlas.objects.countries)
  .features.map((f) => {
    const code = f.id ? isoCountries.numericToAlpha2(f.id) : undefined;
    if (!code) return null;
    const [[w, s], [e, n]] = geoBounds(f);
    return { code, feature: f, box: { w, s, e, n } };
  })
  .filter(Boolean);

function inBox(box, lon, lat) {
  if (lat < box.s || lat > box.n) return false;
  return box.w <= box.e ? lon >= box.w && lon <= box.e : lon >= box.w || lon <= box.e; // antimeridian
}

/** Country code at a point, "" for land without a code, null for sea. */
function countryAt(lon, lat) {
  for (const c of countries) {
    if (inBox(c.box, lon, lat) && geoContains(c.feature, [lon, lat])) return c.code;
  }
  return null;
}

/** Dots of a lon/lat grid, grouped by country code ("" = other land). */
function grid({ lonMin, latMax, cols, rows, step, keep = () => true }) {
  const groups = {};
  for (let y = 0; y < rows; y++) {
    const lat = latMax - step * (y + 0.5);
    for (let x = 0; x < cols; x++) {
      const lon = lonMin + step * (x + 0.5);
      if (!keep(x, y)) continue;
      const code = countryAt(lon, lat);
      if (code === null) continue;
      (groups[code] ??= []).push(`M${x} ${y}h0`);
    }
  }
  return Object.fromEntries(
    Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, parts]) => [code, parts.join("")]),
  );
}

const worldCols = Math.round((WORLD.lonMax - WORLD.lonMin) / WORLD.step);
const worldRows = Math.round((WORLD.latMax - WORLD.latMin) / WORLD.step);
const worldDots = grid({
  lonMin: WORLD.lonMin,
  latMax: WORLD.latMax,
  cols: worldCols,
  rows: worldRows,
  step: WORLD.step,
});

const lensSize = Math.round((2 * LENS.radius) / LENS.step);
const lensDots = grid({
  lonMin: LENS.center.lon - LENS.radius,
  latMax: LENS.center.lat + LENS.radius,
  cols: lensSize,
  rows: lensSize,
  step: LENS.step,
  // Only cells inside the circle (plus a margin for the round edge)
  keep: (x, y) => Math.hypot(x + 0.5 - lensSize / 2, y + 0.5 - lensSize / 2) <= lensSize / 2 + 0.5,
});

// --- Anchor + continent for every country -------------------------------------
const round = (n) => Math.round(n * 10) / 10;
// min(a, 4π − a): a ring wound the wrong way reports the area of the rest of the globe
const area = (g) => Math.min(geoArea(g), 4 * Math.PI - geoArea(g));
const meta = {};
const metaArea = {};
for (const { code, feature: f } of countries) {
  // Centroid of the largest polygon, so overseas territories don't drag it away.
  // Several features can share a code (e.g. small islands): the largest one wins.
  const polygons =
    f.geometry.type === "MultiPolygon"
      ? f.geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }))
      : [f.geometry];
  const largest = polygons.reduce((a, b) => (area(b) > area(a) ? b : a));
  if ((metaArea[code] ?? -1) >= area(largest)) continue;
  metaArea[code] = area(largest);
  const [lon, lat] = geoCentroid(largest);
  meta[code] = { anchor: [round(lat), round(lon)], continent: countryInfo[code]?.continent ?? "" };
}

const out = `// Generated by scripts/generate-world-dots.mjs — do not edit by hand.
// Natural Earth country shapes (public domain), equirectangular projection.
// Dot paths are grouped by ISO 3166-1 alpha-2 code ("" = land without a code).

export interface DotGrid {
  cols: number;
  rows: number;
  /** Dot centres in grid units (x = column, y = row), one path per country. */
  dots: Record<string, string>;
}

export const WORLD: DotGrid & {
  lonMin: number; lonMax: number; latMin: number; latMax: number; step: number;
} = ${JSON.stringify({ ...WORLD, cols: worldCols, rows: worldRows, dots: worldDots })};

export const LENS: DotGrid & {
  center: { lat: number; lon: number }; radius: number; step: number;
} = ${JSON.stringify({ ...LENS, cols: lensSize, rows: lensSize, dots: lensDots })};

/** Every country: anchor [lat, lon] (centroid of its largest polygon) and continent code. */
export const COUNTRIES: Record<string, { anchor: [number, number]; continent: string }> =
  ${JSON.stringify(meta)};
`;

const target = path.resolve(import.meta.dirname, "../components/wine-map/map-data.ts");
writeFileSync(target, out);
const count = (dots) => Object.values(dots).reduce((n, p) => n + p.split("M").length - 1, 0);
console.log(
  `world ${count(worldDots)} dots, lens ${count(lensDots)} dots, ${Object.keys(meta).length} countries, ` +
    `${(out.length / 1024).toFixed(1)} KB -> ${target}`,
);
