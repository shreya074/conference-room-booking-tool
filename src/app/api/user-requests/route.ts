import { NextResponse } from "next/server";
import { getUserAccessRequests, submitUserAccessRequest } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { userAccessRequestSchema } from "@/lib/schemas";
import { requireSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    const session = requireSession(request, "ADMIN");
    const requests = await getUserAccessRequests(session.id);

    return NextResponse.json({ requests });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = userAccessRequestSchema.parse(body);
    const accessRequest = await submitUserAccessRequest(payload);

    return NextResponse.json(
      {
        message: "Access request submitted. Admin approval is pending.",
        request: accessRequest,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
