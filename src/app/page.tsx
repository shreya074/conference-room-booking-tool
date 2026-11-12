import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <main className="auth-page">
      <div className="auth-collage">
        <div className="auth-collage-grid">
          <div className="auth-scene" />
          <div className="auth-scene" />
          <div className="auth-scene" />
        </div>
      </div>

      <div className="auth-content">
        <section className="auth-card p-6">
          <Image
            src="/orientbell-logo.svg"
            alt="Orientbell Tiles"
            className="auth-logo"
            width={280}
            height={84}
            priority
          />
          <h1 className="mt-4 text-3xl font-bold text-slate-900">Conference Room Platform</h1>
          <p className="mt-2 text-sm text-slate-600">
            Choose your portal to continue with booking operations.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/user/login"
              className="rounded-xl border border-slate-300 bg-white/80 px-4 py-3 text-center text-sm font-semibold text-slate-800 transition hover:bg-white"
            >
              User Portal Login
            </Link>
            <Link
              href="/admin/login"
              className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Admin Portal Login
            </Link>
          </div>

          <div className="mt-5 rounded-lg bg-amber-50/90 px-4 py-3 text-xs text-amber-800">
            <p className="font-semibold">Default credentials</p>
            <p>User 1: `gnanachaitanyature@gmail.com` / `User@99899`</p>
            <p>User 2: `raza@gmail.com` / `User@99738`</p>
            <p>Admin: `navneeth@gmail.com` / `Admin@99899`</p>
          </div>
        </section>
      </div>
    </main>
  );
}
