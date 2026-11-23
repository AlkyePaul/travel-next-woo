"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { addDays, addMonths, dateToUtc, monthBounds } from "@/lib/tours";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type DayState = "available" | "soldout" | "none";

interface TourCalendarProps {
  /** "2026-12" */
  month: string;
  minMonth: string;
  maxMonth: string;
  onMonthChange: (month: string) => void;
  dayState: (date: string) => DayState;
  selected?: string;
  onSelect: (date: string) => void;
}

/** Month grid (Monday first). Dates are plain "YYYY-MM-DD" strings, rendered in UTC. */
export function TourCalendar({
  month,
  minMonth,
  maxMonth,
  onMonthChange,
  dayState,
  selected,
  onSelect,
}: TourCalendarProps) {
  const format = useFormatter();
  const t = useTranslations("Tour.booking");

  const weeks = useMemo(() => {
    const [first, last] = monthBounds(month);
    // 1 = Monday … 7 = Sunday
    const weekday = ((dateToUtc(first).getUTCDay() + 6) % 7) + 1;
    const cells: (string | null)[] = Array.from({ length: weekday - 1 }, () => null);
    for (let day = first; day <= last; day = addDays(day, 1)) cells.push(day);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [month]);

  // 2024-01-01 was a Monday
  const weekdayNames = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        format.dateTime(dateToUtc(addDays("2024-01-01", i)), { weekday: "narrow", timeZone: "UTC" })
      ),
    [format]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={month <= minMonth}
          onClick={() => onMonthChange(addMonths(month, -1))}
          aria-label={t("previousMonth")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium capitalize">
          {format.dateTime(dateToUtc(`${month}-01`), { month: "long", year: "numeric", timeZone: "UTC" })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={month >= maxMonth}
          onClick={() => onMonthChange(addMonths(month, 1))}
          aria-label={t("nextMonth")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div role="grid" className="grid grid-cols-7 gap-1 text-center text-sm">
        {weekdayNames.map((name, i) => (
          <div key={i} className="text-xs text-muted-foreground py-1">
            {name}
          </div>
        ))}
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;
          const state = dayState(date);
          const isSelected = date === selected;
          return (
            <button
              key={date}
              type="button"
              disabled={state !== "available"}
              onClick={() => onSelect(date)}
              aria-pressed={isSelected}
              aria-label={format.dateTime(dateToUtc(date), { dateStyle: "full", timeZone: "UTC" })}
              className={cn(
                "aspect-square rounded-md text-sm transition-colors",
                state === "available" && "font-medium hover:bg-muted border border-transparent",
                state === "available" && !isSelected && "bg-primary/5",
                state === "soldout" && "text-muted-foreground line-through",
                state === "none" && "text-muted-foreground/40",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary"
              )}
            >
              {Number(date.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
