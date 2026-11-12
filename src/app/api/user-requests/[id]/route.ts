import { NextResponse } from "next/server";
import { reviewUserAccessRequest } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { reviewUserRequestSchema } from "@/lib/schemas";
import { requireSession } from "@/lib/session";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Context) {
  try {
    const session = requireSession(request, "ADMIN");
    const { id } = await context.params;
    const body = await request.json();
    const payload = reviewUserRequestSchema.parse(body);

    const requestRow = await reviewUserAccessRequest(
      session.id,
      id,
      payload.decision,
      payload.role,
    );

    return NextResponse.json({
      message:
        payload.decision === "APPROVE"
          ? "Request approved and user created"
          : "Request rejected",
      request: requestRow,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
