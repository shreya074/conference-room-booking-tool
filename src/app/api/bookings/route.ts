import { NextResponse } from "next/server";
import { createBooking, getBookings } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { createBookingSchema } from "@/lib/schemas";
import { requireSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const session = requireSession(request);

    const bookings = await getBookings(session.id);
    return NextResponse.json({ bookings });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request);
    const body = await request.json();
    const payload = createBookingSchema.parse({
      ...body,
      userId: session.id,
      attendeeCount: Number(body.attendeeCount),
      recurrenceCount:
        body.recurrenceCount === undefined
          ? undefined
          : Number(body.recurrenceCount),
    });

    const bookings = await createBooking(payload);

    return NextResponse.json(
      {
        message:
          bookings.length > 1
            ? `${bookings.length} recurring bookings created successfully`
            : "Booking created successfully",
        bookings,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
