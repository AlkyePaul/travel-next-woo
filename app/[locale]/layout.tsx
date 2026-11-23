import "../globals.css";

import { EB_Garamond, Hanken_Grotesk } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Analytics } from "@vercel/analytics/react";
import { CartProvider } from "@/components/shop";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import { routing } from "@/i18n/routing";

import { siteConfig } from "@/site.config";
import { cn } from "@/lib/utils";

import type { Metadata } from "next";

// Body and UI text
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
});

// Headings: EB Garamond, an old-style book serif (variable weight + italic)
const display = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-garamond",
  style: ["normal", "italic"],
});

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: Omit<Props, "children">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: {
      default: siteConfig.site_name,
      template: `%s | ${siteConfig.site_name}`,
    },
    description: t("description"),
    metadataBase: new URL(siteConfig.site_domain),
    // canonical + hreflang alternates are set per page: a layout-level
    // canonical would point every page at the home page.
  };
}

export default async function LocaleLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enables static rendering for everything below this layout
  setRequestLocale(locale);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(sans.variable, display.variable)}
    >
      <head />
      <body className="min-h-screen flex flex-col font-sans antialiased">
        <NextIntlClientProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <CartProvider>
              <Nav />
              <div className="flex-1">{children}</div>
              <Footer />
            </CartProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
