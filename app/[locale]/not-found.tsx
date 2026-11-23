import { Section, Container } from "@/components/craft";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <Section>
      <Container>
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <h1 className="text-5xl mb-4">{t("title")}</h1>
          <p className="max-w-md text-muted-foreground">{t("description")}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href="/shop">{t("browse")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">{t("backHome")}</Link>
            </Button>
          </div>
        </div>
      </Container>
    </Section>
  );
}
