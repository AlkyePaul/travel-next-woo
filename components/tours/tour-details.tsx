// Tour information blocks for the product page (server components).

import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  BadgeCheck,
  CalendarClock,
  Clock,
  Gauge,
  Info,
  Languages,
  MapPin,
  Users,
  X,
  Check,
  Backpack,
  Baby,
  Utensils,
  BedDouble,
  Undo2,
} from "lucide-react";

import type { Tour } from "@/lib/woocommerce.d";
import { dateToUtc } from "@/lib/tours";
import { formatPrice } from "@/lib/woocommerce";
import { Prose } from "@/components/craft";
import { cn } from "@/lib/utils";

/** "da 120,00 € a persona" / "Prezzo su richiesta" */
export function TourPrice({ tour, className }: { tour: Tour; className?: string }) {
  const t = useTranslations("Tour");
  const locale = useLocale();
  const { pricing } = tour;

  if (pricing.model === "quote" || !pricing.from_price) {
    return <p className={cn("font-display text-2xl font-semibold", className)}>{t("priceOnRequest")}</p>;
  }
  return (
    <p className={cn("flex items-baseline gap-2", className)}>
      <span className="text-sm text-muted-foreground">{t("from")}</span>
      <span className="font-display text-4xl font-semibold lining-nums">
        {formatPrice(pricing.from_price, { locale, currency: pricing.currency || "EUR" })}
      </span>
      <span className="text-sm text-muted-foreground">{t("priceUnit", { model: pricing.model })}</span>
    </p>
  );
}

export function useDurationLabel(tour: Tour) {
  const t = useTranslations("Tour");
  if (!tour.duration.value) {
    return tour.nights > 0 ? t("nights", { count: tour.nights }) : "";
  }
  const duration = t("duration", { value: tour.duration.value, unit: tour.duration.unit });
  return tour.nights > 0 ? `${duration} · ${t("nights", { count: tour.nights })}` : duration;
}

/** Key facts under the title. */
export function TourFacts({ tour }: { tour: Tour }) {
  const t = useTranslations("Tour");
  const format = useFormatter();
  const duration = useDurationLabel(tour);

  const facts: { icon: React.ReactNode; label: string }[] = [];
  if (duration) facts.push({ icon: <Clock className="h-4 w-4" />, label: duration });
  if (tour.group_size.max > 0) {
    facts.push({
      icon: <Users className="h-4 w-4" />,
      label:
        tour.group_size.min > 0
          ? t("groupSize", { min: tour.group_size.min, max: tour.group_size.max })
          : t("groupMax", { max: tour.group_size.max }),
    });
  }
  if (tour.languages.length > 0) {
    facts.push({ icon: <Languages className="h-4 w-4" />, label: tour.languages.join(", ") });
  }
  if (tour.difficulty) {
    facts.push({ icon: <Gauge className="h-4 w-4" />, label: t("difficulty", { level: tour.difficulty }) });
  }
  if (tour.min_age > 0) {
    facts.push({ icon: <Baby className="h-4 w-4" />, label: t("minAge", { age: tour.min_age }) });
  }
  if (tour.booking.next_departure) {
    facts.push({
      icon: <CalendarClock className="h-4 w-4" />,
      label: t("nextDeparture", {
        date: format.dateTime(dateToUtc(tour.booking.next_departure.date), {
          dateStyle: "medium",
          timeZone: "UTC",
        }),
      }),
    });
  }
  facts.push({
    icon: <BadgeCheck className="h-4 w-4" />,
    label: tour.booking.confirmation === "on_request" ? t("onRequestLong") : t("instantLong"),
  });

  return (
    <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {facts.map((fact, i) => (
        <li key={i} className="flex items-center gap-2 text-muted-foreground">
          <span className="text-foreground">{fact.icon}</span>
          {fact.label}
        </li>
      ))}
    </ul>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-medium flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function List({ items, icon, className }: { items: string[]; icon: React.ReactNode; className?: string }) {
  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-0.5 shrink-0">{icon}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Highlights, itinerary, inclusions, meeting point, policies. */
export function TourDetails({ tour }: { tour: Tour }) {
  const t = useTranslations("Tour");
  const isMultiDay = tour.kind === "multi_day";
  const mapQuery =
    tour.meeting_point.lat && tour.meeting_point.lng
      ? `${tour.meeting_point.lat},${tour.meeting_point.lng}`
      : tour.meeting_point.address;

  return (
    <div className="space-y-12">
      {tour.highlights.length > 0 && (
        <Section title={t("highlights")}>
          <List items={tour.highlights} icon={<Check className="h-4 w-4 text-primary" />} className="grid sm:grid-cols-2 gap-x-6 space-y-0 gap-y-2" />
        </Section>
      )}

      {tour.itinerary.length > 0 && (
        <Section title={t("itinerary")}>
          <ol className="relative border-l pl-6 space-y-6">
            {tour.itinerary.map((stop, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[33px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {i + 1}
                </span>
                <h3 className="font-semibold">
                  {isMultiDay && !/^\s*\d/.test(stop.title) ? `${t("day", { n: i + 1 })} · ` : ""}
                  {stop.title}
                </h3>
                {stop.description && (
                  <Prose className="text-muted-foreground mt-1 max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: stop.description }} />
                  </Prose>
                )}
                {(stop.meals.length > 0 || stop.accommodation) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                    {stop.meals.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Utensils className="h-3.5 w-3.5" />
                        {stop.meals.map((meal) => t("meal", { meal })).join(", ")}
                      </span>
                    )}
                    {stop.accommodation && (
                      <span className="flex items-center gap-1">
                        <BedDouble className="h-3.5 w-3.5" />
                        {stop.accommodation}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {(tour.included.length > 0 || tour.not_included.length > 0) && (
        <div className="grid md:grid-cols-2 gap-8">
          {tour.included.length > 0 && (
            <Section title={t("included")}>
              <List items={tour.included} icon={<Check className="h-4 w-4 text-secondary dark:text-secondary-foreground" />} />
            </Section>
          )}
          {tour.not_included.length > 0 && (
            <Section title={t("notIncluded")}>
              <List items={tour.not_included} icon={<X className="h-4 w-4 text-destructive" />} />
            </Section>
          )}
        </div>
      )}

      {(tour.meeting_point.address || tour.what_to_bring.length > 0) && (
        <div className="grid md:grid-cols-2 gap-8">
          {tour.meeting_point.address && (
            <Section title={t("meetingPoint")} icon={<MapPin className="h-5 w-5" />}>
              <p>{tour.meeting_point.address}</p>
              {tour.meeting_point.notes && (
                <p className="text-sm text-muted-foreground whitespace-pre-line">{tour.meeting_point.notes}</p>
              )}
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline underline-offset-4"
              >
                {t("openMap")}
              </a>
              {tour.end_point.address && (
                <p className="text-sm">
                  <span className="text-muted-foreground">{t("endPoint")}: </span>
                  {tour.end_point.address}
                </p>
              )}
            </Section>
          )}
          {tour.what_to_bring.length > 0 && (
            <Section title={t("whatToBring")} icon={<Backpack className="h-5 w-5" />}>
              <List items={tour.what_to_bring} icon={<Check className="h-4 w-4 text-muted-foreground" />} />
            </Section>
          )}
        </div>
      )}

      {tour.important_info && (
        <Section title={t("importantInfo")} icon={<Info className="h-5 w-5" />}>
          <p className="text-muted-foreground whitespace-pre-line">{tour.important_info}</p>
        </Section>
      )}

      {tour.cancellation_policy && (
        <Section title={t("cancellationPolicy")} icon={<Undo2 className="h-5 w-5" />}>
          <p className="text-muted-foreground whitespace-pre-line">{tour.cancellation_policy}</p>
        </Section>
      )}
    </div>
  );
}
