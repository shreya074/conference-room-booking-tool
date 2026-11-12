import { NextResponse } from "next/server";
import { cancelBooking } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { requireSession } from "@/lib/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = requireSession(request);
    const { id } = await params;

    const booking = await cancelBooking(id, session.id);

    return NextResponse.json({ message: "Booking cancelled", booking });
  } catch (error) {
    return handleRouteError(error);
  }
}
