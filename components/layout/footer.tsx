import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Wordmark } from "@/components/layout/wordmark";
import { experienceCategories, mainMenu, menuEntries } from "@/menu.config";
import { siteConfig } from "@/site.config";

const linkClass =
  "text-secondary-foreground/80 hover:text-secondary-foreground hover:underline underline-offset-4";

export function Footer() {
  const t = useTranslations("Nav");
  const tFooter = useTranslations("Footer");
  const tExp = useTranslations("Experiences");
  const tMeta = useTranslations("Metadata");

  return (
    <footer className="bg-secondary text-secondary-foreground">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-14 pb-10 grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="flex flex-col gap-4 max-w-sm">
          <Link href="/" className="self-start">
            <Wordmark
              className="text-2xl"
              ampersandClassName="text-primary-soft"
            />
          </Link>
          <p className="text-sm text-secondary-foreground/75">{tMeta("description")}</p>
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <h2 className="font-sans text-base font-semibold tracking-normal mb-1">
            {tFooter("experiences")}
          </h2>
          {menuEntries(experienceCategories).map(([key, slug]) => (
            <Link key={slug} className={linkClass} href={`/shop/category/${slug}`}>
              {tExp(`${key}.title`)}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-2 text-sm">
          <h2 className="font-sans text-base font-semibold tracking-normal mb-1">
            {t("website")}
          </h2>
          {menuEntries(mainMenu).map(([key, href]) => (
            <Link className={linkClass} key={href} href={href}>
              {t(key)}
            </Link>
          ))}
          <Link className={linkClass} href="/cart">
            {t("cart")}
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <div className="flex flex-col-reverse gap-4 border-t border-secondary-foreground/15 py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-secondary-foreground/70">
            &copy; {siteConfig.site_name}. {tFooter("rights")}
          </p>
          <ThemeToggle className="self-start border-secondary-foreground/25 bg-transparent text-secondary-foreground hover:bg-secondary-foreground/10 hover:text-secondary-foreground" />
        </div>
      </div>
    </footer>
  );
}
