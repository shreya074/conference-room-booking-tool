import type { SessionRole, SessionUser } from "@/lib/auth";
import { BookingDomainError } from "@/lib/booking-engine";
import { getSessionFromRequest } from "@/lib/auth";

export function requireSession(request: Request, role?: SessionRole): SessionUser {
  const session = getSessionFromRequest(request);

  if (!session) {
    throw new BookingDomainError("Please login first", 401);
  }

  if (role && session.role !== role) {
    throw new BookingDomainError("You do not have access to this section", 403);
  }

  return session;
}
