import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Order matters: the first entry is used for fallbacks and the switcher
  locales: ["it", "es", "en"],
  defaultLocale: "it",
  // Every URL carries its locale: /it/shop, /es/shop, /en/shop
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
