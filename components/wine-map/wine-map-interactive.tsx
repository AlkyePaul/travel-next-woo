"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
  labels: { cta: string; legend: string; lensName: string; lensOpen: string; lensClose: string };
  /** The world dots (server-rendered). */
  children: ReactNode;
  className?: string;
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
}: WineMapInteractiveProps) {
  const scope = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const rootRef = useRef<HTMLDivElement>(null);
  // Country highlighted on map + legend (hover, keyboard focus or tap)
  const [activeCode, setActiveCode] = useState<string | null>(null);
  // Lens opened by a tap/click (stays open) or by hovering it with the mouse
  const [lensPinned, setLensPinned] = useState(false);
  const [lensHovered, setLensHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const active = countries.find((c) => c.code === activeCode);
  const lensOpen = lensPinned || lensHovered || Boolean(active?.lens);
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
      if (e.pointerType === "mouse") setActiveCode((cur) => (cur === code ? null : cur));
    },
  });

  // Keyboard focus highlights; mouse/touch focus is handled by hover/click
  const onFocusVisible = (code: string) => (e: React.FocusEvent<HTMLElement>) => {
    if (e.currentTarget.matches(":focus-visible")) setActiveCode(code);
  };

  const renderMarker = (country: MapCountry, pos: { x: number; y: number }, interactive: boolean) => {
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
              <p className="font-display text-xl leading-tight">{country.name}</p>
              <p className="text-sm text-muted-foreground">{country.countLabel}</p>
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
    : { width: `${lensRest.width}%`, left: `${lensRest.x}%`, top: `${lensRest.y}%` };

  return (
    <div
      ref={rootRef}
      data-wine-map={scope}
      className={cn(
        "grid gap-10 lg:grid-cols-[1fr_15rem] lg:items-center lg:gap-12",
        "[--lens-open:92%] sm:[--lens-open:62%] lg:[--lens-open:44%]",
        className,
      )}
    >
      {/* Highlight the dots of the active country, on the map and in the lens */}
      {activeCode && (
        <style>{`[data-wine-map="${scope}"] path[data-cc="${activeCode}"]{color:var(--primary)}`}</style>
      )}

      {/* Map */}
      <div className="relative w-full" style={{ aspectRatio }}>
        {children}

        {countries.filter((c) => !c.lens).map((c) => renderMarker(c, c.world, true))}

        {/* Europe magnifier */}
        <div
          className="absolute z-30 aspect-square -translate-x-1/2 -translate-y-1/2 transition-[width,left,top] duration-500 ease-out motion-reduce:transition-none"
          style={lensStyle}
          onPointerEnter={(e) => e.pointerType === "mouse" && setLensHoverLater(true)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setLensHoverLater(false)}
        >
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

          {lensOpen ? (
            <button
              type="button"
              aria-label={labels.lensClose}
              onClick={closeAll}
              className="absolute right-[12%] top-[6%] z-40 flex size-8 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-sm hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : (
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-full mt-1 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full border bg-card px-2 py-0.5 text-[11px] font-medium shadow-sm sm:text-xs"
            >
              <ZoomIn className="size-3 text-primary" />
              {labels.lensName}
              {lensTotal > 0 && <span className="tabular-nums text-primary">{lensTotal}</span>}
            </span>
          )}
        </div>
      </div>

      {/* Legend: plain links, grouped by continent */}
      <nav aria-label={labels.legend} className="grid gap-6 text-sm sm:grid-cols-3 lg:grid-cols-1">
        {groups.map((group) => {
          // Countries with experiences first, each part alphabetical (input is sorted)
          const items = countries
            .filter((c) => c.group === group.id)
            .sort((a, b) => Number(b.count > 0) - Number(a.count > 0));
          if (items.length === 0) return null;
          return (
            <div key={group.id}>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </p>
              <ul className="mt-2 space-y-0.5">
                {items.map((c) => {
                  const highlighted = c.code === activeCode;
                  const content = (
                    <>
                      <span
                        aria-hidden
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          c.count > 0 ? "bg-primary" : "border border-accent",
                        )}
                      />
                      <span className="flex-1">{c.name}</span>
                      {c.count > 0 && (
                        <span className="tabular-nums text-muted-foreground">{c.count}</span>
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
                            "flex items-center gap-2 py-0.5 underline-offset-4 transition-colors hover:text-primary hover:underline",
                            highlighted && "text-primary",
                          )}
                        >
                          {content}
                        </Link>
                      ) : (
                        <span
                          {...hoverProps(c.code)}
                          className={cn(
                            "flex items-center gap-2 py-0.5 text-muted-foreground transition-colors",
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
  );
}
