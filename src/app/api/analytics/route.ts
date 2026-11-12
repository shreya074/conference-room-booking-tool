import { NextResponse } from "next/server";
import { getAnalytics } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { requireSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const session = requireSession(request, "ADMIN");

    const analytics = await getAnalytics(session.id);
    return NextResponse.json({ analytics });
  } catch (error) {
    return handleRouteError(error);
  }
}
