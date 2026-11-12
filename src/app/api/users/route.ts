import { NextResponse } from "next/server";
import { createUserByAdmin, getUsers } from "@/lib/booking-engine";
import { handleRouteError } from "@/lib/http";
import { createUserSchema } from "@/lib/schemas";
import { requireSession } from "@/lib/session";

export async function GET(request: Request) {
  try {
    requireSession(request, "ADMIN");
    const users = await getUsers();

    return NextResponse.json({ users });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = requireSession(request, "ADMIN");
    const body = await request.json();
    const payload = createUserSchema.parse(body);

    const user = await createUserByAdmin(session.id, payload);
    return NextResponse.json(
      { message: "User created successfully", user },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
