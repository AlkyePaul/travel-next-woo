"use client";

// Booking form for a tour product.
//
// 1. Loads the availability for the whole booking window once (departures and
//    open dates come from the same call).
// 2. The customer picks a departure or a date (+ time), participants and extras.
// 3. Every change asks WordPress for a quote (debounced): price, validity and
//    whether the booking is instant or on request. Nothing is priced here.
// 4. "Book" adds the booking to the WooCommerce cart (validated again there).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFormatter, useLocale, useTranslations, type DateTimeFormatOptions } from "next-intl";
import { CalendarDays, Loader2, Minus, Plus, ShieldCheck, Users } from "lucide-react";

import type {
  Tour,
  TourAvailability,
  TourBookingRequest,
  TourDeparture,
  TourQuote,
} from "@/lib/woocommerce.d";
import { addDays, dateToUtc, defaultParticipants, utcToDate } from "@/lib/tours";
import { formatPrice } from "@/lib/woocommerce";
import { cn } from "@/lib/utils";
import { useCart } from "@/components/shop/cart-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TourCalendar, type DayState } from "./tour-calendar";
import { useTourLabels } from "./use-tour-labels";

type Mode = "departure" | "date";

interface BookingWidgetProps {
  productId: number;
  /** Already localised (lib/tours localizeTour) */
  tour: Tour;
  /** Whether the tour texts were translated for this locale (labels can be used as-is) */
  translated: boolean;
}

const DEPARTURES_PAGE = 6;

export function BookingWidget({ productId, tour, translated }: BookingWidgetProps) {
  const t = useTranslations("Tour");
  const tb = useTranslations("Tour.booking");
  const format = useFormatter();
  const locale = useLocale();
  const labels = useTourLabels();
  const { addBooking, error: cartError } = useCart();

  const { booking, pricing } = tour;
  const currency = pricing.currency || "EUR";
  const price = (value: string | number) => formatPrice(value, { locale, currency });
  const dateLabel = (date: string, options: DateTimeFormatOptions) =>
    format.dateTime(dateToUtc(date), { ...options, timeZone: "UTC" });
  const extraLabels = Object.fromEntries(pricing.extras.map((e) => [e.key, e.label]));

  const modes: Mode[] = [
    ...(booking.fixed_departures ? (["departure"] as const) : []),
    ...(booking.open_dates ? (["date"] as const) : []),
  ];

  const [mode, setMode] = useState<Mode | undefined>(modes[0]);
  const [availability, setAvailability] = useState<TourAvailability | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [departureId, setDepartureId] = useState<string>();
  const [date, setDate] = useState<string>();
  const [time, setTime] = useState<string>();
  const [month, setMonth] = useState(() => utcToDate(new Date()).slice(0, 7));
  const [showAllDepartures, setShowAllDepartures] = useState(false);
  const [participants, setParticipants] = useState<Record<string, number>>(() => defaultParticipants(tour));
  const [units, setUnits] = useState(1);
  const [extras, setExtras] = useState<string[]>([]);
  // Last quote received and the request it answers (a different request = quoting)
  const [quoted, setQuoted] = useState<{ key: string; quote: TourQuote | null } | null>(null);
  const [adding, setAdding] = useState(false);
  const [addFailed, setAddFailed] = useState(false);
  // Bumped to reload the availability (retry button, refused booking)
  const [availabilityVersion, setAvailabilityVersion] = useState(0);

  // --- Availability ---------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const today = utcToDate(new Date());
    const to = addDays(today, Math.min(Math.max(booking.booking_window_days, 1), 400));
    fetch(`/api/tours/availability?product=${productId}&from=${today}&to=${to}`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status));
        return response.json() as Promise<TourAvailability>;
      })
      .then((data) => {
        if (cancelled) return;
        setAvailability(data);
        setAvailabilityError(false);
        // First load: open the calendar on the first month with something bookable
        const firstDate = data.dates.find((d) => d.slots.some((s) => s.bookable))?.date;
        if (availabilityVersion === 0 && firstDate) setMonth(firstDate.slice(0, 7));
      })
      .catch(() => {
        if (!cancelled) setAvailabilityError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingAvailability(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId, booking.booking_window_days, availabilityVersion]);

  const reloadAvailability = () => {
    setLoadingAvailability(true);
    setAvailabilityError(false);
    setAvailabilityVersion((v) => v + 1);
  };

  const departures = useMemo(() => availability?.departures ?? [], [availability]);
  const datesByDay = useMemo(
    () => new Map((availability?.dates ?? []).map((d) => [d.date, d])),
    [availability]
  );
  const selectedDay = date ? datesByDay.get(date) : undefined;

  const calendarBounds = useMemo(() => {
    const dates = availability?.dates ?? [];
    const today = utcToDate(new Date()).slice(0, 7);
    return {
      min: dates[0]?.date.slice(0, 7) ?? today,
      max: dates[dates.length - 1]?.date.slice(0, 7) ?? today,
    };
  }, [availability]);

  const dayState = useCallback(
    (day: string): DayState => {
      const entry = datesByDay.get(day);
      if (!entry) return "none";
      return entry.slots.some((s) => s.bookable) ? "available" : "soldout";
    },
    [datesByDay]
  );

  // --- Booking request ------------------------------------------------------
  const request: TourBookingRequest = useMemo(() => {
    const base = { product_id: productId, participants, extras, units: pricing.model === "per_unit" ? units : undefined };
    if (mode === "departure" && departureId) return { ...base, mode: "departure", departure_id: departureId };
    if (mode === "date" && date && time !== undefined) return { ...base, mode: "date", date, time };
    return { ...base, mode: "" };
  }, [productId, participants, extras, units, pricing.model, mode, departureId, date, time]);

  // Debounced quote; answers to outdated requests are dropped
  const requestKey = JSON.stringify(request);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      let result: TourQuote | null = null;
      try {
        const response = await fetch("/api/tours/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: requestKey,
        });
        if (response.ok) result = (await response.json()) as TourQuote;
      } catch {
        // Shown as "no quote"
      }
      if (!cancelled) setQuoted({ key: requestKey, quote: result });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [requestKey]);
  const quote = quoted?.quote ?? null;
  const quoting = quoted?.key !== requestKey;

  const handleBook = async () => {
    if (!quote?.valid) return;
    setAdding(true);
    setAddFailed(false);
    try {
      const ok = await addBooking(request);
      if (!ok) {
        setAddFailed(true);
        // Seats may have changed in the meantime
        reloadAvailability();
      }
    } finally {
      setAdding(false);
    }
  };

  // --- Participants helpers ---------------------------------------------------
  const maxPeople = booking.max_per_booking > 0 ? booking.max_per_booking : 99;
  const setCount = (key: string, value: number) =>
    setParticipants((prev) => ({ ...prev, [key]: Math.max(0, Math.min(999, value)) }));

  const toggleExtra = (key: string) =>
    setExtras((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const selectMode = (next: Mode) => {
    setMode(next);
    setDepartureId(undefined);
    setDate(undefined);
    setTime(undefined);
  };

  const selectDate = (day: string) => {
    setDate(day);
    const slots = datesByDay.get(day)?.slots.filter((s) => s.bookable) ?? [];
    // One slot (or "all day"): select it directly
    setTime(slots.length === 1 ? slots[0].time : undefined);
  };

  // --- Render -------------------------------------------------------------------
  if (modes.length === 0) {
    return <p className="text-sm text-muted-foreground">{tb("notBookable")}</p>;
  }

  const onRequest = quote?.on_request ?? booking.confirmation === "on_request";
  const visibleDepartures = showAllDepartures ? departures : departures.slice(0, DEPARTURES_PAGE);
  const personTypeLabel = (key: string, label: string) => labels.personType(key, label, translated);

  return (
    <div className="border rounded-lg p-5 space-y-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          {tb("title")}
        </h2>
        <Badge variant={onRequest ? "outline" : "secondary"}>
          {onRequest ? t("onRequest") : t("instant")}
        </Badge>
      </div>

      {/* Mode */}
      {modes.length > 1 && (
        <div className="grid grid-cols-2 gap-1 rounded-md bg-muted p-1" role="tablist">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => selectMode(m)}
              className={cn(
                "rounded px-3 py-1.5 text-sm transition-colors",
                mode === m ? "bg-background shadow-sm font-medium" : "text-muted-foreground"
              )}
            >
              {m === "departure" ? tb("fixedDepartures") : tb("openDates")}
            </button>
          ))}
        </div>
      )}

      {/* Dates */}
      {loadingAvailability ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tb("loading")}
        </div>
      ) : availabilityError ? (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{tb("availabilityError")}</p>
          <Button type="button" variant="outline" size="sm" onClick={reloadAvailability}>
            {tb("retry")}
          </Button>
        </div>
      ) : mode === "departure" ? (
        <div className="space-y-2">
          {departures.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tb("noDepartures")}</p>
          ) : (
            <>
              <ul className="space-y-2">
                {visibleDepartures.map((dep) => (
                  <li key={dep.id}>
                    <DepartureOption
                      departure={dep}
                      selected={dep.id === departureId}
                      onSelect={() => setDepartureId(dep.id)}
                      dateLabel={dateLabel}
                    />
                  </li>
                ))}
              </ul>
              {departures.length > DEPARTURES_PAGE && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllDepartures((v) => !v)}
                >
                  {showAllDepartures ? tb("showLess") : tb("showAll", { count: departures.length })}
                </Button>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {(availability?.dates.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">{tb("noDates")}</p>
          ) : (
            <TourCalendar
              month={month}
              minMonth={calendarBounds.min}
              maxMonth={calendarBounds.max}
              onMonthChange={setMonth}
              dayState={dayState}
              selected={date}
              onSelect={selectDate}
            />
          )}

          {selectedDay && (selectedDay.slots.length > 1 || selectedDay.slots[0]?.time) && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{tb("chooseTime")}</p>
              <div className="flex flex-wrap gap-2">
                {selectedDay.slots.map((slot) => (
                  <Button
                    key={slot.time || "all-day"}
                    type="button"
                    size="sm"
                    variant={time === slot.time ? "default" : "outline"}
                    disabled={!slot.bookable}
                    onClick={() => setTime(slot.time)}
                  >
                    {slot.time || tb("allDay")}
                    {slot.remaining !== null && slot.bookable && slot.remaining <= 5 && (
                      <span className="ml-1 text-xs opacity-70">({slot.remaining})</span>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {selectedDay && selectedDay.end_date !== selectedDay.date && (
            <p className="text-xs text-muted-foreground">
              {tb("returnOn", { date: dateLabel(selectedDay.end_date, { dateStyle: "medium" }) })}
            </p>
          )}
        </div>
      )}

      <Separator />

      {/* Participants */}
      <div className="space-y-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <Users className="h-4 w-4" />
          {tb("participants")}
        </p>

        {pricing.model === "person_types" ? (
          pricing.person_types.map((type) => (
            <Stepper
              key={type.key}
              label={personTypeLabel(type.key, type.label)}
              hint={[
                ageHint(type.min_age, type.max_age, tb),
                Number(type.price) > 0 ? price(type.price) : tb("free"),
              ]
                .filter(Boolean)
                .join(" · ")}
              value={participants[type.key] ?? 0}
              min={type.min}
              max={type.max > 0 ? type.max : maxPeople}
              onChange={(v) => setCount(type.key, v)}
            />
          ))
        ) : (
          <>
            {pricing.model === "per_unit" && (
              <Stepper
                label={pricing.unit.label || tb("units")}
                hint={
                  [
                    pricing.unit.price ? price(pricing.unit.price) : "",
                    pricing.unit.capacity > 0 ? tb("unitCapacity", { count: pricing.unit.capacity }) : "",
                  ]
                    .filter(Boolean)
                    .join(" · ")
                }
                value={units}
                min={1}
                max={pricing.unit.max_units > 0 ? pricing.unit.max_units : 99}
                onChange={setUnits}
              />
            )}
            <Stepper
              label={tb("people")}
              hint={peopleHint(tour, tb, price)}
              value={participants.people ?? 0}
              min={pricing.model === "per_unit" ? 0 : Math.max(1, booking.min_per_booking)}
              max={
                pricing.model === "private_group" && pricing.group.max_people > 0
                  ? Math.min(pricing.group.max_people, maxPeople)
                  : maxPeople
              }
              onChange={(v) => setCount("people", v)}
            />
          </>
        )}
      </div>

      {/* Extras */}
      {pricing.extras.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-sm font-medium">{tb("extras")}</p>
            {pricing.extras.map((extra) => (
              <label key={extra.key} className="flex items-start gap-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-primary"
                  checked={extra.required || extras.includes(extra.key)}
                  disabled={extra.required}
                  onChange={() => toggleExtra(extra.key)}
                />
                <span className="flex-1">
                  {extra.label}
                  {extra.required && (
                    <span className="ml-1 text-xs text-muted-foreground">({tb("required")})</span>
                  )}
                </span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {price(extra.price)} {tb("extraPer", { per: extra.per })}
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      <Separator />

      {/* Summary */}
      <QuoteSummary
        quote={quote}
        quoting={quoting}
        price={price}
        hasDate={request.mode !== ""}
        errorLabel={labels.error}
        extraLabels={extraLabels}
      />

      <div className="space-y-2">
        <Button
          type="button"
          size="lg"
          className="w-full"
          disabled={!quote?.valid || quoting || adding}
          onClick={handleBook}
        >
          {adding ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {tb("adding")}
            </>
          ) : onRequest ? (
            tb("request")
          ) : (
            tb("book")
          )}
        </Button>
        <p className="text-xs text-muted-foreground flex gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {quote?.price_on_request
            ? tb("quoteNote")
            : onRequest
              ? tb("onRequestNote")
              : tb("instantNote")}
        </p>
        {addFailed && cartError && (
          <p role="alert" className="text-sm text-destructive">
            {cartError}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type T = ReturnType<typeof useTranslations<"Tour.booking">>;

function ageHint(minAge: number, maxAge: number, tb: T) {
  if (minAge > 0 && maxAge > 0) return tb("ageRange", { min: minAge, max: maxAge });
  if (minAge > 0) return tb("ageFrom", { min: minAge });
  if (maxAge > 0) return tb("ageTo", { max: maxAge });
  return "";
}

function peopleHint(tour: Tour, tb: T, price: (v: string | number) => string) {
  const { pricing } = tour;
  switch (pricing.model) {
    case "per_person":
      return pricing.price ? tb("perPersonHint", { price: price(pricing.price) }) : "";
    case "group_tiers":
      return pricing.tiers
        .map((tier) =>
          tb("tierHint", {
            min: tier.min,
            max: tier.max,
            price: price(tier.price),
          })
        )
        .join(" · ");
    case "private_group":
      return tb("privateGroupHint", {
        price: price(pricing.group.price || 0),
        included: pricing.group.included,
        extra: price(pricing.group.extra_price || 0),
      });
    default:
      return "";
  }
}

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center border rounded-md shrink-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`${label} −`}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-8 text-center text-sm font-medium" aria-live="polite">
          {value}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          aria-label={`${label} +`}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function DepartureOption({
  departure,
  selected,
  onSelect,
  dateLabel,
}: {
  departure: TourDeparture;
  selected: boolean;
  onSelect: () => void;
  dateLabel: (date: string, options: DateTimeFormatOptions) => string;
}) {
  const t = useTranslations("Tour");
  const tb = useTranslations("Tour.booking");
  const multiDay = departure.end_date && departure.end_date !== departure.date;
  const soldOut = departure.remaining === 0;

  return (
    <button
      type="button"
      disabled={!departure.bookable}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full text-left border rounded-md px-3 py-2 transition-colors",
        departure.bookable ? "hover:bg-muted" : "opacity-60 cursor-not-allowed",
        selected && "border-primary ring-1 ring-primary bg-primary/5"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-sm capitalize">
          {dateLabel(departure.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
          {departure.time && ` · ${departure.time}`}
        </span>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {soldOut
            ? tb("soldOut")
            : departure.status === "closed"
              ? tb("closed")
              : departure.remaining !== null
                ? tb("seatsLeft", { count: departure.remaining })
                : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        {multiDay && (
          <span className="text-xs text-muted-foreground">
            {tb("returnOn", { date: dateLabel(departure.end_date, { day: "numeric", month: "short" }) })}
          </span>
        )}
        {departure.guaranteed && <Badge variant="secondary">{tb("guaranteed")}</Badge>}
        {departure.on_request && <Badge variant="outline">{t("onRequest")}</Badge>}
        {departure.price_adjustment !== 0 && (
          <Badge variant="outline">
            {departure.price_adjustment > 0 ? "+" : ""}
            {departure.price_adjustment}%
          </Badge>
        )}
        {departure.note && <span className="text-xs text-muted-foreground">{departure.note}</span>}
      </div>
    </button>
  );
}

function QuoteSummary({
  quote,
  quoting,
  price,
  hasDate,
  errorLabel,
  extraLabels,
}: {
  quote: TourQuote | null;
  quoting: boolean;
  price: (value: string | number) => string;
  hasDate: boolean;
  errorLabel: ReturnType<typeof useTourLabels>["error"];
  /** Localised extra labels by key (the quote carries the Italian ones) */
  extraLabels: Record<string, string>;
}) {
  const tb = useTranslations("Tour.booking");
  const tc = useTranslations("Common");

  if (!quote) {
    return quoting ? (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {tb("calculating")}
      </div>
    ) : null;
  }

  // Missing date is expected while choosing: not shown as an error
  const errors = quote.errors.filter((e) => e.code !== "date_required");
  const adjustment = Number(quote.adjustment);

  return (
    <div className={cn("space-y-2 text-sm", quoting && "opacity-60")}>
      {quote.price_on_request ? (
        <p className="font-medium">{tb("priceOnRequest")}</p>
      ) : (
        <>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{tb("base", { people: quote.people, units: quote.units })}</span>
            <span>{price(quote.subtotal)}</span>
          </div>
          {adjustment !== 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {adjustment > 0 ? tb("dateSupplement") : tb("dateDiscount")}
              </span>
              <span>{price(quote.adjustment)}</span>
            </div>
          )}
          {quote.extras.map((extra) => (
            <div key={extra.key} className="flex justify-between">
              <span className="text-muted-foreground">
                {extra.qty > 1 ? `${extra.qty} × ` : ""}
                {extraLabels[extra.key] ?? extra.label}
              </span>
              <span>{price(extra.total)}</span>
            </div>
          ))}
          <div className="flex justify-between text-base font-semibold pt-1">
            <span>{tc("total")}</span>
            <span>{price(quote.total)}</span>
          </div>
          {!hasDate && <p className="text-xs text-muted-foreground">{tb("selectDate")}</p>}
        </>
      )}

      {errors.length > 0 && (
        <ul role="alert" className="space-y-1">
          {errors.map((e, i) => (
            <li key={`${e.code}-${i}`} className="text-destructive">
              {errorLabel(e)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
