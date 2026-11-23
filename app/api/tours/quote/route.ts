// POST /api/tours/quote  { product_id, mode, departure_id | date+time, participants, units, extras }
// Price and validation always come from WordPress (Next Tours plugin).

import { NextRequest, NextResponse } from "next/server";
import { bookingRequestSchema } from "@/lib/tours";
import { ToursApiError, getTourQuote } from "@/lib/tours-api";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { message: "Invalid request", code: "invalid_request" } }, { status: 400 });
  }

  try {
    const quote = await getTourQuote(parsed.data);
    return NextResponse.json(quote, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ToursApiError && error.status === 404) {
      return NextResponse.json({ error: { message: error.message, code: error.code } }, { status: 404 });
    }
    console.error("Tour quote error:", error);
    return NextResponse.json({ error: { message: "Quote unavailable", code: "unavailable" } }, { status: 502 });
  }
}
