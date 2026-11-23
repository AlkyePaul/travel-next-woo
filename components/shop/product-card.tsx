import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";

import type { Product } from "@/lib/woocommerce.d";
import { cn } from "@/lib/utils";
import { formatPrice, calculateDiscountPercentage, isProductInStock } from "@/lib/woocommerce";
import { Badge } from "@/components/ui/badge";
import { TourCardMeta } from "@/components/tours/tour-card-meta";
import { ProductImageFallback } from "@/components/shop/product-image-fallback";
import { experiencesRootCategory } from "@/menu.config";

interface ProductCardProps {
  product: Product;
  priority?: boolean;
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const t = useTranslations("Product");
  const tTour = useTranslations("Tour");
  const locale = useLocale();
  const inStock = isProductInStock(product);
  const discountPercentage = product.on_sale
    ? calculateDiscountPercentage(product.regular_price, product.sale_price)
    : 0;

  const primaryImage = product.images[0];
  // The most specific category: every experience also sits in the root one
  const category =
    product.categories.find((c) => c.slug !== experiencesRootCategory) ??
    product.categories[0];

  return (
    <Link
      href={`/shop/${product.slug}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border bg-card",
        "transition-colors hover:border-primary/40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <div className="relative aspect-[16/9] overflow-hidden bg-muted sm:aspect-[4/3]">
        {primaryImage?.src ? (
          <Image
            src={primaryImage.src}
            alt={primaryImage.alt || product.name}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
          />
        ) : (
          <ProductImageFallback categorySlugs={product.categories.map((c) => c.slug)} />
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col items-start gap-1">
          {product.on_sale && discountPercentage > 0 && (
            <Badge variant="destructive">-{discountPercentage}%</Badge>
          )}
          {product.featured && <Badge variant="secondary">{t("featured")}</Badge>}
          {!inStock && (
            <Badge variant="outline" className="bg-card">
              {t("outOfStock")}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        {category && (
          <span className="text-sm font-medium text-accent">{category.name}</span>
        )}

        <h3 className="text-xl leading-snug line-clamp-2 decoration-primary/50 decoration-1 underline-offset-4 group-hover:underline">
          {product.name}
        </h3>

        {product.tour && <TourCardMeta tour={product.tour} />}

        {/* Price */}
        <div className="mt-auto flex items-center gap-2 border-t pt-4">
          {product.tour ? (
            product.tour.pricing.model === "quote" || !product.tour.pricing.from_price ? (
              <span className="font-medium text-muted-foreground">{t("priceOnRequest")}</span>
            ) : (
              <span className="flex items-baseline gap-1.5">
                <span className="text-sm text-muted-foreground">{tTour("from")}</span>
                <span className="font-display text-xl font-semibold lining-nums">
                  {formatPrice(product.tour.pricing.from_price, {
                    locale,
                    currency: product.tour.pricing.currency || "EUR",
                  })}
                </span>
                <span className="text-sm text-muted-foreground">
                  {tTour("priceUnit", { model: product.tour.pricing.model })}
                </span>
              </span>
            )
          ) : product.on_sale ? (
            <>
              <span className="font-display text-xl font-semibold lining-nums text-primary">
                {formatPrice(product.sale_price, { locale })}
              </span>
              <span className="text-sm text-muted-foreground line-through">
                {formatPrice(product.regular_price, { locale })}
              </span>
            </>
          ) : (
            <span className="font-display text-xl font-semibold lining-nums">
              {product.price
                ? formatPrice(product.price, { locale })
                : t("priceOnRequest")}
            </span>
          )}

          {/* Rating */}
          {product.rating_count > 0 && (
            <span className="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
              <span className="text-primary" aria-hidden>
                ★
              </span>
              <span>{product.average_rating}</span>
              <span>({product.rating_count})</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
