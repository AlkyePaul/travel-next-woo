import type { Product } from "@/lib/woocommerce.d";
import { useTranslations } from "next-intl";
import { isProductInStock, getProductStockStatus } from "@/lib/woocommerce";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface StockBadgeProps {
  product: Product;
  showQuantity?: boolean;
  className?: string;
}

export function StockBadge({
  product,
  showQuantity = false,
  className,
}: StockBadgeProps) {
  const t = useTranslations("Product.stock");
  const inStock = isProductInStock(product);
  const stock = getProductStockStatus(product);
  const message =
    stock.status === "lowStock"
      ? t("lowStock", { count: stock.quantity })
      : t(stock.status);

  const isLowStock =
    product.manage_stock &&
    product.stock_quantity !== null &&
    product.stock_quantity <= (product.low_stock_amount || 3) &&
    product.stock_quantity > 0;

  const isBackorder = product.stock_status === "onbackorder";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {inStock ? (
        <Badge
          variant={isLowStock ? "outline" : "secondary"}
          className={cn(isLowStock && "border-accent/50 text-accent")}
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full mr-2",
              isLowStock ? "bg-accent" : "bg-secondary-foreground"
            )}
          />
          {message}
        </Badge>
      ) : isBackorder ? (
        <Badge variant="outline">
          <span className="w-2 h-2 rounded-full bg-muted-foreground mr-2" />
          {message}
        </Badge>
      ) : (
        <Badge variant="destructive">
          <span className="w-2 h-2 rounded-full bg-destructive-foreground/70 mr-2" />
          {message}
        </Badge>
      )}
    </div>
  );
}
