"use client";

import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { ShoppingCart, X, Plus, Minus, Trash2 } from "lucide-react";

import { useCart } from "./cart-provider";
import { formatPrice } from "@/lib/woocommerce";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CartBookingDetails } from "@/components/tours/cart-booking";
import { Separator } from "@/components/ui/separator";
import { ProductImageFallback } from "@/components/shop/product-image-fallback";

export function CartDrawer() {
  const {
    cart,
    isOpen,
    isLoading,
    openCart,
    closeCart,
    removeItem,
    removeLine,
    updateQuantity,
    getItemCount,
  } = useCart();

  const itemCount = getItemCount();
  const t = useTranslations("Cart");
  const tc = useTranslations("Common");
  const locale = useLocale();
  const price = (value: string) => formatPrice(value, { locale });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => (open ? openCart() : closeCart())}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <ShoppingCart className="h-5 w-5" />
          {itemCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
              {itemCount > 99 ? "99+" : itemCount}
            </span>
          )}
          <span className="sr-only">{t("open")}</span>
        </Button>
      </SheetTrigger>

      <SheetContent
        className="flex flex-col w-full sm:max-w-lg"
        closeLabel={tc("close")}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5" />
            {t("drawerTitle", { count: itemCount })}
          </SheetTitle>
        </SheetHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">{tc("loading")}</div>
          </div>
        ) : cart.items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <ShoppingCart className="h-16 w-16 text-muted-foreground/50" />
            <p className="text-muted-foreground">{t("empty")}</p>
            <SheetClose asChild>
              <Button asChild>
                <Link href="/shop">{tc("continueShopping")}</Link>
              </Button>
            </SheetClose>
          </div>
        ) : (
          <>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 py-4">
                {cart.items.map((item) => (
                  <div
                    key={item.key ?? `${item.productId}-${item.variationId || ""}`}
                    className="flex gap-4"
                  >
                    {/* Image */}
                    <div className="relative h-20 w-20 flex-shrink-0 rounded-md overflow-hidden bg-muted">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          className="object-cover"
                          sizes="80px"
                        />
                      ) : (
                        <ProductImageFallback categorySlugs={[]} />
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm line-clamp-2">
                        {item.name}
                      </h4>

                      {item.attributes && item.attributes.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.attributes.map((a) => a.option).join(", ")}
                        </p>
                      )}

                      {item.booking ? (
                        <>
                          <CartBookingDetails booking={item.booking} className="mt-1" />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 mt-1 -ml-2 text-destructive"
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
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex items-center border rounded-md">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() =>
                                  updateQuantity(
                                    item.productId,
                                    item.quantity - 1,
                                    item.variationId
                                  )
                                }
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <span className="w-8 text-center text-sm">
                                {item.quantity}
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
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
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>

                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() =>
                                removeItem(item.productId, item.variationId)
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Line Total */}
                    <div className="text-right">
                      <p className="font-medium">
                        {price(
                          (parseFloat(item.price) * item.quantity).toString()
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="border-t pt-4 space-y-4">
              {/* Totals */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{tc("subtotal")}</span>
                  <span>{price(cart.totals.subtotal)}</span>
                </div>
                {parseFloat(cart.totals.shipping) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{tc("shipping")}</span>
                    <span>{price(cart.totals.shipping)}</span>
                  </div>
                )}
                {parseFloat(cart.totals.tax) > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{tc("tax")}</span>
                    <span>{price(cart.totals.tax)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>{tc("total")}</span>
                  <span>{price(cart.totals.total)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <SheetClose asChild>
                  <Button asChild className="w-full" size="lg">
                    <Link href="/checkout">{t("proceedToCheckout")}</Link>
                  </Button>
                </SheetClose>
                <SheetClose asChild>
                  <Button variant="outline" asChild className="w-full">
                    <Link href="/cart">{t("viewCart")}</Link>
                  </Button>
                </SheetClose>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
