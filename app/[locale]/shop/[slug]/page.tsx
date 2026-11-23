import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";

import {
  getProductVariations,
  getProductReviews,
  getRelatedProducts,
} from "@/lib/woocommerce";
import {
  getLocalizedProduct,
  getLocalizedSlugs,
  localizeProducts,
} from "@/lib/i18n-content";

import { Section, Container, Prose } from "@/components/craft";
import {
  ProductGallery,
  PriceDisplay,
  StockBadge,
  AddToCartButton,
  ProductGrid,
} from "@/components/shop";
import { VariationSelector } from "@/components/shop/variation-selector";
import { BookingWidget } from "@/components/tours/booking-widget";
import { TourDetails, TourFacts, TourPrice } from "@/components/tours/tour-details";
import { isTourProduct } from "@/lib/tours";
import { getFaqs } from "@/lib/faq";
import { FaqList } from "@/components/faq/faq-list";
import { experiencesRootCategory } from "@/menu.config";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ProductDetailClient } from "./product-detail-client";

interface ProductPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

// Called once per locale (from the [locale] layout): each product under its translated slug
export async function generateStaticParams({
  params,
}: {
  params: { locale: string };
}) {
  return getLocalizedSlugs("product", params.locale);
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const [t, result] = await Promise.all([
    getTranslations({ locale: locale as Locale, namespace: "Product" }),
    getLocalizedProduct(slug, locale),
  ]);

  if (!result) {
    return {
      title: t("notFound"),
    };
  }

  const { product, canonicalSlug, alternates } = result;

  return {
    title: product.name,
    alternates: {
      canonical: `/${locale}/shop/${canonicalSlug}`,
      languages: Object.fromEntries(
        routing.locales.map((l) => [l, `/${l}/shop/${alternates[l]}`])
      ),
    },
    description: product.short_description.replace(/<[^>]*>/g, "").slice(0, 160),
    openGraph: {
      title: product.name,
      description: product.short_description.replace(/<[^>]*>/g, ""),
      images: product.images[0]?.src ? [product.images[0].src] : [],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale as Locale);
  const [t, tNav, format] = await Promise.all([
    getTranslations("Product"),
    getTranslations("Nav"),
    getFormatter(),
  ]);
  const result = await getLocalizedProduct(slug, locale);

  if (!result) {
    notFound();
  }

  const { product, canonicalSlug } = result;
  // Breadcrumb: the most specific category (every experience also sits in the root one)
  const breadcrumbCategory =
    product.categories.find((c) => c.slug !== experiencesRootCategory) ??
    product.categories[0];

  // Slug from another language (e.g. after switching language): go to this language's URL
  if (decodeURIComponent(slug) !== canonicalSlug) {
    redirect(`/${locale}/shop/${encodeURIComponent(canonicalSlug)}`);
  }

  // Fetch additional data in parallel
  const [variations, reviews, related, faqs, tFaq] = await Promise.all([
    product.type === "variable" ? getProductVariations(product.id) : [],
    getProductReviews(product.id),
    getRelatedProducts(product.id, 4),
    getFaqs("product", locale),
    getTranslations("Faq"),
  ]);
  const relatedProducts = localizeProducts(related, locale);
  const tour = isTourProduct(product) ? product.tour : null;
  // Tour labels already in this language (Italian source, or translated by the plugin)
  const tourTranslated = locale === routing.defaultLocale || Boolean(tour?.i18n?.[locale]);

  return (
    <Section>
      <Container>
        <div className="space-y-12">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link href="/shop" className="hover:text-foreground">
              {tNav("shop")}
            </Link>
            <span>/</span>
            {breadcrumbCategory && (
              <>
                <Link
                  href={`/shop/category/${breadcrumbCategory.slug}`}
                  className="hover:text-foreground"
                >
                  {breadcrumbCategory.name}
                </Link>
                <span>/</span>
              </>
            )}
            <span className="text-foreground">{product.name}</span>
          </nav>

          {/* Product Details */}
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Gallery */}
            <ProductGallery
              images={product.images}
              productName={product.name}
              categorySlugs={product.categories.map((c) => c.slug)}
            />

            {/* Info */}
            <div className="space-y-6">
              {/* Categories */}
              {product.categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {product.categories.map((cat) => (
                    <Link
                      key={cat.id}
                      href={`/shop?category=${cat.slug}`}
                    >
                      <Badge variant="secondary">{cat.name}</Badge>
                    </Link>
                  ))}
                </div>
              )}

              {/* Title */}
              <h1 className="text-4xl md:text-5xl leading-[1.1]">{product.name}</h1>

              {/* Rating */}
              {product.rating_count > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={
                          i < Math.round(parseFloat(product.average_rating))
                            ? "text-primary"
                            : "text-muted-foreground/30"
                        }
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {t("reviewCount", { count: product.rating_count })}
                  </span>
                </div>
              )}

              {/* Price */}
              {tour ? (
                <TourPrice tour={tour} />
              ) : (
                <>
                  <PriceDisplay
                    price={product.price}
                    regularPrice={product.regular_price}
                    salePrice={product.sale_price}
                    onSale={product.on_sale}
                    size="lg"
                  />

                  {/* Stock */}
                  <StockBadge product={product} showQuantity />
                </>
              )}

              {tour && <TourFacts tour={tour} />}

              {/* Short Description */}
              {product.short_description && (
                <Prose>
                  <div className="text-muted-foreground">
                    {product.short_description.replace(/<[^>]*>/g, "")}
                  </div>
                </Prose>
              )}

              <Separator />

              {/* Tour booking / Variable Product Handler (Client Components) */}
              {tour ? (
                <BookingWidget productId={product.id} tour={tour} translated={tourTranslated} />
              ) : product.type === "variable" && variations.length > 0 ? (
                <ProductDetailClient product={product} variations={variations} />
              ) : (
                <AddToCartButton product={product} />
              )}

              <Separator />

              {/* Product Meta */}
              <div className="space-y-2 text-sm">
                {product.sku && (
                  <p>
                    <span className="text-muted-foreground">{t("sku")}</span>{" "}
                    {product.sku}
                  </p>
                )}
                {product.tags.length > 0 && (
                  <p>
                    <span className="text-muted-foreground">{t("tags")}</span>{" "}
                    {product.tags.map((tag, i) => (
                      <span key={tag.id}>
                        <Link
                          href={`/shop?tag=${tag.slug}`}
                          className="hover:underline"
                        >
                          {tag.name}
                        </Link>
                        {i < product.tags.length - 1 && ", "}
                      </span>
                    ))}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Full Description */}
          {product.description && (
            <div className="space-y-4">
              <h2 className="text-3xl font-medium">{t("description")}</h2>
              <Prose>
                <div className="text-muted-foreground">
                  {product.description.replace(/<[^>]*>/g, "")}
                </div>
              </Prose>
            </div>
          )}

          {/* Tour: highlights, itinerary, inclusions, meeting point, policies */}
          {tour && <TourDetails tour={tour} />}

          {/* FAQ (managed in WordPress, "Next FAQ" plugin, list "Pagine prodotto") */}
          {faqs.length > 0 && (
            <section className="space-y-6">
              <h2 className="text-3xl font-medium">{tFaq("title")}</h2>
              <FaqList faqs={faqs} className="max-w-3xl" />
            </section>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-medium">
                {t("reviews", { count: reviews.length })}
              </h2>
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div key={review.id} className="border rounded-lg p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{review.reviewer}</span>
                        {review.verified && (
                          <Badge variant="secondary">{t("verified")}</Badge>
                        )}
                      </div>
                      <div className="flex">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            className={
                              i < review.rating
                                ? "text-primary"
                                : "text-muted-foreground/30"
                            }
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </div>
                    <p className="text-muted-foreground">
                      {review.review.replace(/<[^>]*>/g, "")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format.dateTime(new Date(review.date_created), {
                        dateStyle: "medium",
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related Products */}
          {relatedProducts.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-3xl font-medium">{t("related")}</h2>
              <ProductGrid products={relatedProducts} columns={4} />
            </div>
          )}
        </div>
      </Container>
    </Section>
  );
}
