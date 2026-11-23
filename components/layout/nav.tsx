import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/nav/mobile-nav";
import { LocaleSwitcher } from "@/components/nav/locale-switcher";
import { useTranslations } from "next-intl";
import { CartDrawer } from "@/components/shop";
import { Wordmark } from "@/components/layout/wordmark";
import { mainMenu, menuEntries } from "@/menu.config";
import { cn } from "@/lib/utils";

interface NavProps {
  className?: string;
  children?: React.ReactNode;
  id?: string;
}

export function Nav({ className, children, id }: NavProps) {
  const t = useTranslations("Nav");

  return (
    <nav
      className={cn(
        "sticky z-50 top-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        className,
      )}
      id={id}
    >
      <div
        id="nav-container"
        className="max-w-6xl mx-auto py-3 px-4 sm:px-8 flex justify-between items-center gap-4"
      >
        <Link className="flex items-center hover:opacity-80 transition-opacity" href="/">
          <Wordmark className="text-lg sm:text-xl" />
        </Link>
        {children}
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="mx-2 hidden md:flex">
            {menuEntries(mainMenu).map(([key, href]) => (
              <Button key={href} asChild variant="ghost" size="sm">
                <Link href={href}>{t(key)}</Link>
              </Button>
            ))}
          </div>
          <LocaleSwitcher />
          <CartDrawer />
          <MobileNav />
        </div>
      </div>
    </nav>
  );
}
