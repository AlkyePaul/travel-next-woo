// Cart proxy to the WooCommerce Store API.
//
//   GET  /api/cart?locale=es          → current cart
//   POST /api/cart  { action, ... }   → add-item | add-booking | update-item |
//                                       remove-item | apply-coupon | remove-coupon | clear
//
// add-booking adds a tour: the booking (date, participants, extras) is
// validated and priced by the Next Tours plugin inside WooCommerce.
//
// The browser never sees the Cart-Token: it lives in an httpOnly cookie and is
// forwarded server-side. Responses are normalised and localised (lib/store-api).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { bookingRequestSchema } from "@/lib/tours";
import {
  CART_TOKEN_COOKIE,
  CART_TOKEN_MAX_AGE,
  StoreApiError,
  emptyCart,
  normalizeCart,
  storeFetch,
  type RawCart,
} from "@/lib/store-api";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add-item"),
    id: z.number().int().positive(),
    quantity: z.number().int().min(1).max(999),
  }),
  z.object({
    action: z.literal("add-booking"),
    booking: bookingRequestSchema,
  }),
  z.object({
    action: z.literal("update-item"),
    key: z.string().min(1).max(64),
    quantity: z.number().int().min(0).max(999),
  }),
  z.object({ action: z.literal("remove-item"), key: z.string().min(1).max(64) }),
  z.object({ action: z.literal("apply-coupon"), code: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal("remove-coupon"), code: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal("clear") }),
]);

type CartAction = z.infer<typeof actionSchema>;

function getLocale(value: unknown): string {
  return typeof value === "string" && hasLocale(routing.locales, value)
    ? value
    : routing.defaultLocale;
}

function withToken(response: NextResponse, token: string | null) {
  if (token) {
    response.cookies.set(CART_TOKEN_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CART_TOKEN_MAX_AGE,
    });
  }
  return response;
}

function errorResponse(error: unknown) {
  if (error instanceof StoreApiError) {
    return NextResponse.json(
      { error: { message: error.message, code: error.code } },
      { status: error.status >= 400 && error.status < 500 ? error.status : 502 }
    );
  }
  console.error("Cart proxy error:", error);
  return NextResponse.json(
    { error: { message: "Cart unavailable", code: "cart_unavailable" } },
    { status: 502 }
  );
}

/**
 * Run a Store API call with a session token. Writes without a token would need
 * a nonce, so a session is started first; if the stored token is no longer
 * valid, a fresh session is started once.
 */
async function runWithSession(
  token: string | null,
  call: (token: string | null) => Promise<{ data: RawCart; token: string | null }>
) {
  if (!token) {
    const fresh = await storeFetch<RawCart>("/cart");
    const result = await call(fresh.token);
    return { ...result, token: result.token ?? fresh.token };
  }

  try {
    return await call(token);
  } catch (error) {
    const expired =
      error instanceof StoreApiError &&
      token &&
      (error.status === 401 || error.status === 403);
    if (!expired) throw error;
    const fresh = await storeFetch<RawCart>("/cart");
    const result = await call(fresh.token);
    return { ...result, token: result.token ?? fresh.token };
  }
}

async function performAction(action: CartAction, token: string | null) {
  switch (action.action) {
    case "add-item":
      return storeFetch<RawCart>("/cart/add-item", {
        method: "POST",
        token,
        body: { id: action.id, quantity: action.quantity },
      });
    case "add-booking": {
      const { product_id, ...booking } = action.booking;
      return storeFetch<RawCart>("/cart/add-item", {
        method: "POST",
        token,
        body: { id: product_id, quantity: 1, next_tour: booking },
      });
    }
    case "update-item":
      return action.quantity === 0
        ? storeFetch<RawCart>("/cart/remove-item", { method: "POST", token, body: { key: action.key } })
        : storeFetch<RawCart>("/cart/update-item", {
            method: "POST",
            token,
            body: { key: action.key, quantity: action.quantity },
          });
    case "remove-item":
      return storeFetch<RawCart>("/cart/remove-item", { method: "POST", token, body: { key: action.key } });
    case "apply-coupon":
      return storeFetch<RawCart>("/cart/apply-coupon", { method: "POST", token, body: { code: action.code } });
    case "remove-coupon":
      return storeFetch<RawCart>("/cart/remove-coupon", { method: "POST", token, body: { code: action.code } });
    case "clear": {
      // DELETE /cart/items returns the (empty) item list, not the cart: re-read it
      const cleared = await storeFetch<unknown>("/cart/items", { method: "DELETE", token });
      return storeFetch<RawCart>("/cart", { token: cleared.token ?? token });
    }
  }
}

export async function GET(request: NextRequest) {
  const locale = getLocale(request.nextUrl.searchParams.get("locale"));
  const token = request.cookies.get(CART_TOKEN_COOKIE)?.value ?? null;

  // No session yet: nothing to fetch, and no WooCommerce session is created for browsing visitors
  if (!token) {
    return NextResponse.json({ cart: emptyCart() });
  }

  try {
    const { data, token: newToken } = await storeFetch<RawCart>("/cart", { token });
    return withToken(NextResponse.json({ cart: normalizeCart(data, locale) }), newToken);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { message: "Invalid cart request", code: "invalid_request" } },
      { status: 400 }
    );
  }

  const locale = getLocale(body?.locale);
  const token = request.cookies.get(CART_TOKEN_COOKIE)?.value ?? null;

  try {
    const { data, token: newToken } = await runWithSession(token, (t) =>
      performAction(parsed.data, t)
    );
    return withToken(NextResponse.json({ cart: normalizeCart(data, locale) }), newToken);
  } catch (error) {
    return errorResponse(error);
  }
}
