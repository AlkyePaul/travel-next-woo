import { getAllPages } from "@/lib/wordpress";
import { localizeEntries } from "@/lib/i18n-content";
import { decodeEntities } from "@/lib/metadata";
import { Section, Container, Prose } from "@/components/craft";
import { Metadata } from "next";
import BackButton from "@/components/back";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";

type Props = { params: Promise<{ locale: string }> };

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Pages" });

  return {
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: "/pages",
    },
  };
}

export default async function Page({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const [t, sourcePages] = await Promise.all([
    getTranslations("Pages"),
    getAllPages(),
  ]);
  const pages = localizeEntries(sourcePages, locale);

  return (
    <Section>
      <Container className="space-y-6">
        <Prose className="mb-8">
          <h2>{t("title")}</h2>
          {pages.length > 0 ? (
            <ul className="grid">
              {pages.map((page) => (
                <li key={page.id}>
                  <Link href={`/pages/${page.slug}`}>{decodeEntities(page.title.rendered)}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">{t("empty")}</p>
          )}
        </Prose>
        <BackButton />
      </Container>
    </Section>
  );
}
