// Define the menu items.
// Keys double as translation keys in the "Nav" namespace of messages/*.json.
// Internal paths are written without the locale: the i18n Link adds it.
export const mainMenu = {
  home: "/",
  shop: "/shop",
  blog: "/blog",
} as const;

// The three ways to experience wine, by how long they take.
// Keys are translation keys in the "Experiences" namespace; values are
// WooCommerce product category slugs (links go to /shop/category/{slug}).
export const experienceCategories = {
  hours: "esperienze-in-cantina",
  day: "tour-giornalieri-vigneti",
  days: "viaggi-del-vino",
} as const;

// Parent category of all wine-tourism experiences (used for the home page selection)
export const experiencesRootCategory = "enoturismo";

// Parent category of the destinations: one child per country, whose slug is the
// lowercase ISO 3166-1 alpha-2 code ("it", "fr", "us"…). The world map counts
// experiences per country from these categories.
export const destinationsRootCategory = "destinazioni";

export const contentMenu = {
  categories: "/blog/categories",
  tags: "/blog/tags",
  authors: "/blog/authors",
} as const;

// Object.entries() widens keys to string; this keeps them typed for t(key)
export const menuEntries = <T extends Record<string, string>>(menu: T) =>
  Object.entries(menu) as [keyof T & string, string][];

export const shopMenu = {
  products: "/shop",
  cart: "/cart",
  account: "/account",
};
