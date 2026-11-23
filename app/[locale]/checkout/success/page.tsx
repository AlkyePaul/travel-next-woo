"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { CheckCircle, Loader2 } from "lucide-react";

import { useCart } from "@/components/shop/cart-provider";
import { Section, Container } from "@/components/craft";
import { Button } from "@/components/ui/button";

function SuccessContent() {
  const searchParams = useSearchParams();
  const { clearCart } = useCart();
  const t = useTranslations("CheckoutSuccess");
  const tc = useTranslations("Common");
  const orderId = searchParams.get("order") || searchParams.get("order-received");
  // Tour booking request (needs our confirmation, nothing paid yet)
  const isRequest = searchParams.get("request") === "1";

  useEffect(() => {
    // Clear cart on success page load (payment completed)
    clearCart();

    // Clear pending order from session storage
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("pending_order_id");
    }
  }, [clearCart, searchParams]);

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6 text-center">
      <div className="h-24 w-24 rounded-full bg-secondary flex items-center justify-center">
        <CheckCircle className="h-12 w-12 text-secondary-foreground" strokeWidth={1.5} />
      </div>

      <div className="space-y-2">
        <h1 className="text-4xl font-medium">{isRequest ? t("requestTitle") : t("title")}</h1>
        <p className="text-muted-foreground max-w-md">
          {isRequest ? t("requestDescription") : t("description")}
        </p>
      </div>

      {orderId && (
        <div className="bg-muted px-6 py-4 rounded-lg">
          <p className="text-sm text-muted-foreground">
            {isRequest ? t("requestNumber") : t("orderNumber")}
          </p>
          <p className="font-display text-3xl font-semibold lining-nums">#{orderId}</p>
        </div>
      )}

      <div className="flex gap-4">
        <Button asChild>
          <Link href="/shop">{tc("continueShopping")}</Link>
        </Button>
        {orderId && (
          <Button variant="outline" asChild>
            <Link href={`/account/orders/${orderId}`}>{t("viewOrder")}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  const t = useTranslations("CheckoutSuccess");

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6">
      <Loader2 className="h-8 w-8 animate-spin" />
      <p className="text-muted-foreground">{t("loading")}</p>
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Section>
      <Container>
        <Suspense fallback={<LoadingState />}>
          <SuccessContent />
        </Suspense>
      </Container>
    </Section>
  );
}
