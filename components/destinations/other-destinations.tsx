import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { getDestinations } from "@/lib/destinations";

/** Links to the other countries that have experiences. */
export async function OtherDestinations({ current }: { current: string }) {
  const [t, locale, destinations] = await Promise.all([
    getTranslations("Destination"),
    getLocale(),
    getDestinations(),
  ]);
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const others = [...destinations.values()]
    .filter((d) => d.code !== current.toUpperCase())
    .map((d) => ({ ...d, name: names.of(d.code) ?? d.code }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  if (others.length === 0) return null;

  return (
    <nav aria-label={t("others")} className="border-t pt-10">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {t("others")}
      </h2>
      <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        {others.map((d) => (
          <li key={d.code}>
            <Link
              href={`/shop/category/${d.slug}`}
              className="font-display text-xl underline decoration-primary/30 underline-offset-4 hover:text-primary hover:decoration-primary"
            >
              {d.name}
            </Link>
            <span className="ml-1.5 text-sm tabular-nums text-muted-foreground">{d.count}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
