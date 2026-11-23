"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { ShoppingCart, Plus, Minus, Trash2, ArrowLeft } from "lucide-react";

import { useCart } from "@/components/shop/cart-provider";
import { formatPrice } from "@/lib/woocommerce";
import { Section, Container } from "@/components/craft";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CartBookingDetails } from "@/components/tours/cart-booking";
import { ProductImageFallback } from "@/components/shop/product-image-fallback";

export default function CartPage() {
  const {
    cart,
    isLoading,
    removeItem,
    removeLine,
    updateQuantity,
    clearCart,
  } = useCart();
  const t = useTranslations("Cart");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const price = (value: string) => formatPrice(value, { locale });

  if (isLoading) {
    return (
      <Section>
        <Container>
          <div className="flex items-center justify-center py-12">
            <div className="animate-pulse text-muted-foreground">
              {t("loading")}
            </div>
          </div>
        </Container>
      </Section>
    );
  }

  if (cart.items.length === 0) {
    return (
      <Section>
        <Container>
          <div className="flex flex-col items-center justify-center py-12 space-y-6">
            <ShoppingCart className="h-24 w-24 text-muted-foreground/30" />
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-medium">{t("empty")}</h1>
              <p className="text-muted-foreground">
                {t("emptyDescription")}
              </p>
            </div>
            <Button asChild size="lg">
              <Link href="/shop">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {tc("continueShopping")}
              </Link>
            </Button>
          </div>
        </Container>
      </Section>
    );
  }

  return (
    <Section>
      <Container>
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-medium">{t("title")}</h1>
            <Button variant="ghost" onClick={clearCart}>
              {t("clear")}
            </Button>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-4">
              {cart.items.map((item) => (
                <div
                  key={item.key ?? `${item.productId}-${item.variationId || ""}`}
                  className="flex gap-4 p-4 border rounded-lg"
                >
                  {/* Image */}
                  <div className="relative h-24 w-24 flex-shrink-0 rounded-md overflow-hidden bg-muted">
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    ) : (
                      <ProductImageFallback categorySlugs={[]} />
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium">{item.name}</h3>

                    {item.attributes && item.attributes.length > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {item.attributes.map((a) => a.option).join(", ")}
                      </p>
                    )}

                    {item.booking ? (
                      <>
                        <CartBookingDetails booking={item.booking} className="mt-1 text-sm" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive mt-2 -ml-3"
                          onClick={() => item.key && removeLine(item.key)}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          {t("remove")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="font-medium mt-1">
                          {price(item.price)}
                        </p>

                        {/* Quantity Controls */}
                        <div className="flex items-center gap-4 mt-3">
                          <div className="flex items-center border rounded-md">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.quantity - 1,
                                  item.variationId
                                )
                              }
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-10 text-center">{item.quantity}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={
                                item.soldIndividually ||
                                (item.quantityLimits !== undefined && item.quantity >= item.quantityLimits.max)
                              }
                              onClick={() =>
                                updateQuantity(
                                  item.productId,
                                  item.quantity + 1,
                                  item.variationId
                                )
                              }
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() =>
                              removeItem(item.productId, item.variationId)
                            }
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            {t("remove")}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Line Total */}
                  <div className="text-right">
                    <p className="font-bold">
                      {price(
                        (parseFloat(item.price) * item.quantity).toString()
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="border rounded-lg p-6 space-y-4 sticky top-4">
                <h2 className="text-xl font-medium">{t("orderSummary")}</h2>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("subtotalItems", { count: cart.totals.itemCount })}
                    </span>
                    <span>{price(cart.totals.subtotal)}</span>
                  </div>

                  {parseFloat(cart.totals.shipping) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tc("shipping")}</span>
                      <span>{price(cart.totals.shipping)}</span>
                    </div>
                  )}

                  {parseFloat(cart.totals.tax) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tc("tax")}</span>
                      <span>{price(cart.totals.tax)}</span>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>{tc("total")}</span>
                  <span>{price(cart.totals.total)}</span>
                </div>

                <Button asChild className="w-full" size="lg">
                  <Link href="/checkout">{t("proceedToCheckout")}</Link>
                </Button>

                <Button variant="outline" asChild className="w-full">
                  <Link href="/shop">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {tc("continueShopping")}
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </Section>
  );
}
