"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { ArrowLeft, Loader2 } from "lucide-react";

import { useCart } from "@/components/shop/cart-provider";
import { formatPrice } from "@/lib/woocommerce";
import { Section, Container } from "@/components/craft";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { CartBookingDetails } from "@/components/tours/cart-booking";
import { ProductImageFallback } from "@/components/shop/product-image-fallback";

// Default billing country for each storefront language
const defaultCountry: Record<string, string> = { it: "IT", es: "ES", en: "US" };

// Error codes returned by /api/checkout, mapped to Checkout.errors.* messages
const apiErrorCodes = ["emailRequired", "cartEmpty", "orderFailed", "bookingUnavailable"] as const;
type CheckoutErrorCode = (typeof apiErrorCodes)[number] | "generic";

const isApiErrorCode = (code: unknown): code is CheckoutErrorCode =>
  apiErrorCodes.includes(code as (typeof apiErrorCodes)[number]);

interface CheckoutFormData {
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phone: string;
  notes: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, isLoading, clearCart } = useCart();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<CheckoutErrorCode | null>(null);
  // Detail from WordPress for "bookingUnavailable" (which tour and why)
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  // Some tour bookings need our confirmation: the order is a request, no payment now
  const isRequest = cart.items.some((item) => item.booking?.onRequest);
  const t = useTranslations("Checkout");
  const tc = useTranslations("Common");
  const tCart = useTranslations("Cart");
  const locale = useLocale();
  const price = (value: string) => formatPrice(value, { locale });

  const [formData, setFormData] = useState<CheckoutFormData>({
    email: "",
    firstName: "",
    lastName: "",
    company: "",
    address1: "",
    address2: "",
    city: "",
    state: "",
    postcode: "",
    country: defaultCountry[locale] ?? "US",
    phone: "",
    notes: "",
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setErrorDetail(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billing: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            company: formData.company,
            address_1: formData.address1,
            address_2: formData.address2,
            city: formData.city,
            state: formData.state,
            postcode: formData.postcode,
            country: formData.country,
            email: formData.email,
            phone: formData.phone,
          },
          shipping: {
            first_name: formData.firstName,
            last_name: formData.lastName,
            company: formData.company,
            address_1: formData.address1,
            address_2: formData.address2,
            city: formData.city,
            state: formData.state,
            postcode: formData.postcode,
            country: formData.country,
          },
          line_items: cart.items.map((item) => ({
            product_id: item.productId,
            variation_id: item.variationId,
            quantity: item.quantity,
            // Tours: the booking is re-validated and re-priced by WordPress
            ...(item.booking
              ? { meta_data: [{ key: "_next_tour_request", value: JSON.stringify(item.booking.request) }] }
              : {}),
          })),
          customer_note: formData.notes,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(isApiErrorCode(data.code) ? data.code : "orderFailed");
        if (data.code === "bookingUnavailable" && typeof data.error === "string") {
          setErrorDetail(data.error);
        }
        return;
      }

      const { order } = await response.json();

      // Booking request: nothing to pay until we confirm it
      if (order.status === "tour-request") {
        clearCart();
        router.push(`/checkout/success?order=${order.id}&request=1`);
        return;
      }

      // Store order ID for reference, then redirect to WooCommerce payment
      if (typeof window !== "undefined") {
        sessionStorage.setItem("pending_order_id", order.id.toString());
      }

      // Redirect to WooCommerce checkout for payment
      if (order.payment_url) {
        window.location.href = order.payment_url;
      } else {
        // Fallback if no payment needed (free order)
        clearCart();
        router.push(`/checkout/success?order=${order.id}`);
      }
    } catch (err) {
      console.error("Checkout failed:", err);
      setError("generic");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <Section>
        <Container>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
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
            <div className="text-center space-y-2">
              <h1 className="text-2xl font-medium">{tCart("empty")}</h1>
              <p className="text-muted-foreground">
                {t("emptyDescription")}
              </p>
            </div>
            <Button asChild>
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
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/cart">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <h1 className="text-3xl font-medium">{t("title")}</h1>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
              {t(`errors.${error}`)}
              {errorDetail && <p className="text-sm mt-1">{errorDetail}</p>}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Billing Details */}
              <div className="lg:col-span-2 space-y-6">
                <div className="border rounded-lg p-6 space-y-4">
                  <h2 className="text-xl font-medium">{t("billingDetails")}</h2>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">{t("firstName")}</Label>
                      <Input
                        id="firstName"
                        name="firstName"
                        required
                        value={formData.firstName}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">{t("lastName")}</Label>
                      <Input
                        id="lastName"
                        name="lastName"
                        required
                        value={formData.lastName}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="company">{t("company")}</Label>
                    <Input
                      id="company"
                      name="company"
                      value={formData.company}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email">{t("email")}</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">{t("phone")}</Label>
                    <Input
                      id="phone"
                      name="phone"
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address1">{t("address")}</Label>
                    <Input
                      id="address1"
                      name="address1"
                      required
                      placeholder={t("addressPlaceholder")}
                      value={formData.address1}
                      onChange={handleInputChange}
                    />
                    <Input
                      id="address2"
                      name="address2"
                      placeholder={t("address2Placeholder")}
                      value={formData.address2}
                      onChange={handleInputChange}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">{t("city")}</Label>
                      <Input
                        id="city"
                        name="city"
                        required
                        value={formData.city}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="state">{t("state")}</Label>
                      <Input
                        id="state"
                        name="state"
                        required
                        value={formData.state}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="postcode">{t("postcode")}</Label>
                      <Input
                        id="postcode"
                        name="postcode"
                        required
                        value={formData.postcode}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">{t("country")}</Label>
                      <Input
                        id="country"
                        name="country"
                        required
                        value={formData.country}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg p-6 space-y-4">
                  <h2 className="text-xl font-medium">{t("orderNotes")}</h2>
                  <textarea
                    name="notes"
                    rows={4}
                    className="w-full px-3 py-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={t("notesPlaceholder")}
                    value={formData.notes}
                    onChange={handleInputChange}
                  />
                </div>
              </div>

              {/* Order Summary */}
              <div className="lg:col-span-1">
                <div className="border rounded-lg p-6 space-y-4 sticky top-4">
                  <h2 className="text-xl font-medium">{t("yourOrder")}</h2>

                  <div className="space-y-3">
                    {cart.items.map((item) => (
                      <div
                        key={item.key ?? `${item.productId}-${item.variationId || ""}`}
                        className="flex gap-3"
                      >
                        <div className="relative h-16 w-16 flex-shrink-0 rounded-md overflow-hidden bg-muted">
                          {item.image ? (
                            <Image
                              src={item.image}
                              alt={item.name}
                              fill
                              className="object-cover"
                              sizes="64px"
                            />
                          ) : (
                            <ProductImageFallback categorySlugs={[]} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium line-clamp-2">
                            {item.name}
                          </p>
                          {item.booking ? (
                            <CartBookingDetails booking={item.booking} className="mt-0.5" />
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              {t("quantity", { quantity: item.quantity })}
                            </p>
                          )}
                        </div>
                        <p className="text-sm font-medium">
                          {price(
                            (parseFloat(item.price) * item.quantity).toString()
                          )}
                        </p>
                      </div>
                    ))}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tc("subtotal")}</span>
                      <span>{price(cart.totals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tc("shipping")}</span>
                      <span>{t("shippingNextStep")}</span>
                    </div>
                  </div>

                  <Separator />

                  <div className="flex justify-between text-lg font-bold">
                    <span>{tc("total")}</span>
                    <span>{price(cart.totals.total)}</span>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t("processing")}
                      </>
                    ) : isRequest ? (
                      t("sendRequest")
                    ) : (
                      t("proceedToPayment")
                    )}
                  </Button>

                  {isRequest && (
                    <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">
                      {t("requestNote")}
                    </p>
                  )}

                  <p className="text-xs text-center text-muted-foreground">
                    {t("terms")}
                  </p>
                </div>
              </div>
            </div>
          </form>
        </div>
      </Container>
    </Section>
  );
}
