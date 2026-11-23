// GET /api/tours/availability?product=123&from=2026-12-01&to=2026-12-31
// Proxy to the Next Tours plugin (keeps the WordPress URL server-side, no CORS).

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ToursApiError, getTourAvailability } from "@/lib/tours-api";

const querySchema = z.object({
  product: z.coerce.number().int().positive(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    product: params.get("product"),
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Invalid request", code: "invalid_request" } }, { status: 400 });
  }

  try {
    const availability = await getTourAvailability(parsed.data.product, parsed.data.from, parsed.data.to);
    return NextResponse.json(availability, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ToursApiError && error.status === 404) {
      return NextResponse.json({ error: { message: error.message, code: error.code } }, { status: 404 });
    }
    console.error("Tour availability error:", error);
    return NextResponse.json({ error: { message: "Availability unavailable", code: "unavailable" } }, { status: 502 });
  }
}
