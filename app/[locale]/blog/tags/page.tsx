import { getAllTags } from "@/lib/wordpress";
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
    namespace: "Posts.tags",
  });

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/blog/tags" },
  };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const [t, tags] = await Promise.all([
    getTranslations("Posts.tags"),
    getAllTags(),
  ]);
  return (
    <ArchiveList
      items={tags}
      title={t("title")}
      emptyMessage={t("empty")}
      getHref={(tag) => `/blog/?tag=${tag.id}`}
    />
  );
}
