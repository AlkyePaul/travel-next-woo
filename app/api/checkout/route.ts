import { NextRequest, NextResponse } from "next/server";
import { WooCommerceAPIError, createOrder, getProductById } from "@/lib/woocommerce";
import type { CreateOrderInput } from "@/lib/woocommerce.d";

type LineItem = CreateOrderInput["line_items"][number];

/** Only meta the storefront may set on order lines: the tour booking request. */
const ALLOWED_LINE_META = new Set(["_next_tour_request"]);

function sanitizeLineItems(items: unknown[]): LineItem[] {
  return items.map((raw) => {
    const item = raw as LineItem;
    const meta = Array.isArray(item.meta_data)
      ? item.meta_data
          .filter((m) => ALLOWED_LINE_META.has(m?.key) && typeof m.value === "string" && m.value.length < 4000)
          .map((m) => ({ key: m.key, value: m.value }))
      : [];
    return {
      product_id: Number(item.product_id),
      variation_id: item.variation_id ? Number(item.variation_id) : undefined,
      quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
      ...(meta.length ? { meta_data: meta } : {}),
    };
  });
}

/** Quantity 1 (and a single line) for products marked "Sold individually" in WooCommerce. */
async function enforceSoldIndividually(items: LineItem[]): Promise<LineItem[]> {
  const productIds = [...new Set(items.map((item) => item.product_id))];
  const products = await Promise.all(
    productIds.map((id) => getProductById(id).catch(() => undefined))
  );
  const soldIndividually = new Set(
    products.filter((p) => p?.sold_individually).map((p) => p!.id)
  );

  const seen = new Set<string>();
  const result: LineItem[] = [];
  for (const item of items) {
    // Tour bookings: one line per booking (several dates of the same tour are fine)
    if (item.meta_data?.some((m) => m.key === "_next_tour_request")) {
      result.push({ ...item, quantity: 1 });
      continue;
    }
    if (!soldIndividually.has(item.product_id)) {
      result.push(item);
      continue;
    }
    const key = `${item.product_id}-${item.variation_id ?? 0}`;
    if (seen.has(key)) continue; // duplicate line for the same item
    seen.add(key);
    result.push({ ...item, quantity: 1 });
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.billing?.email) {
      return NextResponse.json(
        { error: "Email is required", code: "emailRequired" },
        { status: 400 }
      );
    }

    if (!body.line_items || body.line_items.length === 0) {
      return NextResponse.json(
        { error: "Cart is empty", code: "cartEmpty" },
        { status: 400 }
      );
    }

    // The WooCommerce REST API does not enforce "Sold individually" (only its own
    // cart does), and the browser cart can be tampered with: enforce it here.
    // Tour lines carry their booking request; the Next Tours plugin re-validates
    // and re-prices it, and may create the order as a "tour-request".
    const lineItems = await enforceSoldIndividually(sanitizeLineItems(body.line_items));

    // Create order in WooCommerce (unpaid - payment handled via WooCommerce checkout)
    const orderData: CreateOrderInput = {
      set_paid: false,
      billing: body.billing,
      shipping: body.shipping,
      line_items: lineItems,
      customer_note: body.customer_note,
    };

    const order = await createOrder(orderData);

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        number: order.number,
        status: order.status,
        total: order.total,
        payment_url: order.payment_url,
        needs_payment: order.needs_payment,
      },
    });
  } catch (error) {
    console.error("Checkout error:", error);

    // A tour booking is no longer valid (seats gone, cutoff passed, ...):
    // the plugin's message says which one and why.
    if (error instanceof WooCommerceAPIError && error.code?.startsWith("next_tours_")) {
      return NextResponse.json(
        { error: error.message, code: "bookingUnavailable" },
        { status: 409 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to create order";

    return NextResponse.json(
      { error: message, code: "orderFailed" },
      { status: 500 }
    );
  }
}
