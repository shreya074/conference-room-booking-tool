import { NextResponse } from "next/server";
import {
  blockUserByAdmin,
  removeUserByAdmin,
  unblockUserByAdmin,
} from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { requireSession } from "@/lib/session";

type UserActionBody = {
  action?: "BLOCK" | "UNBLOCK";
  reason?: string;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = requireSession(request, "ADMIN");
    const { id } = await context.params;
    const body = (await request.json()) as UserActionBody;

    if (body.action === "BLOCK") {
      if (!body.reason || !body.reason.trim()) {
        return NextResponse.json({ error: "Blocking reason is required" }, { status: 400 });
      }

      const user = await blockUserByAdmin(session.id, id, body.reason);
      return NextResponse.json({
        message: `${user.email} has been blocked.`,
        user,
      });
    }

    if (body.action === "UNBLOCK") {
      const user = await unblockUserByAdmin(session.id, id);
      return NextResponse.json({
        message: `${user.email} has been unblocked.`,
        user,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const session = requireSession(request, "ADMIN");
    const { id } = await context.params;

    await removeUserByAdmin(session.id, id);
    return NextResponse.json({ message: "User removed successfully" });
  } catch (error) {
    return handleRouteError(error);
  }
}
