import { getLocale, getTranslations } from "next-intl/server";

import type { DestinationContent } from "@/lib/woocommerce.d";
import { cn } from "@/lib/utils";
import { CountryMap } from "./country-map";

/**
 * The story of the country, after experiences and gallery: intro and wine zones
 * on the left; map, grapes, best months and how to get there alongside.
 */
export async function DestinationTerritory({
  code,
  destination,
}: {
  code: string;
  destination: DestinationContent;
}) {
  const [t, locale] = await Promise.all([getTranslations("Destination"), getLocale()]);
  const { intro, zones, grapes, best_months: months, getting_there: gettingThere } = destination;

  const hasStory = intro.trim() !== "" || zones.length > 0;
  const hasFacts = grapes.length > 0 || months.length > 0 || gettingThere.trim() !== "";
  if (!hasStory && !hasFacts) return null;

  const monthName = new Intl.DateTimeFormat(locale, { month: "short" });
  const monthLabels = Array.from({ length: 12 }, (_, i) =>
    monthName.format(new Date(2000, i, 1)).replace(".", ""),
  );

  return (
    <section className="grid gap-12 border-t pt-12 md:grid-cols-[minmax(0,1fr)_20rem] md:gap-16">
      <div>
        <h2 className="text-3xl md:text-4xl">{t("territory")}</h2>

        {intro.trim() !== "" && (
          <div
            className="prose prose-lg mt-6 max-w-none prose-headings:font-display dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: intro }}
          />
        )}

        {zones.length > 0 && (
          <>
            <h3 className="mt-12 text-2xl">{t("zones")}</h3>
            <ol className="mt-6 space-y-6">
              {zones.map((zone, i) => (
                <li key={i} className="grid grid-cols-[auto_1fr] gap-x-4">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-7 items-center justify-center rounded-full bg-primary text-sm font-semibold tabular-nums text-primary-foreground"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-display text-xl leading-tight">{zone.name}</p>
                    {zone.text && <p className="mt-1 text-muted-foreground">{zone.text}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>

      <aside className="space-y-8 md:sticky md:top-24 md:self-start">
        <CountryMap code={code} zones={zones} className="mx-auto max-w-72" />

        {grapes.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("grapes")}
            </h3>
            <ul className="mt-3 flex flex-wrap gap-2">
              {grapes.map((grape) => (
                <li key={grape} className="rounded-full border bg-card px-3 py-1 text-sm">
                  {grape}
                </li>
              ))}
            </ul>
          </div>
        )}

        {months.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("bestTime")}
            </h3>
            <ol className="mt-3 grid grid-cols-12 gap-0.5">
              {monthLabels.map((label, i) => {
                const best = months.includes(i + 1);
                return (
                  <li key={label} className="text-center">
                    <span
                      className={cn(
                        "block h-2 rounded-sm",
                        best ? "bg-primary" : "bg-muted",
                      )}
                    />
                    <span
                      className={cn(
                        "mt-1 block text-[10px] uppercase leading-none",
                        best ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {label.slice(0, 1)}
                    </span>
                    <span className="sr-only">
                      {label}
                      {best ? ` – ${t("bestTime")}` : ""}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}

        {gettingThere.trim() !== "" && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("gettingThere")}
            </h3>
            <p className="mt-3 whitespace-pre-line text-sm">{gettingThere}</p>
          </div>
        )}
      </aside>
    </section>
  );
}
