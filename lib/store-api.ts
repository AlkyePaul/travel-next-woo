// WooCommerce Store API client (server-side only, used by /api/cart/*).
//
// The Store API is WooCommerce's headless cart: the cart lives in a WooCommerce
// session, so native rules apply (stock, "sold individually", coupons, taxes,
// shipping, and plugins such as Deposits). A session is identified by a
// Cart-Token (JWT) that we keep in an httpOnly cookie; no nonce is needed when
// the token is sent.

import type { Cart, CartBooking, CartItem, CartTotals, TourBookingRequest } from "./woocommerce.d";

const baseUrl = process.env.WORDPRESS_URL;

export const CART_TOKEN_COOKIE = "woo_cart_token";
/** WooCommerce keeps guest sessions for 48h */
export const CART_TOKEN_MAX_AGE = 60 * 60 * 48;

export class StoreApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "StoreApiError";
  }
}

export interface StoreApiResponse<T> {
  data: T;
  /** Cart-Token returned by WooCommerce (new session or refreshed) */
  token: string | null;
}

export async function storeFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<StoreApiResponse<T>> {
  if (!baseUrl) {
    throw new StoreApiError("WooCommerce not configured", 500, "not_configured");
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers["Cart-Token"] = init.token;

  const response = await fetch(`${baseUrl}/wp-json/wc/store/v1${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new StoreApiError(
      // WooCommerce messages are HTML-escaped ("&quot;viaggio bello&quot; non è disponibile")
      decodeEntities(data?.message ?? `Store API request failed (${response.status})`),
      response.status,
      data?.code
    );
  }

  return { data: data as T, token: response.headers.get("Cart-Token") };
}

// ---------------------------------------------------------------------------
// Raw Store API shapes (only the fields we use)
// ---------------------------------------------------------------------------

interface RawPrices {
  price: string;
  regular_price: string;
  sale_price: string;
  currency_code: string;
  currency_minor_unit: number;
}

interface RawCartItem {
  key: string;
  id: number;
  type?: string;
  quantity: number;
  quantity_limits: { minimum: number; maximum: number; multiple_of: number; editable: boolean };
  name: string;
  sold_individually: boolean;
  images: { src: string; thumbnail: string }[];
  variation: { attribute: string; value: string }[];
  prices: RawPrices;
  totals: { line_subtotal: string; line_total: string; currency_minor_unit: number };
  extensions?: {
    "next-i18n"?: {
      product_id?: number;
      slugs?: Record<string, string>;
      translations?: Record<string, { title?: string }>;
    };
    "next-tours"?: {
      booking?: RawTourBooking | null;
    };
  };
}

/** items[].extensions["next-tours"].booking (Next Tours plugin) */
interface RawTourBooking {
  mode: "departure" | "date";
  departure_id: string;
  date: string;
  time: string;
  end_date: string;
  on_request: boolean;
  model: CartBooking["model"];
  people: number;
  units: number;
  participants: { key: string; label: string; count: number }[];
  extras: { key: string; label: string; qty: number }[];
  total: string;
  request: Omit<TourBookingRequest, "product_id">;
}

function normalizeBooking(raw: RawTourBooking | null | undefined, productId: number): CartBooking | undefined {
  if (!raw || !raw.date) return undefined;
  return {
    mode: raw.mode,
    departureId: raw.departure_id ?? "",
    date: raw.date,
    time: raw.time ?? "",
    endDate: raw.end_date ?? raw.date,
    onRequest: Boolean(raw.on_request),
    model: raw.model,
    people: raw.people ?? 0,
    units: raw.units ?? 0,
    participants: raw.participants ?? [],
    extras: (raw.extras ?? []).map((e) => ({ key: e.key, label: decodeEntities(e.label), qty: e.qty })),
    total: raw.total,
    request: { ...raw.request, product_id: productId },
  };
}

export interface RawCart {
  items: RawCartItem[];
  items_count: number;
  coupons: { code: string; totals: { total_discount: string } }[];
  totals: {
    total_items: string;
    total_discount: string;
    total_shipping: string | null;
    total_tax: string;
    total_price: string;
    currency_code: string;
    currency_minor_unit: number;
  };
  errors: { code: string; message: string }[];
  needs_payment: boolean;
  needs_shipping: boolean;
}

// ---------------------------------------------------------------------------
// Normalisation into the storefront's Cart shape
// ---------------------------------------------------------------------------

/** Store API amounts are integers in minor units ("10000" + 2 → "100.00"). */
function fromMinor(value: string | null | undefined, minorUnit: number): string {
  const amount = Number.parseInt(value ?? "0", 10) || 0;
  return (amount / 10 ** minorUnit).toFixed(minorUnit);
}

/** Store API returns HTML entities in names ("Caff&egrave;"). */
function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function normalizeItem(item: RawCartItem, locale: string): CartItem {
  const i18n = item.extensions?.["next-i18n"];
  const isVariation = item.type === "variation" || item.variation.length > 0;
  const baseName = decodeEntities(item.name);
  const translated = i18n?.translations?.[locale]?.title;

  return {
    key: item.key,
    // The Store API identifies variations by their own id; the parent id comes
    // from the next-i18n extension (falls back to the item id without the plugin)
    productId: i18n?.product_id ?? item.id,
    variationId: isVariation ? item.id : undefined,
    quantity: item.quantity,
    quantityLimits: {
      min: item.quantity_limits.minimum,
      max: item.quantity_limits.maximum,
      step: item.quantity_limits.multiple_of,
      editable: item.quantity_limits.editable,
    },
    name: translated || baseName,
    slug: i18n?.slugs?.[locale] || i18n?.slugs?.it,
    price: fromMinor(item.prices.price, item.prices.currency_minor_unit),
    lineTotal: fromMinor(item.totals.line_total, item.totals.currency_minor_unit),
    image: item.images[0]?.thumbnail || item.images[0]?.src,
    attributes: item.variation.map((v) => ({
      id: 0,
      name: decodeEntities(v.attribute),
      option: decodeEntities(v.value),
    })),
    soldIndividually: item.sold_individually,
    booking: normalizeBooking(item.extensions?.["next-tours"]?.booking, i18n?.product_id ?? item.id),
  };
}

export function normalizeCart(raw: RawCart, locale: string): Cart {
  const minor = raw.totals.currency_minor_unit;
  const totals: CartTotals = {
    subtotal: fromMinor(raw.totals.total_items, minor),
    discount: fromMinor(raw.totals.total_discount, minor),
    shipping: fromMinor(raw.totals.total_shipping, minor),
    tax: fromMinor(raw.totals.total_tax, minor),
    total: fromMinor(raw.totals.total_price, minor),
    itemCount: raw.items_count,
    currency: raw.totals.currency_code,
  };

  return {
    items: raw.items.map((item) => normalizeItem(item, locale)),
    totals,
    coupons: raw.coupons.map((c) => ({
      code: c.code,
      discount: fromMinor(c.totals.total_discount, minor),
    })),
    errors: raw.errors.map((e) => ({ code: e.code, message: decodeEntities(e.message) })),
    needsPayment: raw.needs_payment,
    needsShipping: raw.needs_shipping,
  };
}

export function emptyCart(): Cart {
  return {
    items: [],
    totals: {
      subtotal: "0.00",
      discount: "0.00",
      shipping: "0.00",
      tax: "0.00",
      total: "0.00",
      itemCount: 0,
    },
    coupons: [],
    errors: [],
  };
}
