import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useFormatter, useTranslations } from "next-intl";

import { Post } from "@/lib/wordpress.d";
import { cn } from "@/lib/utils";
import { decodeEntities, readingMinutes, stripHtml, truncateText } from "@/lib/metadata";

// Shared by both cards: everything comes from the embedded data (no API calls)
function usePostSummary(post: Post, excerptLength: number) {
  const t = useTranslations("Posts");
  const format = useFormatter();

  const excerptText = post.excerpt?.rendered
    ? decodeEntities(stripHtml(post.excerpt.rendered))
    : "";

  return {
    t,
    media: post._embedded?.["wp:featuredmedia"]?.[0],
    category: post._embedded?.["wp:term"]?.[0]?.[0],
    title: post.title?.rendered ? decodeEntities(post.title.rendered) : t("untitled"),
    excerpt: excerptText ? truncateText(excerptText, excerptLength) : t("noExcerpt"),
    date: format.dateTime(new Date(post.date), { dateStyle: "long" }),
    minutes: readingMinutes(post.content?.rendered ?? ""),
  };
}

function Cover({ src, alt, sizes }: { src?: string; alt: string; sizes: string }) {
  const tc = useTranslations("Common");
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-md border bg-muted">
      {src ? (
        <Image
          className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          src={src}
          alt={alt}
          fill
          sizes={sizes}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {tc("noImageAvailable")}
        </div>
      )}
    </div>
  );
}

export function PostCard({ post }: { post: Post }) {
  const { t, media, category, title, excerpt, date, minutes } = usePostSummary(post, 120);

  return (
    <Link
      href={`/blog/${post.slug}`}
      className={cn(
        "border p-4 bg-muted/50 rounded-lg group flex justify-between flex-col not-prose gap-6",
        "hover:bg-muted transition-all"
      )}
    >
      <div className="flex flex-col gap-4">
        <Cover
          src={media?.source_url}
          alt={media?.alt_text || title || t("thumbnailAlt")}
          sizes="(min-width: 768px) 33vw, 100vw"
        />
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {category?.name || t("uncategorized")}
        </p>
        <h3 className="text-xl text-primary font-medium group-hover:underline decoration-muted-foreground underline-offset-4 decoration-dotted">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{excerpt}</p>
      </div>

      <div className="flex justify-between items-center text-xs text-muted-foreground border-t pt-4">
        <time dateTime={post.date}>{date}</time>
        <span>{t("readingTime", { minutes })}</span>
      </div>
    </Link>
  );
}

/** Large card for the latest article at the top of the blog. */
export function FeaturedPostCard({ post }: { post: Post }) {
  const { t, media, category, title, excerpt, date, minutes } = usePostSummary(post, 240);

  return (
    <Link
      href={`/blog/${post.slug}`}
      className={cn(
        "border p-4 bg-muted/50 rounded-lg group grid md:grid-cols-2 gap-6 items-center not-prose",
        "hover:bg-muted transition-all"
      )}
    >
      <Cover
        src={media?.source_url}
        alt={media?.alt_text || title || t("thumbnailAlt")}
        sizes="(min-width: 768px) 50vw, 100vw"
      />
      <div className="flex flex-col gap-4 md:pr-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {t("featured")} · {category?.name || t("uncategorized")}
        </p>
        <h2 className="text-2xl md:text-3xl font-semibold text-primary group-hover:underline decoration-muted-foreground underline-offset-4 decoration-dotted">
          {title}
        </h2>
        <p className="text-muted-foreground">{excerpt}</p>
        <p className="text-sm text-muted-foreground">
          <time dateTime={post.date}>{date}</time> · {t("readingTime", { minutes })}
        </p>
      </div>
    </Link>
  );
}
