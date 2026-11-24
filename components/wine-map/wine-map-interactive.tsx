"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ArrowRight, X, ZoomIn } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { MapGroup } from "./countries";

export interface MapCountry {
  /** ISO 3166-1 alpha-2. */
  code: string;
  name: string;
  group: MapGroup;
  /** Experiences on sale; 0 = known wine country without experiences yet. */
  count: number;
  /** "3 esperienze" or "coming soon". */
  countLabel: string;
  href?: string;
  /** Position in % of the world map box. */
  world: { x: number; y: number };
  /** Position in % of the lens box, when the country sits inside the lens. */
  lens: { x: number; y: number } | null;
}

interface WineMapInteractiveProps {
  countries: MapCountry[];
  groups: { id: MapGroup; label: string }[];
  aspectRatio: number;
  /** Lens at rest, in % of the world map box (centre and width). */
  lensRest: { x: number; y: number; width: number };
  /** Dots inside the lens (server-rendered). */
  lensMap: ReactNode;
  labels: {
    cta: string;
    legend: string;
    lensName: string;
    lensOpen: string;
    lensClose: string;
  };
  /** The world dots (server-rendered). */
  children: ReactNode;
  className?: string;
  /** Wrapper of the map (full width, capped on very wide screens). */
  mapClassName?: string;
  /** Full-width band holding the country list, under the map. */
  legendClassName?: string;
  /**
   * "zoom": the lens sits over Europe at scale and grows on hover/tap.
   * "fixed": Europe is always shown enlarged in a circle centred on it, sticking
   * out above the map, with no zoom animation.
   */
  lensMode?: "zoom" | "fixed";
}

/** Delay before a mouse hover opens/closes the lens, so passing over it doesn't flicker. */
const HOVER_DELAY = 180;

export function WineMapInteractive({
  countries,
  groups,
  aspectRatio,
  lensRest,
  lensMap,
  labels,
  children,
  className,
  mapClassName,
  legendClassName,
  lensMode = "zoom",
}: WineMapInteractiveProps) {
  const fixed = lensMode === "fixed";
  const scope = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  // Country highlighted on map + legend (hover, keyboard focus or tap)
  const [activeCode, setActiveCode] = useState<string | null>(null);
  // Lens opened by a tap/click (stays open) or by hovering it with the mouse
  const [lensPinned, setLensPinned] = useState(false);
  const [lensHovered, setLensHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const active = countries.find((c) => c.code === activeCode);
  const lensOpen = fixed || lensPinned || lensHovered || Boolean(active?.lens);
  const inLens = countries.filter((c) => c.lens);
  const lensTotal = inLens.reduce((sum, c) => sum + c.count, 0);

  const closeAll = () => {
    clearTimeout(hoverTimer.current);
    setActiveCode(null);
    setLensPinned(false);
    setLensHovered(false);
  };

  // Tapping outside or pressing Escape closes callout and lens
  useEffect(() => {
    if (!activeCode && !lensOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) closeAll();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [activeCode, lensOpen]);

  useEffect(() => () => clearTimeout(hoverTimer.current), []);

  const setLensHoverLater = (value: boolean) => {
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setLensHovered(value), HOVER_DELAY);
  };

  // Mouse hover previews a country; touch relies on tap (click)
  const hoverProps = (code: string) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") setActiveCode(code);
    },
    onPointerLeave: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse")
        setActiveCode((cur) => (cur === code ? null : cur));
    },
  });

  // Keyboard focus highlights; mouse/touch focus is handled by hover/click
  const onFocusVisible =
    (code: string) => (e: React.FocusEvent<HTMLElement>) => {
      if (e.currentTarget.matches(":focus-visible")) setActiveCode(code);
    };

  const renderMarker = (
    country: MapCountry,
    pos: { x: number; y: number },
    interactive: boolean,
  ) => {
    const isActive = country.code === activeCode;
    // Keep the callout inside the box: below markers near the top, flipped near the edges
    const below = pos.y < 35;
    const align = pos.x > 70 ? "right" : pos.x < 25 ? "left" : "center";

    return (
      <div
        key={country.code}
        className={cn("absolute", isActive ? "z-20" : "z-10")}
        style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        {...(interactive ? hoverProps(country.code) : {})}
      >
        <button
          type="button"
          aria-label={`${country.name}: ${country.countLabel}`}
          aria-expanded={isActive}
          tabIndex={interactive ? undefined : -1}
          onClick={() => setActiveCode(country.code)}
          onFocus={onFocusVisible(country.code)}
          className={cn(
            "group absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full outline-none",
            !interactive && "pointer-events-none",
          )}
        >
          {country.count > 0 ? (
            <span
              className={cn(
                "flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold tabular-nums text-primary-foreground shadow-sm ring-2 ring-background transition-transform sm:h-6 sm:min-w-6 sm:text-xs",
                "group-hover:scale-110 group-focus-visible:ring-ring",
                isActive && "scale-125",
              )}
            >
              {country.count}
            </span>
          ) : (
            <span
              className={cn(
                "size-2.5 rounded-full border-2 border-accent bg-background transition-transform sm:size-3",
                "group-hover:scale-125 group-focus-visible:ring-2 group-focus-visible:ring-ring",
                isActive && "scale-150",
              )}
            />
          )}
        </button>

        {isActive && interactive && (
          <div
            className={cn(
              "absolute z-30 w-max max-w-56",
              below ? "top-3 pt-2" : "bottom-3 pb-2",
              align === "center" && "-translate-x-1/2",
              align === "right" && "-translate-x-full",
            )}
          >
            <div className="rounded-md border bg-card px-4 py-3 text-left shadow-lg">
              <p className="font-display text-xl leading-tight">
                {country.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {country.countLabel}
              </p>
              {country.href && (
                <Link
                  href={country.href}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  {labels.cta}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  // Open lens: --lens-open wide (set per breakpoint on the root), centred vertically,
  // horizontally as close to Europe as fits. At rest it sits exactly over Europe.
  const lensStyle: CSSProperties = lensOpen
    ? {
        width: "var(--lens-open)",
        left: `clamp(calc(var(--lens-open) / 2), ${lensRest.x}%, calc(100% - var(--lens-open) / 2))`,
        top: "50%",
      }
    : {
        width: `${lensRest.width}%`,
        left: `${lensRest.x}%`,
        top: `${lensRest.y}%`,
      };

  const lensContent = (
    <>
      <div
        className={cn(
          "absolute inset-0 overflow-hidden rounded-full bg-background transition-shadow duration-500",
          lensOpen
            ? "border-2 border-primary/60 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.5)]"
            : "border border-primary/50",
        )}
      >
        {lensMap}
      </div>

      {!lensOpen && (
        <button
          type="button"
          aria-label={labels.lensOpen}
          aria-expanded={false}
          onClick={() => setLensPinned(true)}
          className="absolute inset-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      )}

      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          lensOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {inLens.map((c) => renderMarker(c, c.lens!, lensOpen))}
      </div>

      {lensOpen && !fixed && (
        <button
          type="button"
          aria-label={labels.lensClose}
          onClick={closeAll}
          className="absolute right-[12%] top-[6%] z-40 flex size-8 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}

      {/* Name tag under the small lens (zoom mode only; the fixed lens has none) */}
      {!lensOpen && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-full mt-1 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium shadow-sm sm:text-xs"
        >
          <ZoomIn className="size-3 text-primary" />
          {labels.lensName}
          {lensTotal > 0 && (
            <span className="tabular-nums text-primary">{lensTotal}</span>
          )}
        </span>
      )}
    </>
  );

  const lens = fixed ? (
    // Always enlarged, on Western Europe but pushed west into the Atlantic, so it
    // stays clear of Georgia (world marker at x ≈ 62%) and, below, of South Africa
    // and South America. It sticks out above the map (room is reserved by the map's
    // top margin, see below). `left` is in % of the map width, `top` in % of its
    // height (map ratio ≈ 2.73, Western Europe at ≈ 23%). The wider the circle, the
    // further west it has to go.
    <div className="absolute left-[42%] top-[20%] z-30 aspect-square w-[36%] -translate-x-1/2 -translate-y-1/2 sm:left-[45%] sm:top-[22%] sm:w-[30%] lg:left-[47.5%] lg:w-[24%]">
      {lensContent}
    </div>
  ) : (
    <div
      className="absolute z-30 aspect-square -translate-x-1/2 -translate-y-1/2 transition-[width,left,top] duration-500 ease-out motion-reduce:transition-none"
      style={lensStyle}
      onPointerEnter={(e) =>
        e.pointerType === "mouse" && setLensHoverLater(true)
      }
      onPointerLeave={(e) =>
        e.pointerType === "mouse" && setLensHoverLater(false)
      }
    >
      {lensContent}
    </div>
  );

  return (
    <div
      ref={rootRef}
      data-wine-map={scope}
      className={cn(
        // Clip sideways only, so callouts can still overflow above/below the map
        "overflow-x-clip [--lens-open:92%] sm:[--lens-open:62%] lg:[--lens-open:44%]",
        className,
      )}
    >
      {/* Highlight the dots of the active country, on the map and in the lens */}
      {activeCode && (
        <style>{`[data-wine-map="${scope}"] path[data-cc="${activeCode}"]{color:var(--primary)}`}</style>
      )}
      {/* Map: edge to edge on every screen, capped on very wide ones */}
      <div
        className={cn(
          "mx-auto w-full max-w-screen-2xl",
          mapClassName,
        )}
      >
        <div
          className={cn(
            "relative w-full",
            // Room (in % of the width) for the part of the fixed lens above the map:
            // lens radius minus Europe's distance from the top
            fixed && "mt-[11%] sm:mt-[7%] lg:mt-[4%]",
          )}
          style={{ aspectRatio }}
        >
          {children}

          {countries
            .filter((c) => !c.lens)
            .map((c) => renderMarker(c, c.world, true))}

          {lens}
        </div>
      </div>

      {/* Legend: the main way to pick a country, grouped by continent */}
      <div className={legendClassName}>
        <nav
          aria-label={labels.legend}
          className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 sm:grid-cols-3 sm:px-8 lg:flex justify-between"
        >
          {groups.map((group) => {
            // Countries with experiences first, each part alphabetical (input is sorted)
            const items = countries
              .filter((c) => c.group === group.id)
              .sort((a, b) => Number(b.count > 0) - Number(a.count > 0));
            if (items.length === 0) return null;
            return (
              <div key={group.id}>
                <h4 className="border-b border-foreground/15 pb-2 text-base font-semibold uppercase tracking-widest text-muted-foreground sm:text-base">
                  {group.label}
                </h4>
                <ul className="mt-3 space-y-1">
                  {items.map((c) => {
                    const highlighted = c.code === activeCode;
                    const content = (
                      <>
                        <span className="min-w-0 flex-1 font-display text-xl leading-tight md:text-2xl">
                          {c.name}
                        </span>
                        {c.count > 0 ? (
                          <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
                            {c.count}
                          </span>
                        ) : (
                          <span
                            aria-hidden
                            className="size-2.5 shrink-0 rounded-full border-2 border-accent"
                          />
                        )}
                      </>
                    );
                    return (
                      <li key={c.code}>
                        {c.href ? (
                          <Link
                            href={c.href}
                            {...hoverProps(c.code)}
                            onFocus={onFocusVisible(c.code)}
                            className={cn(
                              "flex items-center gap-3 py-1 underline-offset-4 transition-colors hover:text-primary hover:underline",
                              highlighted && "text-primary",
                            )}
                          >
                            {content}
                          </Link>
                        ) : (
                          <span
                            {...hoverProps(c.code)}
                            className={cn(
                              "flex items-center gap-3 py-1 text-muted-foreground transition-colors",
                              highlighted && "text-foreground",
                            )}
                          >
                            {content}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
