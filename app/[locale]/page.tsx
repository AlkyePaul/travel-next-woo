import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

import { Container } from "@/components/craft";
import { Button } from "@/components/ui/button";
import { ProductGrid } from "@/components/shop";
import { WineMap } from "@/components/wine-map/wine-map";
import { FaqList } from "@/components/faq/faq-list";
import { getFaqs } from "@/lib/faq";
import { getProductCategoryBySlug, getProducts } from "@/lib/woocommerce";
import { localizeProducts } from "@/lib/i18n-content";
import { isTourProduct } from "@/lib/tours";
import {
  experienceCategories,
  experiencesRootCategory,
  menuEntries,
} from "@/menu.config";
import { cn } from "@/lib/utils";

// Barolo and its vineyards in autumn. Photo: Bruno Sulis, CC0 (public domain dedication),
// https://commons.wikimedia.org/wiki/File:Barolo_Village_(163795471).jpeg
import heroImage from "@/public/images/hero-barolo.jpg";

export const revalidate = 600;

// Dot size grows with the time each kind of experience takes
const durationDots = ["size-2", "size-3", "size-4"];

const bookingSteps = ["choose", "confirm", "pay"] as const;

export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);

  const [t, tExp, tFaq, root, faqs] = await Promise.all([
    getTranslations("Home"),
    getTranslations("Experiences"),
    getTranslations("Faq"),
    getProductCategoryBySlug(experiencesRootCategory),
    getFaqs("home", locale),
  ]);

  // A selection of bookable experiences (only tour products, never test items):
  // the ones featured in WooCommerce first (curated by hand), then the most
  // popular ones to fill the grid.
  const [featured, popular] = await Promise.all([
    getProducts(1, 12, {
      category: root?.id,
      featured: true,
      orderby: "popularity",
    }),
    getProducts(1, 12, {
      category: root?.id,
      orderby: "popularity",
    }),
  ]);
  const selection = [...featured.data, ...popular.data].filter(
    (product, i, all) =>
      isTourProduct(product) &&
      all.findIndex((other) => other.id === product.id) === i,
  );
  const experiences = localizeProducts(selection, locale).slice(0, 6);

  return (
    <main>
      {/* Hero: vineyard photo under a primary-colour veil, white label in the centre.
          `light` keeps the light palette here in dark mode too. */}
      <section className="light relative isolate overflow-hidden px-4 py-16 sm:py-24 md:py-28">
        <Image
          src={heroImage}
          alt=""
          fill
          priority
          placeholder="blur"
          sizes="100vw"
          className="-z-20 object-cover object-[50%_65%]"
        />
        {/* Veil in the primary colour: multiply tints the photo, the flat layer evens it out */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-primary/80 mix-blend-multiply"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-primary-deep/20"
        />

        {/* White label with a double rule in the primary colour */}
        <div className="mx-auto max-w-3xl bg-white p-1.5 shadow-[0_20px_50px_-24px_rgb(0_0_0/0.6)] backdrop-blur-sm sm:p-2">
          <div className="border border-primary/50 p-1">
            <div className="border border-primary/50 px-5 py-10 text-center text-foreground sm:px-14 sm:py-16">
              <h1 className="mx-auto max-w-2xl text-[2.6rem] leading-[1.05] text-primary sm:text-6xl md:text-7xl">
                {t("hero.title")}
              </h1>
              <span
                aria-hidden
                className="mx-auto my-7 block h-px w-16 bg-primary"
              />
              <p className="mx-auto max-w-xl text-base sm:text-lg">
                {t("hero.intro")}
              </p>
              <p className="mx-auto mt-5 max-w-xl font-display text-lg italic text-accent">
                {t("hero.regions")}
              </p>
              <Button
                asChild
                size="lg"
                className="mt-9"
              >
                <Link href="/shop">{t("hero.cta")}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Sections alternate background (card / page) from here on */}
      {/* Choose by time */}
      <section className="bg-card py-16 md:py-24">
        <Container className="py-0 sm:py-0">
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl">{t("durations.title")}</h2>
            <p className="mt-4 text-lg text-muted-foreground">
              {t("durations.intro")}
            </p>
          </div>

          <ol className="mt-12 grid gap-12 md:grid-cols-3 md:gap-8">
            {menuEntries(experienceCategories).map(([key, slug], i) => (
              <li
                key={key}
                className="relative border-t border-foreground/20 pt-8"
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-0 -translate-y-1/2 rounded-full bg-primary ring-4 ring-card",
                    durationDots[i],
                  )}
                />
                <h3 className="text-3xl">{tExp(`${key}.duration`)}</h3>
                <p className="mt-2 font-semibold text-accent">
                  {tExp(`${key}.title`)}
                </p>
                <p className="mt-3 text-muted-foreground">
                  {tExp(`${key}.description`)}
                </p>
                <Link
                  href={`/shop/category/${slug}`}
                  className="mt-4 inline-block font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
                >
                  {tExp(`${key}.link`)}
                </Link>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Wine regions around the world: full-width map, then the country list */}
      <section className="py-16 md:py-24">
        <Container className="py-0 sm:py-0">
          <div className="max-w-2xl">
            <h2 className="text-4xl md:text-5xl">{t("map.title")}</h2>
            <p className="mt-4 text-lg text-muted-foreground">{t("map.intro")}</p>
          </div>
        </Container>
        <WineMap
          lensMode="zoom"
          mapClassName="mt-10 md:mt-12"
          legendClassName="mt-12 md:mt-16"
        />
      </section>

      {/* Bookable experiences */}
      {experiences.length > 0 && (
        <section className="border-t bg-card py-16 md:py-24">
          <Container className="py-0 sm:py-0">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className="text-4xl md:text-5xl">{t("featured.title")}</h2>
              <Button asChild variant="outline">
                <Link href="/shop">{t("featured.all")}</Link>
              </Button>
            </div>
            <div className="mt-10">
              <ProductGrid products={experiences} columns={3} />
            </div>
          </Container>
        </section>
      )}

      {/* How booking works (keeps the alternation when there are no experiences) */}
      <section
        className={cn(
          "border-t py-16 md:py-24",
          experiences.length === 0 && "bg-card",
        )}
      >
        <Container className="py-0 sm:py-0">
          <h2 className="text-4xl md:text-5xl">{t("booking.title")}</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {bookingSteps.map((step, i) => (
              <li key={step} className="grid grid-cols-[auto_1fr] gap-x-4">
                <span
                  aria-hidden
                  className="font-display text-5xl leading-none text-primary lining-nums"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-sans text-lg font-semibold tracking-normal">
                    {t(`booking.steps.${step}.title`)}
                  </h3>
                  <p className="mt-2 text-muted-foreground">
                    {t(`booking.steps.${step}.description`)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* FAQ (managed in WordPress, "Next FAQ" plugin, list "Home page") */}
      {faqs.length > 0 && (
        <section
          className={cn(
            "border-t py-16 md:py-24",
            experiences.length > 0 && "bg-card",
          )}
        >
          <Container className="grid gap-10 py-0 sm:py-0 md:grid-cols-3 md:gap-12">
            <div>
              <h2 className="text-4xl md:text-5xl">{tFaq("title")}</h2>
              <p className="mt-4 text-lg text-muted-foreground">
                {tFaq("homeIntro")}
              </p>
            </div>
            <FaqList faqs={faqs} className="md:col-span-2" />
          </Container>
        </section>
      )}
    </main>
  );
}
