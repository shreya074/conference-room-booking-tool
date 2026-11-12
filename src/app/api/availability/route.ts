import { NextResponse } from "next/server";
import { getAvailability } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { parseBoolean } from "@/lib/schemas";
import { requireSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    requireSession(request);
    const { searchParams } = new URL(request.url);

    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!start || !end) {
      return NextResponse.json(
        { error: "Missing start/end query params" },
        { status: 400 },
      );
    }

    const capacity = searchParams.get("capacity");

    const rooms = await getAvailability({
      start: new Date(start),
      end: new Date(end),
      capacity: capacity ? Number(capacity) : undefined,
      needsVideo: parseBoolean(searchParams.get("needsVideo")),
      needsDisplay: parseBoolean(searchParams.get("needsDisplay")),
      needsWhiteboard: parseBoolean(searchParams.get("needsWhiteboard")),
    });

    return NextResponse.json({ rooms });
  } catch (error) {
    return handleRouteError(error);
  }
}
