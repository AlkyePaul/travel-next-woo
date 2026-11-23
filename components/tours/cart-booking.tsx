"use client";

import { useFormatter, useTranslations } from "next-intl";
import { CalendarDays, Users } from "lucide-react";

import type { CartBooking } from "@/lib/woocommerce.d";
import { dateToUtc } from "@/lib/tours";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useTourLabels } from "./use-tour-labels";

/** Date, participants and extras of a tour booking in the cart. */
export function CartBookingDetails({ booking, className }: { booking: CartBooking; className?: string }) {
  const t = useTranslations("Tour");
  const format = useFormatter();
  const labels = useTourLabels();

  const day = (date: string) =>
    format.dateTime(dateToUtc(date), { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  const people = booking.participants
    .filter((p) => p.count > 0)
    .map((p) => (p.key === "people" ? t("peopleCount", { count: p.count }) : `${p.count} × ${labels.personType(p.key, p.label)}`));
  if (booking.units > 0) people.unshift(t("unitsCount", { count: booking.units }));

  return (
    <div className={cn("space-y-0.5 text-xs text-muted-foreground", className)}>
      <p className="flex items-center gap-1.5 capitalize">
        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
        {day(booking.date)}
        {booking.time && ` · ${booking.time}`}
        {booking.endDate && booking.endDate !== booking.date && ` → ${day(booking.endDate)}`}
      </p>
      {people.length > 0 && (
        <p className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 shrink-0" />
          {people.join(", ")}
        </p>
      )}
      {booking.extras.length > 0 && (
        <p>+ {booking.extras.map((e) => (e.qty > 1 ? `${e.qty} × ${e.label}` : e.label)).join(", ")}</p>
      )}
      {booking.onRequest && (
        <Badge variant="outline" className="mt-1">
          {t("onRequest")}
        </Badge>
      )}
    </div>
  );
}
