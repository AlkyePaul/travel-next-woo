import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import { Container } from "@/components/craft";
import { WineMap } from "@/components/wine-map/wine-map";

// TEMPORARY: compares the two Europe lens variants of the wine map.
// Delete this route once one of them is chosen.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MapTest({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const t = await getTranslations("Home");

  return (
    <main>
      {(["fixed", "zoom"] as const).map((mode) => (
        <section key={mode} className="border-t py-16 md:py-24">
          <Container className="py-0 sm:py-0">
            <p className="font-mono text-xs uppercase tracking-widest text-primary">
              lensMode = &quot;{mode}&quot;
            </p>
            <h2 className="mt-2 text-4xl md:text-5xl">{t("map.title")}</h2>
          </Container>
          <WineMap
            lensMode={mode}
            mapClassName="mt-10 md:mt-12"
            legendClassName="mt-12 md:mt-16"
          />
        </section>
      ))}
    </main>
  );
}
