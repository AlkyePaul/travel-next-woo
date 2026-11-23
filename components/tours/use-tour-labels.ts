"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";

import { STANDARD_PERSON_TYPES } from "@/lib/tours";
import type { TourQuoteError } from "@/lib/woocommerce.d";

const SOURCE_LOCALE = "it";

/** Quote error codes returned by the Next Tours plugin (Tour.errors.* in messages). */
const ERROR_CODES = [
  "participants_required",
  "too_few_participants",
  "too_many_participants",
  "type_min",
  "type_max",
  "no_tier",
  "group_too_large",
  "units_required",
  "too_many_units",
  "unit_capacity",
  "not_enough_seats",
  "date_required",
  "date_unavailable",
  "time_unavailable",
  "too_late",
  "too_far",
  "departure_closed",
  "departure_not_found",
  "mode_unavailable",
  "price_missing",
] as const;
type ErrorCode = (typeof ERROR_CODES)[number];

const isKnownError = (code: string): code is ErrorCode =>
  (ERROR_CODES as readonly string[]).includes(code);

/**
 * Labels for tour data that comes from WordPress in Italian.
 *  - person types: the WordPress label in Italian (or when the plugin translated
 *    it), otherwise the storefront's own translation of the standard keys
 *  - quote errors: translated by code, falling back to the WordPress message
 */
export function useTourLabels() {
  const locale = useLocale();
  const t = useTranslations("Tour");

  const personType = useCallback(
    (key: string, label: string, translated = false) => {
      if (locale === SOURCE_LOCALE || translated) return label;
      return (STANDARD_PERSON_TYPES as readonly string[]).includes(key)
        ? t("personType", { type: key })
        : label;
    },
    [locale, t]
  );

  const error = useCallback(
    (e: TourQuoteError) => {
      if (!isKnownError(e.code)) return e.message;
      const data = (e.data ?? {}) as Record<string, string | number>;
      return t(`errors.${e.code}`, {
        min: data.min ?? 0,
        max: data.max ?? 0,
        remaining: data.remaining ?? 0,
        capacity: data.capacity ?? 0,
        type: String(data.type ?? ""),
      });
    },
    [t]
  );

  return { personType, error };
}
