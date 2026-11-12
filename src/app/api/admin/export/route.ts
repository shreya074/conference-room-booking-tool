import { NextResponse } from "next/server";
import { getBookingsCsv } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { requireSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const session = requireSession(request, "ADMIN");
    const csv = await getBookingsCsv(session.id);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="conference-bookings-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
