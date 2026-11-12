import { NextResponse } from "next/server";
import { releaseBooking } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { requireSession } from "@/lib/session";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = requireSession(request);
    const { id } = await params;

    const booking = await releaseBooking(id, session.id);

    return NextResponse.json({ message: "Room released", booking });
  } catch (error) {
    return handleRouteError(error);
  }
}
