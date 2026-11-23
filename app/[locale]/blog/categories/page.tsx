import { getAllCategories } from "@/lib/wordpress";
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
    namespace: "Posts.categories",
  });

  return {
    title: t("title"),
    description: t("description"),
    alternates: { canonical: "/blog/categories" },
  };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const [t, categories] = await Promise.all([
    getTranslations("Posts.categories"),
    getAllCategories(),
  ]);
  return (
    <ArchiveList
      items={categories}
      title={t("title")}
      emptyMessage={t("empty")}
      getHref={(category) => `/blog/?category=${category.id}`}
    />
  );
}
