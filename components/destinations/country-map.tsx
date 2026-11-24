import { COUNTRY_MAPS } from "@/components/wine-map/country-maps";
import type { DestinationZone } from "@/lib/woocommerce.d";
import { cn } from "@/lib/utils";

/**
 * Dotted map of one country with its wine zones as numbered markers
 * (numbers match the zone list). Renders nothing for countries without a detail map.
 */
export function CountryMap({
  code,
  zones,
  className,
}: {
  code: string;
  zones: DestinationZone[];
  className?: string;
}) {
  const map = COUNTRY_MAPS[code.toUpperCase()];
  if (!map) return null;

  const markers = zones
    .map((zone, i) => ({ zone, n: i + 1, lat: parseFloat(zone.lat), lng: parseFloat(zone.lng) }))
    .filter(
      (m) =>
        Number.isFinite(m.lat) &&
        Number.isFinite(m.lng) &&
        m.lng >= map.lonMin &&
        m.lng <= map.lonMax &&
        m.lat >= map.latMin &&
        m.lat <= map.latMax,
    );

  return (
    <div className={cn("relative w-full", className)} style={{ aspectRatio: map.cols / map.rows }}>
      <svg
        aria-hidden
        viewBox={`-0.5 -0.5 ${map.cols} ${map.rows}`}
        preserveAspectRatio="none"
        className="absolute inset-0 size-full text-primary/45"
      >
        <path
          d={map.path}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.62}
          strokeLinecap="round"
        />
      </svg>
      {markers.map(({ zone, n, lat, lng }) => (
        <span
          key={n}
          title={zone.name}
          className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-xs font-semibold tabular-nums text-primary-foreground shadow-sm ring-2 ring-card"
          style={{
            left: `${((lng - map.lonMin) / (map.lonMax - map.lonMin)) * 100}%`,
            top: `${((map.latMax - lat) / (map.latMax - map.latMin)) * 100}%`,
          }}
        >
          {n}
        </span>
      ))}
    </div>
  );
}
