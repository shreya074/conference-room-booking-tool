import { NextResponse } from "next/server";
import { getReminders } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { requireSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const session = requireSession(request);
    const reminders = await getReminders(session.id);
    return NextResponse.json({ reminders });
  } catch (error) {
    return handleRouteError(error);
  }
}
