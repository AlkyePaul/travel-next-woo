import { getLocale, getTranslations } from "next-intl/server";

import { getDestinations } from "@/lib/destinations";
import { cn } from "@/lib/utils";
import { COUNTRIES, LENS, WORLD, type DotGrid } from "./map-data";
import { groupForContinent, mapGroups, wineCountries } from "./countries";
import { WineMapInteractive, type MapCountry } from "./wine-map-interactive";

// Markers closer than this to the lens edge (degrees) stay on the world map
const LENS_MARGIN = 1.5;

/** Degrees → % of the world map box (equirectangular, same crop as the dots). */
function worldPercent(lat: number, lon: number) {
  return {
    x: ((lon - WORLD.lonMin) / (WORLD.lonMax - WORLD.lonMin)) * 100,
    y: ((WORLD.latMax - lat) / (WORLD.latMax - WORLD.latMin)) * 100,
  };
}

/** Degrees → % of the lens box, or null when outside the lens circle. */
function lensPercent(lat: number, lon: number) {
  const dx = lon - LENS.center.lon;
  const dy = LENS.center.lat - lat;
  if (Math.hypot(dx, dy) > LENS.radius - LENS_MARGIN) return null;
  return { x: 50 + (dx / (2 * LENS.radius)) * 100, y: 50 + (dy / (2 * LENS.radius)) * 100 };
}

type Status = "active" | "known";

/** One SVG of dots: other land in one path, each shown country in its own (for highlighting). */
function DotMap({
  grid,
  status,
  className,
}: {
  grid: DotGrid;
  status: Map<string, Status>;
  className?: string;
}) {
  const other = Object.entries(grid.dots)
    .filter(([code]) => !status.has(code))
    .map(([, d]) => d)
    .join("");
  const shown = Object.entries(grid.dots).filter(([code]) => status.has(code));

  return (
    <svg
      aria-hidden
      viewBox={`-0.5 -0.5 ${grid.cols} ${grid.rows}`}
      preserveAspectRatio="none"
      fill="none"
      stroke="currentColor"
      strokeWidth={0.62}
      strokeLinecap="round"
      className={cn("absolute inset-0 size-full", className)}
    >
      <path d={other} className="text-foreground/40" />
      {shown.map(([code, d]) => (
        <path
          key={code}
          d={d}
          data-cc={code}
          className={cn(
            "transition-colors",
            status.get(code) === "active" ? "text-primary/75" : "text-accent/80",
          )}
        />
      ))}
    </svg>
  );
}

/**
 * Stylised dotted world map of the wine countries, with a magnifier lens on Europe
 * and a legend of plain links. Counts come from the WooCommerce destination
 * categories; the dots are rendered here, so the map data never reaches the client bundle.
 */
export async function WineMap({ className }: { className?: string }) {
  const [t, locale, destinations] = await Promise.all([
    getTranslations("WineMap"),
    getLocale(),
    getDestinations(),
  ]);
  const regionNames = new Intl.DisplayNames([locale], { type: "region" });

  // Listed wine countries plus any country that has a destination category
  const codes = new Set([...Object.keys(wineCountries), ...destinations.keys()]);
  const status = new Map<string, Status>();
  const countries: MapCountry[] = [];

  for (const code of codes) {
    const data = COUNTRIES[code];
    if (!data) continue; // not a country on the map
    const config = wineCountries[code] ?? {};
    const group = config.group ?? groupForContinent(data.continent);
    if (!group) continue;

    const destination = destinations.get(code);
    const count = destination?.count ?? 0;
    const [lat, lon] = config.anchor ?? data.anchor;
    const lens = lensPercent(lat, lon);

    status.set(code, count > 0 ? "active" : "known");
    countries.push({
      code,
      name: regionNames.of(code) ?? code,
      group,
      count,
      countLabel: count > 0 ? t("experiences", { count }) : t("comingSoon"),
      href: destination ? `/shop/category/${destination.slug}` : undefined,
      world: worldPercent(lat, lon),
      lens,
    });
  }

  countries.sort((a, b) => a.name.localeCompare(b.name, locale));

  // Lens at rest: same scale as the world map, so it sits exactly over Europe
  const lensRest = {
    ...worldPercent(LENS.center.lat, LENS.center.lon),
    width: ((2 * LENS.radius) / (WORLD.lonMax - WORLD.lonMin)) * 100,
  };

  return (
    <WineMapInteractive
      className={className}
      countries={countries}
      groups={mapGroups.map((id) => ({ id, label: t(`groups.${id}`) }))}
      aspectRatio={WORLD.cols / WORLD.rows}
      lensRest={lensRest}
      lensMap={<DotMap grid={LENS} status={status} />}
      labels={{
        cta: t("cta"),
        legend: t("legend"),
        lensName: t("lens.name"),
        lensOpen: t("lens.open"),
        lensClose: t("lens.close"),
      }}
    >
      <DotMap grid={WORLD} status={status} />
    </WineMapInteractive>
  );
}
