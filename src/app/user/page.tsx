import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BookingApp from "@/components/booking-app";
import { getSessionFromCookieStore } from "@/lib/auth";

export default async function UserPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookieStore(cookieStore);

  if (!session || session.role !== "EMPLOYEE") {
    redirect("/user/login");
  }

  return <BookingApp mode="user" />;
}
