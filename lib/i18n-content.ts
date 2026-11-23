// Localised CMS content, backed by the "Next i18n" WordPress plugin.
//
// Model: one WooCommerce product (one stock) per item. Italian lives in the
// native fields; other languages come in `product.i18n[locale]`. Anything not
// translated falls back to Italian, so pages are never empty.
//
// Slugs differ per language (/it/shop/viaggio-bello, /es/shop/un-bonito-viaje).
// The plugin's /next-i18n/v1/slugs endpoint maps every slug back to its item.
//
// Server-side only (imports lib/woocommerce.ts, which holds the API secrets).

import { routing } from "@/i18n/routing";
import { getProductById, getProductBySlug } from "./woocommerce";
import { localizeTour } from "./tours";
import { getPageById, getPageBySlug, getPostById, getPostBySlug } from "./wordpress";
import type { Product } from "./woocommerce.d";
import type { Page, Post } from "./wordpress.d";

export const SOURCE_LOCALE = routing.defaultLocale; // "it": the language content is written in

type SlugType = "product" | "post" | "page";

interface SlugEntry {
  id: number;
  slugs: Partial<Record<string, string>>;
}

const baseUrl = process.env.WORDPRESS_URL;

// ---------------------------------------------------------------------------
// Field-level localisation
// ---------------------------------------------------------------------------

/** Replace name, slug and descriptions with the locale's translation, if any. */
export function localizeProduct<T extends Product>(product: T, locale: string): T {
  if (locale === SOURCE_LOCALE) return product;
  // Tour texts (itinerary, inclusions…) come from the Next Tours plugin
  const tour = product.tour ? localizeTour(product.tour, locale, SOURCE_LOCALE) : product.tour;
  const translation = product.i18n?.[locale];
  if (!translation) return tour === product.tour ? product : { ...product, tour };

  return {
    ...product,
    tour,
    name: translation.title || product.name,
    slug: translation.slug || product.slug,
    short_description: translation.excerpt || product.short_description,
    description: translation.content || product.description,
  };
}

export function localizeProducts<T extends Product>(products: T[], locale: string): T[] {
  return products.map((product) => localizeProduct(product, locale));
}

/** Same for WordPress posts and pages (fields are `{ rendered }` objects there). */
export function localizeEntry<T extends Post | Page>(entry: T, locale: string): T {
  if (locale === SOURCE_LOCALE) return entry;
  const translation = entry.i18n?.[locale];
  if (!translation) return entry;

  return {
    ...entry,
    slug: translation.slug || entry.slug,
    title: translation.title ? { rendered: translation.title } : entry.title,
    excerpt: translation.excerpt
      ? { ...entry.excerpt, rendered: translation.excerpt }
      : entry.excerpt,
    content: translation.content
      ? { ...entry.content, rendered: translation.content }
      : entry.content,
  };
}

export function localizeEntries<T extends Post | Page>(entries: T[], locale: string): T[] {
  return entries.map((entry) => localizeEntry(entry, locale));
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

/** Every published item's slug in every language. [] if the plugin is unavailable. */
export async function getSlugMap(type: SlugType): Promise<SlugEntry[]> {
  if (!baseUrl) return [];

  const tags = ["i18n-slugs", type === "product" ? "products" : `${type}s`];
  if (type === "product") tags.push("woocommerce");
  else tags.push("wordpress");

  try {
    const response = await fetch(
      `${baseUrl}/wp-json/next-i18n/v1/slugs?type=${type}`,
      { next: { tags, revalidate: 3600 } }
    );
    if (!response.ok) return [];
    const data: unknown = await response.json();
    return Array.isArray(data) ? (data as SlugEntry[]) : [];
  } catch {
    console.warn(`next-i18n slug map unavailable for ${type}`);
    return [];
  }
}

/** The item's slug in a locale, falling back to the Italian one. */
function slugFor(entry: SlugEntry, locale: string): string | undefined {
  return entry.slugs[locale] || entry.slugs[SOURCE_LOCALE];
}

/**
 * Find which item a URL slug belongs to. Matches the locale's own slug first,
 * then a slug from any language: that covers the language switcher, which keeps
 * the old slug (/en/shop/... → /es/shop/same-slug) until we redirect.
 */
export async function resolveSlug(type: SlugType, rawSlug: string, locale: string) {
  const slug = decodeURIComponent(rawSlug);
  const map = await getSlugMap(type);
  const entry =
    map.find((item) => item.slugs[locale] === slug) ??
    map.find((item) => Object.values(item.slugs).includes(slug));
  if (!entry) return null;

  return {
    id: entry.id,
    canonicalSlug: slugFor(entry, locale) ?? slug,
    /** Slug per locale, for hreflang alternates */
    alternates: Object.fromEntries(
      routing.locales.map((l) => [l, slugFor(entry, l) ?? slug])
    ) as Record<string, string>,
  };
}

/** Static params for one locale: each item under the slug it has in that language. */
export async function getLocalizedSlugs(type: SlugType, locale: string) {
  const map = await getSlugMap(type);
  return map
    .map((entry) => slugFor(entry, locale))
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => ({ slug }));
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export interface LocalizedProductResult {
  product: Product;
  /** Slug this product should have in the URL for the locale */
  canonicalSlug: string;
  /** Slug per locale, for hreflang alternates */
  alternates: Record<string, string>;
}

/** Product for a URL slug in any language, localised for `locale`. */
export async function getLocalizedProduct(
  slug: string,
  locale: string
): Promise<LocalizedProductResult | undefined> {
  const resolved = await resolveSlug("product", slug, locale);

  if (resolved) {
    const product = await getProductById(resolved.id).catch(() => undefined);
    if (product) {
      return {
        product: localizeProduct(product, locale),
        canonicalSlug: resolved.canonicalSlug,
        alternates: resolved.alternates,
      };
    }
  }

  // Plugin unavailable or item not in the map yet: plain Italian slug lookup
  const product = await getProductBySlug(decodeURIComponent(slug));
  if (!product) return undefined;
  const localized = localizeProduct(product, locale);
  return {
    product: localized,
    canonicalSlug: localized.slug,
    alternates: Object.fromEntries(
      routing.locales.map((l) => [l, localizeProduct(product, l).slug])
    ),
  };
}

// ---------------------------------------------------------------------------
// Posts and pages
// ---------------------------------------------------------------------------

export interface LocalizedEntryResult<T> {
  entry: T;
  canonicalSlug: string;
  alternates: Record<string, string>;
}

async function getLocalizedEntry<T extends Post | Page>(
  type: "post" | "page",
  slug: string,
  locale: string,
  byId: (id: number) => Promise<T>,
  bySlug: (slug: string) => Promise<T | undefined>
): Promise<LocalizedEntryResult<T> | undefined> {
  const resolved = await resolveSlug(type, slug, locale);

  if (resolved) {
    const entry = await byId(resolved.id).catch(() => undefined);
    if (entry) {
      return {
        entry: localizeEntry(entry, locale),
        canonicalSlug: resolved.canonicalSlug,
        alternates: resolved.alternates,
      };
    }
  }

  // Plugin unavailable or item not in the map yet: plain Italian slug lookup
  const entry = await bySlug(decodeURIComponent(slug));
  if (!entry) return undefined;
  const localized = localizeEntry(entry, locale);
  return {
    entry: localized,
    canonicalSlug: localized.slug,
    alternates: Object.fromEntries(
      routing.locales.map((l) => [l, localizeEntry(entry, l).slug])
    ),
  };
}

/** Blog post for a URL slug in any language, localised for `locale`. */
export function getLocalizedPost(slug: string, locale: string) {
  return getLocalizedEntry<Post>("post", slug, locale, getPostById, getPostBySlug);
}

/** WordPress page for a URL slug in any language, localised for `locale`. */
export function getLocalizedPage(slug: string, locale: string) {
  return getLocalizedEntry<Page>("page", slug, locale, getPageById, getPageBySlug);
}
