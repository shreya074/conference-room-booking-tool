import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BookingDomainError } from "@/lib/booking-engine";

export function handleRouteError(error: unknown) {
  if (error instanceof BookingDomainError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "Invalid request payload",
        details: error.flatten(),
      },
      { status: 400 },
    );
  }

  console.error(error);

  return NextResponse.json(
    { error: "Unexpected server error" },
    { status: 500 },
  );
}
