# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands
- `pnpm dev` - Start development server with turbo mode
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint

## Architecture Overview

Headless WordPress starter using Next.js 16 App Router with TypeScript.

### Data Layer (`lib/wordpress.ts`)
- All WordPress REST API interactions centralized here
- Type definitions in `lib/wordpress.d.ts` (Post, Page, Category, Tag, Author, FeaturedMedia)
- `WordPressAPIError` class for consistent error handling
- Cache tags for granular revalidation: `['wordpress', 'posts', 'post-{id}', 'posts-page-{n}']`
- Pagination via `getPostsPaginated()` returns `{ data, headers: { total, totalPages } }`
- Default cache: 1 hour (`revalidate: 3600`)

### WooCommerce Data Layer (`lib/woocommerce.ts`)
- WooCommerce REST API v3 integration with consumer key/secret auth
- Type definitions in `lib/woocommerce.d.ts` (Product, ProductVariation, Order, Cart, Customer, etc.)
- `WooCommerceAPIError` class for consistent error handling
- Cache tags: `['woocommerce', 'products', 'product-{id}', 'categories', 'orders']`
- Key functions: `getProducts()`, `getProductBySlug()`, `getProductVariations()`, `createOrder()`
- Utility functions: `formatPrice()`, `isProductInStock()`, `calculateDiscountPercentage()`

### Routing
- Dynamic: `/[locale]/blog/[slug]`, `/[locale]/pages/[slug]` (localised slugs via `lib/i18n-content.ts`; old `/posts/*` URLs redirect to `/blog/*`)
- Archives: `/blog`, `/blog/authors`, `/blog/categories`, `/blog/tags`
- Shop: `/shop`, `/shop/[slug]`, `/shop/category/[slug]`
- Cart/Checkout: `/cart`, `/checkout`, `/checkout/success`
- Account: `/account`, `/account/orders`, `/account/orders/[id]`
- API: `/api/revalidate` (webhook), `/api/og` (OG images), `/api/checkout` (order creation)

### Data Fetching Patterns
- Server Components with parallel `Promise.all()` calls
- `generateStaticParams()` uses `getAllPostSlugs()` for static generation
- URL-based state for search/filters via `searchParams`
- Debounced search (300ms) in `SearchInput` component

### Revalidation Flow
1. WordPress plugin sends webhook to `/api/revalidate`
2. Validates `x-webhook-secret` header against `WORDPRESS_WEBHOOK_SECRET`
3. Calls `revalidateTag()` for specific content types (posts, categories, tags, authors)
4. WooCommerce content types: product, product_cat, product_tag, order, stock_update

### Cart System
- Client-side cart with localStorage persistence (`CartProvider` context)
- `useCart()` hook provides: `cart`, `addItem()`, `removeItem()`, `updateQuantity()`, `clearCart()`
- `CartDrawer` component for slide-out cart preview
- Cart state: items array with `{ productId, variationId?, quantity, name, price, image }`

### Checkout & Payment Flow
- User fills billing form on `/checkout`
- Order created in WooCommerce via `/api/checkout` (unpaid)
- User redirected to `order.payment_url` (WooCommerce checkout)
- Payment handled by WooCommerce's configured gateway (Stripe, PayPal, etc.)
- After payment, WooCommerce redirects to `/checkout/success`
- Cart cleared on success page load

### Tours (Next Tours plugin, `plugin/next-tours`)
- Tours are WooCommerce products of type `tour`; data in `product.tour` (types `Tour*` in `lib/woocommerce.d.ts`, helpers in `lib/tours.ts`)
- Booking modes per product, independent of kind: fixed departures and/or open dates; confirmation `instant` or `on_request` (overridable per departure; `quote` pricing is always on request)
- Pricing models: `per_person`, `person_types`, `group_tiers`, `private_group`, `per_unit`, `quote`, plus extras — **prices are computed only by the plugin** (quote endpoint, cart, order creation)
- Listing price (`_price`, "da …") = `from_price()`: adult fare for `person_types`, lowest otherwise, empty for `quote`; empty-price products sort/filter as the most expensive (`class-catalog.php`)
- Storefront → `/api/tours/availability` and `/api/tours/quote` (proxies, `lib/tours-api.ts`) → `BookingWidget` → `addBooking()` (`/api/cart` action `add-booking`, Store API `next_tour` param)
- Checkout sends each booking as line meta `_next_tour_request`; WordPress re-validates/re-prices it; on-request orders get status `tour-request` → `/checkout/success?request=1`, admin confirms (payment link e-mail) or declines in the order screen
- Tour texts are translated via Next i18n (DeepL) into `tour.i18n`, applied by `localizeProduct()`

### FAQ (Next FAQ plugin, `plugin/next-faq`)
- CPT `next_faq` (title = question, content = answer, page-attributes Order = position) in taxonomy `next_faq_list` with two fixed lists: `home` and `product` (one FAQ can be in both)
- `GET /wp-json/next-faq/v1/faqs?list=home|product` → `getFaqs(list, locale)` in `lib/faq.ts` (tags `faqs`, `faqs-{list}`; `[]` if the plugin is missing)
- `FaqList` (`components/faq/faq-list.tsx`): native `<details>` accordion + FAQPage JSON-LD; used at the bottom of the home page and on every product page
- Translations via the Next i18n box (hooked with `next_i18n_post_types`); revalidation via contentType `next_faq` / `next_faq_list`

### Destinations & world map
- Country = WooCommerce category under `destinazioni` whose slug is the lowercase ISO 3166-1 alpha-2 code (`it`, `us`…); `getDestinations()` in `lib/destinations.ts` returns counts per code
- `components/wine-map/`: `WineMap` (server, dots + counts) → `WineMapInteractive` (markers, Europe lens, legend); always-shown wine countries in `countries.ts`; names via `Intl.DisplayNames`
- `map-data.ts` is generated by `scripts/generate-world-dots.mjs` (deps outside the project, see its header)
- `scripts/seed-wine-trips.mjs [--dry-run]` seeds destinations + trips abroad; needs a Read/Write key in `WC_WRITE_CONSUMER_KEY`/`WC_WRITE_CONSUMER_SECRET` (the storefront key is read-only)

### Configuration Files
- `site.config.ts` - Site metadata (domain, name, description)
- `menu.config.ts` - Navigation menu structure
- `next.config.ts` - Image remotePatterns, /admin redirect to WordPress

## Code Style

### TypeScript
- Strict typing with interfaces from `lib/wordpress.d.ts`
- Async params: `params: Promise<{ slug: string }>` (Next.js 15+ pattern)

### Naming
- Components: PascalCase (`PostCard.tsx`)
- Functions/variables: camelCase
- Types/interfaces: PascalCase

### File Structure
- Pages: `/app/**/*.tsx`
- UI components: `/components/ui/*.tsx` (shadcn/ui)
- Feature components: `/components/posts/*.tsx`, `/components/theme/*.tsx`
- Shop components: `/components/shop/*.tsx` (ProductCard, ProductGallery, CartProvider, etc.)
- WordPress functions must include cache tags

## Environment Variables
```
WORDPRESS_URL="https://example.com"           # Full WordPress URL
WORDPRESS_HOSTNAME="example.com"              # For Next.js image optimization
WORDPRESS_WEBHOOK_SECRET="secret-key"         # Webhook validation
NEXT_PUBLIC_WORDPRESS_URL="https://example.com"  # Client-side WordPress URL (for My Account links)

# WooCommerce (required for shop functionality)
WC_CONSUMER_KEY="ck_xxx"                      # WooCommerce REST API consumer key
WC_CONSUMER_SECRET="cs_xxx"                   # WooCommerce REST API consumer secret
```

Note: Payment processing is configured in WooCommerce admin, not in Next.js.

## Key Dependencies
- Next.js 16 with React 19
- Tailwind CSS v4 with `@tailwindcss/postcss`
- shadcn/ui components (Radix primitives)
- brijr/craft for layout (`Section`, `Container`, `Article`, `Prose`)
