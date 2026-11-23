// Next Tours REST client (server-side only: used by /api/tours/*).
//
// Availability and quotes change with every booking, so nothing is cached.

import type { TourAvailability, TourBookingRequest, TourQuote } from "./woocommerce.d";

const baseUrl = process.env.WORDPRESS_URL;

export class ToursApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = "ToursApiError";
  }
}

async function toursFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!baseUrl) {
    throw new ToursApiError("WordPress not configured", 500, "not_configured");
  }

  const response = await fetch(`${baseUrl}/wp-json/next-tours/v1${path}`, {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/json",
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ToursApiError(
      data?.message ?? `Next Tours request failed (${response.status})`,
      response.status,
      data?.code
    );
  }
  return data as T;
}

export function getTourAvailability(productId: number, from?: string, to?: string) {
  const params = new URLSearchParams({ product: String(productId) });
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return toursFetch<TourAvailability>(`/availability?${params}`);
}

export function getTourQuote(request: TourBookingRequest) {
  return toursFetch<TourQuote>("/quote", { method: "POST", body: request });
}
