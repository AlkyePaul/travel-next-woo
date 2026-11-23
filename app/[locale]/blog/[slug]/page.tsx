import { getRelatedPosts } from "@/lib/wordpress";
import { getLocalizedPost, getLocalizedSlugs, localizeEntries } from "@/lib/i18n-content";
import { decodeEntities, generateContentMetadata, readingMinutes, stripHtml } from "@/lib/metadata";

import { Section, Container, Article } from "@/components/craft";
import { PostCard } from "@/components/posts/post-card";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { ArrowLeft } from "lucide-react";

type Props = { params: Promise<{ locale: string; slug: string }> };

// Called once per locale (from the [locale] layout): each post under its translated slug
export async function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  return getLocalizedSlugs("post", params.locale);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const result = await getLocalizedPost(slug, locale);
  if (!result) return {};

  const { entry: post, canonicalSlug, alternates } = result;
  const cover = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;

  return generateContentMetadata({
    title: decodeEntities(post.title.rendered),
    excerpt: post.excerpt.rendered,
    content: post.content.rendered,
    path: `/${locale}/blog/${canonicalSlug}`,
    image: cover,
    languages: Object.fromEntries(
      routing.locales.map((l) => [l, `/${l}/blog/${alternates[l]}`])
    ),
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);

  const result = await getLocalizedPost(slug, locale);
  if (!result) notFound();

  const { entry: post, canonicalSlug } = result;

  // Slug from another language (e.g. after switching language): go to this language's URL
  if (decodeURIComponent(slug) !== canonicalSlug) {
    redirect(`/${locale}/blog/${encodeURIComponent(canonicalSlug)}`);
  }

  const [t, format, related] = await Promise.all([
    getTranslations("Posts"),
    getFormatter(),
    getRelatedPosts(post, 3),
  ]);

  // Everything comes from the embedded data (no extra API calls)
  const cover = post._embedded?.["wp:featuredmedia"]?.[0];
  const author = post._embedded?.author?.[0];
  const terms = post._embedded?.["wp:term"] ?? [];
  const category = terms[0]?.[0];
  const tags = terms[1] ?? [];

  const title = decodeEntities(post.title.rendered);
  const lede = stripHtml(post.excerpt.rendered);
  const date = format.dateTime(new Date(post.date), { dateStyle: "long" });
  const minutes = readingMinutes(post.content.rendered);

  return (
    <Section>
      <Container className="max-w-3xl">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("backToBlog")}
        </Link>

        {/* Header: category, title, lede, meta */}
        <header className="space-y-5 mb-10">
          {category && (
            <Link
              href={`/blog?category=${category.id}`}
              className={cn(badgeVariants({ variant: "outline" }), "no-underline!")}
            >
              {category.name}
            </Link>
          )}
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-balance">
            {title}
          </h1>
          {lede && (
            <p className="text-lg md:text-xl text-muted-foreground text-pretty">{lede}</p>
          )}
          <p className="text-sm text-muted-foreground flex flex-wrap gap-x-2">
            {author?.name && (
              <>
                <Link href={`/blog?author=${author.id}`} className="hover:text-foreground">
                  {author.name}
                </Link>
                <span aria-hidden>·</span>
              </>
            )}
            <time dateTime={post.date}>{date}</time>
            <span aria-hidden>·</span>
            <span>{t("readingTime", { minutes })}</span>
          </p>
        </header>

        {/* Cover: fixed 16:9 frame so every article looks the same */}
        {cover?.source_url && (
          <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted mb-10">
            <Image
              src={cover.source_url}
              alt={cover.alt_text || title}
              fill
              priority
              sizes="(min-width: 768px) 768px, 100vw"
              className="object-cover"
            />
          </div>
        )}

        <Article
          className="max-w-none"
          dangerouslySetInnerHTML={{ __html: post.content.rendered }}
        />

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t">
            {tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/blog?tag=${tag.id}`}
                className={cn(badgeVariants({ variant: "secondary" }), "no-underline!")}
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        )}
      </Container>

      {related.length > 0 && (
        <Container className="mt-16 space-y-6">
          <h2 className="text-2xl font-semibold">{t("related")}</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {localizeEntries(related, locale).map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </Container>
      )}
    </Section>
  );
}
