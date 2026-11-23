"use client";

import { useState } from "react";
import { ShoppingCart, Plus, Minus, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Product, ProductVariation } from "@/lib/woocommerce.d";
import { isProductInStock } from "@/lib/woocommerce";
import { useCart } from "@/components/shop/cart-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AddToCartButtonProps {
  product: Product;
  variation?: ProductVariation | null;
  className?: string;
  showQuantity?: boolean;
}

export function AddToCartButton({
  product,
  variation,
  className,
  showQuantity = true,
}: AddToCartButtonProps) {
  const { addItem, error: cartError } = useCart();
  const t = useTranslations("Product");
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  // WooCommerce refused the last add (stock, limits, ...): show its message
  const [addFailed, setAddFailed] = useState(false);

  // For variable products, require a variation
  const isVariable = product.type === "variable";
  const needsVariation = isVariable && !variation;

  // Check stock
  const checkableItem = variation || product;
  const inStock =
    checkableItem.stock_status === "instock" ||
    checkableItem.stock_status === "onbackorder";

  // WooCommerce "Sold individually": one per order, so no quantity selector
  const soldIndividually = product.sold_individually;
  const maxQuantity = soldIndividually ? 1 : checkableItem.stock_quantity || 99;

  const handleAddToCart = async () => {
    if (needsVariation || !inStock) return;

    setIsAdding(true);
    setAddFailed(false);

    try {
      const added = await addItem({
        productId: product.id,
        variationId: variation?.id,
        quantity: soldIndividually ? 1 : quantity,
        soldIndividually,
        name: product.name + (variation ? ` - ${variation.attributes.map((a) => a.option).join(", ")}` : ""),
        price: variation?.price || product.price,
        image: (variation?.image || product.images[0])?.src,
        attributes: variation?.attributes,
      });

      if (added) {
        // Reset quantity after adding
        setQuantity(1);
      } else {
        setAddFailed(true);
      }
    } finally {
      setIsAdding(false);
    }
  };

  const incrementQuantity = () => {
    if (quantity < maxQuantity) {
      setQuantity((q) => q + 1);
    }
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity((q) => q - 1);
    }
  };

  if (!inStock) {
    return (
      <Button disabled className={cn("w-full", className)}>
        {t("outOfStock")}
      </Button>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Quantity Selector */}
      {showQuantity && !soldIndividually && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("quantity")}</span>
          <div className="flex items-center border rounded-md">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={decrementQuantity}
              disabled={quantity <= 1}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-12 text-center font-medium">{quantity}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={incrementQuantity}
              disabled={quantity >= maxQuantity}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add to Cart Button */}
      <Button
        onClick={handleAddToCart}
        disabled={needsVariation || isAdding}
        className="w-full"
        size="lg"
      >
        {isAdding ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("adding")}
          </>
        ) : needsVariation ? (
          t("selectOptions")
        ) : (
          <>
            <ShoppingCart className="mr-2 h-4 w-4" />
            {t("addToCart")}
          </>
        )}
      </Button>

      {addFailed && cartError && (
        <p role="alert" className="text-sm text-destructive">
          {cartError}
        </p>
      )}
    </div>
  );
}
