import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import BookingApp from "@/components/booking-app";
import { getSessionFromCookieStore } from "@/lib/auth";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const session = getSessionFromCookieStore(cookieStore);

  if (!session || session.role !== "ADMIN") {
    redirect("/admin/login");
  }

  return <BookingApp mode="admin" />;
}
