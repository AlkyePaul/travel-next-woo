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
// Western Europe only (Portugal to Hungary, Sicily to Scotland); Georgia stays on the world map.
const LENS = { center: { lat: 45, lon: 6 }, radius: 20, step: 1 };

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

// --- Detailed map of each wine country (destination pages) ----------------------
// Long side ~DETAIL_CELLS dots; longitude step widened by 1/cos(lat) so shapes aren't stretched.
const DETAIL_COUNTRIES = ["IT", "FR", "ES", "PT", "DE", "AT", "HU", "GB", "GE", "GR", "SI", "HR", "US", "CA", "AR", "CL", "UY", "ZA", "AU", "NZ"];
const DETAIL_CELLS = 46;

function detailBounds(f) {
  // Main polygon plus nearby islands worth showing (Sicily, Tasmania, North Island…);
  // far territories (Alaska, Hawaii, overseas departments) are left out.
  const polygons =
    f.geometry.type === "MultiPolygon"
      ? f.geometry.coordinates.map((coordinates) => ({ type: "Polygon", coordinates }))
      : [f.geometry];
  const largest = polygons.reduce((a, b) => (area(b) > area(a) ? b : a));
  const [cx, cy] = geoCentroid(largest);
  const [[w, s], [e, n]] = geoBounds(largest);
  const reach = 0.6 * Math.hypot(e - w, n - s) + 3; // degrees from the main polygon's centre
  const kept = polygons.filter((p) => {
    if (area(p) < area(largest) * 0.005) return false;
    const [x, y] = geoCentroid(p);
    return Math.hypot(x - cx, y - cy) < reach;
  });
  const boxes = kept.map((p) => geoBounds(p));
  return {
    lonMin: Math.min(...boxes.map((b) => b[0][0])),
    lonMax: Math.max(...boxes.map((b) => b[1][0])),
    latMin: Math.min(...boxes.map((b) => b[0][1])),
    latMax: Math.max(...boxes.map((b) => b[1][1])),
  };
}

const details = {};
for (const code of DETAIL_COUNTRIES) {
  const entry = countries
    .filter((c) => c.code === code)
    .reduce((a, b) => (!a || area(b.feature) > area(a.feature) ? b : a), null);
  if (!entry) continue;
  const b = detailBounds(entry.feature);
  const pad = 0.4;
  b.lonMin -= pad; b.lonMax += pad; b.latMin -= pad; b.latMax += pad;
  const latStep = Math.max(b.latMax - b.latMin, (b.lonMax - b.lonMin) * Math.cos(((b.latMin + b.latMax) / 2) * Math.PI / 180)) / DETAIL_CELLS;
  const lonStep = latStep / Math.cos(((b.latMin + b.latMax) / 2) * Math.PI / 180);
  const cols = Math.ceil((b.lonMax - b.lonMin) / lonStep);
  const rows = Math.ceil((b.latMax - b.latMin) / latStep);
  // Snap the box to whole cells so positions map exactly
  b.lonMax = b.lonMin + cols * lonStep;
  b.latMin = b.latMax - rows * latStep;
  const parts = [];
  for (let y = 0; y < rows; y++) {
    const lat = b.latMax - latStep * (y + 0.5);
    for (let x = 0; x < cols; x++) {
      const lon = b.lonMin + lonStep * (x + 0.5);
      if (geoContains(entry.feature, [lon, lat])) parts.push(`M${x} ${y}h0`);
    }
  }
  const r = (n) => Math.round(n * 1000) / 1000;
  details[code] = {
    lonMin: r(b.lonMin), lonMax: r(b.lonMax), latMin: r(b.latMin), latMax: r(b.latMax),
    cols, rows, path: parts.join(""),
  };
}

const detailOut = `// Generated by scripts/generate-world-dots.mjs — do not edit by hand.
// One dotted map per wine country (Natural Earth, public domain), for the destination pages.
// Each dot is a grid cell; lon/lat → % with the bounds below (equirectangular box).

export interface CountryDetailMap {
  lonMin: number; lonMax: number; latMin: number; latMax: number;
  cols: number; rows: number;
  path: string;
}

export const COUNTRY_MAPS: Record<string, CountryDetailMap> = ${JSON.stringify(details)};
`;
const detailTarget = path.resolve(import.meta.dirname, "../components/wine-map/country-maps.ts");
writeFileSync(detailTarget, detailOut);
console.log(`${Object.keys(details).length} country maps, ${(detailOut.length / 1024).toFixed(1)} KB -> ${detailTarget}`);

const target = path.resolve(import.meta.dirname, "../components/wine-map/map-data.ts");
writeFileSync(target, out);
const count = (dots) => Object.values(dots).reduce((n, p) => n + p.split("M").length - 1, 0);
console.log(
  `world ${count(worldDots)} dots, lens ${count(lensDots)} dots, ${Object.keys(meta).length} countries, ` +
    `${(out.length / 1024).toFixed(1)} KB -> ${target}`,
);
