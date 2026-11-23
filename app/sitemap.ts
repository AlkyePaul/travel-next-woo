import { MetadataRoute } from "next";
import { getAllPostsForSitemap, getAllPages } from "@/lib/wordpress";
import { getSlugMap } from "@/lib/i18n-content";
import { routing } from "@/i18n/routing";
import { siteConfig } from "@/site.config";

type Entry = MetadataRoute.Sitemap[number];

// One sitemap entry per locale, each listing the others as hreflang alternates
function localized(
  path: string,
  rest: Omit<Entry, "url" | "alternates">
): MetadataRoute.Sitemap {
  const url = (locale: string) =>
    `${siteConfig.site_domain}/${locale}${path === "/" ? "" : path}`;
  const languages = Object.fromEntries(
    routing.locales.map((locale) => [locale, url(locale)])
  );

  return routing.locales.map((locale) => ({
    ...rest,
    url: url(locale),
    alternates: { languages },
  }));
}

/** One entry per locale for a CMS item, each under its own translated slug. */
function localizedItem(
  section: string,
  slugs: Record<string, string>,
  rest: Omit<Entry, "url" | "alternates">
): MetadataRoute.Sitemap {
  const url = (locale: string) =>
    `${siteConfig.site_domain}/${locale}/${section}/${slugs[locale]}`;
  const languages = Object.fromEntries(
    routing.locales.map((locale) => [locale, url(locale)])
  );

  return routing.locales.map((locale) => ({
    ...rest,
    url: url(locale),
    alternates: { languages },
  }));
}

/** Slug per locale for an item, falling back to the Italian slug. */
function slugsFor(
  map: Awaited<ReturnType<typeof getSlugMap>>,
  id: number,
  fallback: string
): Record<string, string> {
  const entry = map.find((item) => item.id === id);
  return Object.fromEntries(
    routing.locales.map((l) => [l, entry?.slugs[l] || fallback])
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, pages, postSlugs, pageSlugs] = await Promise.all([
    getAllPostsForSitemap(),
    getAllPages(),
    getSlugMap("post"),
    getSlugMap("page"),
  ]);

  const staticUrls: MetadataRoute.Sitemap = [
    ...localized("/", { lastModified: new Date(), changeFrequency: "yearly", priority: 1 }),
    ...localized("/shop", { lastModified: new Date(), changeFrequency: "daily", priority: 0.9 }),
    ...localized("/blog", { lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 }),
    ...localized("/pages", { lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 }),
    ...localized("/blog/authors", { lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 }),
    ...localized("/blog/categories", { lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 }),
    ...localized("/blog/tags", { lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 }),
  ];

  const postUrls = posts.flatMap((post) =>
    localizedItem("blog", slugsFor(postSlugs, post.id, post.slug), {
      lastModified: new Date(post.modified),
      changeFrequency: "weekly",
      priority: 0.6,
    })
  );

  const pageUrls = pages.flatMap((page) =>
    localizedItem("pages", slugsFor(pageSlugs, page.id, page.slug), {
      lastModified: new Date(page.modified),
      changeFrequency: "monthly",
      priority: 0.5,
    })
  );

  return [...staticUrls, ...postUrls, ...pageUrls];
}
