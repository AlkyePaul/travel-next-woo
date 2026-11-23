import { isContentPage } from "@/lib/wordpress";
import { getLocalizedPage, getLocalizedSlugs, SOURCE_LOCALE } from "@/lib/i18n-content";
import { decodeEntities, generateContentMetadata } from "@/lib/metadata";
import { Section, Container, Article } from "@/components/craft";
import { notFound, redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

import type { Metadata } from "next";

type Props = { params: Promise<{ locale: string; slug: string }> };

// Revalidate pages every hour
export const revalidate = 3600;

// Called once per locale (from the [locale] layout): each page under its translated slug
export async function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  return getLocalizedSlugs("page", params.locale);
}

/** The page for this URL, unless it is one of WooCommerce's own pages. */
async function loadPage(slug: string, locale: string) {
  const result = await getLocalizedPage(slug, locale);
  if (!result || !isContentPage({ slug: result.alternates[SOURCE_LOCALE] })) {
    return undefined;
  }
  return result;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const result = await loadPage(slug, locale);
  if (!result) return {};

  const { entry: page, canonicalSlug, alternates } = result;

  return generateContentMetadata({
    title: decodeEntities(page.title.rendered),
    excerpt: page.excerpt?.rendered,
    content: page.content.rendered,
    path: `/${locale}/pages/${canonicalSlug}`,
    languages: Object.fromEntries(
      routing.locales.map((l) => [l, `/${l}/pages/${alternates[l]}`])
    ),
  });
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);

  const result = await loadPage(slug, locale);
  if (!result) notFound();

  const { entry: page, canonicalSlug } = result;

  // Slug from another language (e.g. after switching language): go to this language's URL
  if (decodeURIComponent(slug) !== canonicalSlug) {
    redirect(`/${locale}/pages/${encodeURIComponent(canonicalSlug)}`);
  }

  return (
    <Section>
      <Container className="max-w-3xl">
        <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-balance mb-10">
          {decodeEntities(page.title.rendered)}
        </h1>
        <Article
          className="max-w-none"
          dangerouslySetInnerHTML={{ __html: page.content.rendered }}
        />
      </Container>
    </Section>
  );
}
