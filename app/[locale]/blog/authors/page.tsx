import { getAllAuthors } from "@/lib/wordpress";
import { ArchiveList } from "@/components/archive-list";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale: locale as Locale,
    namespace: "Posts.authors",
  });

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/blog/authors" },
  };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const [t, authors] = await Promise.all([
    getTranslations("Posts.authors"),
    getAllAuthors(),
  ]);
  return (
    <ArchiveList
      items={authors}
      title={t("title")}
      emptyMessage={t("empty")}
      getHref={(author) => `/blog/?author=${author.id}`}
    />
  );
}
