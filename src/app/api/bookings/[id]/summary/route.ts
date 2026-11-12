import { NextResponse } from "next/server";
import { generateBookingSummary } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { requireSession } from "@/lib/session";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = requireSession(request);
    const { id } = await params;

    const booking = await generateBookingSummary(id, session.id);

    return NextResponse.json({ message: "Summary generated", booking });
  } catch (error) {
    return handleRouteError(error);
  }
}
