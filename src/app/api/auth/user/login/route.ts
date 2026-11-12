import { NextResponse } from "next/server";
import { authenticateUser } from "@/lib/booking-engine";
import { setSessionCookie } from "@/lib/auth";
import { handleRouteError } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { email?: string; password?: string };

    if (!body.email || !body.password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const user = await authenticateUser(body.email, body.password, "EMPLOYEE");

    const response = NextResponse.json({
      message: "Login successful",
      user,
      redirectTo: "/user",
    });

    setSessionCookie(response, {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
