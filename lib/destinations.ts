import { destinationsRootCategory } from "@/menu.config";
import { getAllProductCategories, getProductCategoryBySlug } from "./woocommerce";

export interface Destination {
  /** ISO 3166-1 alpha-2, uppercase ("IT"). */
  code: string;
  /** WooCommerce category slug (the lowercase code). */
  slug: string;
  /** Published experiences in this country. */
  count: number;
}

const isCountrySlug = (slug: string) => /^[a-z]{2}$/.test(slug);

/**
 * Countries that have experiences, keyed by country code.
 * Destinations are the children of the `destinazioni` category whose slug is a
 * country code; empty categories are left out (WooCommerce hides them).
 */
export async function getDestinations(): Promise<Map<string, Destination>> {
  const [categories, root] = await Promise.all([
    getAllProductCategories(),
    getProductCategoryBySlug(destinationsRootCategory),
  ]);

  const destinations = new Map<string, Destination>();
  for (const category of categories) {
    if (!isCountrySlug(category.slug) || category.count <= 0) continue;
    // Without the root category, fall back to the slug convention alone
    if (root && category.parent !== root.id) continue;
    const code = category.slug.toUpperCase();
    destinations.set(code, { code, slug: category.slug, count: category.count });
  }
  return destinations;
}
