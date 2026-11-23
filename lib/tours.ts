// Tour helpers shared by server and client components (no secrets here).
//
// Tours are WooCommerce products of type "tour" managed by the Next Tours
// WordPress plugin (plugin/next-tours). Their data arrives in `product.tour`.
// Prices are always computed by WordPress: the storefront asks for quotes.

import { z } from "zod";
import type {
  Product,
  Tour,
  TourBookingRequest,
} from "./woocommerce.d";

/** Person type keys the storefront translates itself (Tour.personType.*). */
export const STANDARD_PERSON_TYPES = ["adult", "child", "infant", "youth", "senior", "student"] as const;

export function isTourProduct(product: Product): product is Product & { tour: Tour } {
  return product.type === "tour" && !!product.tour;
}

/** Replace the tour texts with the locale's translation, when there is one. */
export function localizeTour(tour: Tour, locale: string, sourceLocale = "it"): Tour {
  if (locale === sourceLocale) return tour;
  const t = tour.i18n?.[locale];
  if (!t) return tour;

  const list = (translated: string[] | undefined, source: string[]) =>
    translated && translated.length === source.length ? translated : source;

  return {
    ...tour,
    highlights: list(t.highlights, tour.highlights),
    included: list(t.included, tour.included),
    not_included: list(t.not_included, tour.not_included),
    what_to_bring: list(t.what_to_bring, tour.what_to_bring),
    languages: list(t.languages, tour.languages),
    itinerary: tour.itinerary.map((stop, i) => ({
      ...stop,
      title: t.itinerary?.[i]?.title || stop.title,
      description: t.itinerary?.[i]?.description || stop.description,
      accommodation: t.itinerary?.[i]?.accommodation || stop.accommodation,
    })),
    important_info: t.important_info || tour.important_info,
    cancellation_policy: t.cancellation_policy || tour.cancellation_policy,
    meeting_point: {
      ...tour.meeting_point,
      notes: t.meeting_point_notes || tour.meeting_point.notes,
    },
    pricing: {
      ...tour.pricing,
      person_types: tour.pricing.person_types.map((type) => ({
        ...type,
        label: t.person_types?.[type.key] || type.label,
      })),
      extras: tour.pricing.extras.map((extra) => ({
        ...extra,
        label: t.extras?.[extra.key] || extra.label,
      })),
      unit: { ...tour.pricing.unit, label: t.unit_label || tour.pricing.unit.label },
    },
  };
}

/** Starting participant counts for the booking form. */
export function defaultParticipants(tour: Tour): Record<string, number> {
  const minimum = Math.max(1, tour.booking.min_per_booking);
  if (tour.pricing.model === "person_types") {
    const counts: Record<string, number> = {};
    for (const type of tour.pricing.person_types) counts[type.key] = Math.max(0, type.min);
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const first = tour.pricing.person_types[0];
    if (total < minimum && first) counts[first.key] += minimum - total;
    return counts;
  }
  return { people: minimum };
}

// ---------------------------------------------------------------------------
// Dates: tours use plain calendar dates ("2026-12-12") in the shop's timezone.
// Handle them as UTC midnights so the browser's timezone never shifts a day.
// ---------------------------------------------------------------------------

export function dateToUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function utcToDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const value = dateToUtc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return utcToDate(value);
}

/** First and last day of a month ("2026-12" → ["2026-12-01", "2026-12-31"]). */
export function monthBounds(month: string): [string, string] {
  const [year, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(year, m, 0));
  return [`${month}-01`, utcToDate(last)];
}

export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year, m - 1 + delta, 1));
  return utcToDate(value).slice(0, 7);
}

// ---------------------------------------------------------------------------
// Validation of booking requests coming from the browser (API routes)
// ---------------------------------------------------------------------------

const key = z.string().regex(/^[a-z0-9_-]{1,32}$/);

export const bookingRequestSchema = z.object({
  product_id: z.number().int().positive(),
  mode: z.enum(["departure", "date", ""]),
  departure_id: z.string().regex(/^[a-z0-9]{0,32}$/).optional(),
  date: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).optional(),
  time: z.string().regex(/^(\d{2}:\d{2})?$/).optional(),
  participants: z.record(key, z.number().int().min(0).max(999)),
  units: z.number().int().min(0).max(999).optional(),
  extras: z.array(key).max(50),
}) satisfies z.ZodType<TourBookingRequest>;
