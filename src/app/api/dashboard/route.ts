import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { requireSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const session = requireSession(request);

    const payload = await getDashboard(session.id);
    return NextResponse.json(payload);
  } catch (error) {
    return handleRouteError(error);
  }
}
