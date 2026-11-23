import { siteConfig } from "@/site.config";
import type { Metadata } from "next";

/**
 * Strip HTML tags from a string
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed
 */
export function truncateText(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

/**
 * Decode the HTML entities WordPress puts in rendered titles (&#8217;, &amp;, ...)
 */
export function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0",
    hellip: "\u2026", ndash: "\u2013", mdash: "\u2014",
  };
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return named[code.toLowerCase()] ?? match;
  });
}

/**
 * Estimated reading time in minutes (~200 words per minute, at least 1)
 */
export function readingMinutes(html: string): number {
  const words = stripHtml(html).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

interface ContentMetadataOptions {
  title: string;
  excerpt?: string;
  content?: string;
  /** Path including the locale, e.g. /it/blog/my-post */
  path: string;
  /** Cover image; falls back to the generated OG image */
  image?: string;
  /** hreflang alternates: locale -> path */
  languages?: Record<string, string>;
}

/**
 * Generate consistent metadata for posts and pages
 */
export function generateContentMetadata({
  title,
  excerpt,
  content,
  path,
  image,
  languages,
}: ContentMetadataOptions): Metadata {
  const description = decodeEntities(
    excerpt && stripHtml(excerpt)
      ? truncateText(stripHtml(excerpt), 200)
      : content
        ? truncateText(stripHtml(content), 200)
        : ""
  );

  const ogUrl = new URL(`${siteConfig.site_domain}/api/og`);
  ogUrl.searchParams.append("title", title);
  ogUrl.searchParams.append("description", description);
  const imageUrl = image ?? ogUrl.toString();

  return {
    title,
    description,
    alternates: { canonical: path, languages },
    openGraph: {
      title,
      description,
      type: "article",
      url: `${siteConfig.site_domain}${path}`,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}
