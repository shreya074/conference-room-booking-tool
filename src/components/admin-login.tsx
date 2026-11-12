"use client";

import Image from "next/image";
import { useState } from "react";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }
  return payload as T;
}

export default function AdminLogin() {
  const [email, setEmail] = useState("navneeth@gmail.com");
  const [password, setPassword] = useState("Admin@99899");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = await parseJson<{ redirectTo: string }>(
        await fetch("/api/auth/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }),
      );

      window.location.href = payload.redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin login failed");
    } finally {
      setLoading(false);
    }
  };

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
        <div className="auth-card p-6">
          <Image
            src="/orientbell-logo.svg"
            alt="Orientbell Tiles"
            className="auth-logo"
            width={260}
            height={78}
            priority
          />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Admin Login</h1>
          <p className="mt-1 text-sm text-slate-600">Use admin email and password.</p>

          <form onSubmit={login} className="mt-4 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white/85 px-3 py-2 text-sm"
            />
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white/85 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"
            >
              {loading ? "Logging in..." : "Login as Admin"}
            </button>
          </form>

          {error ? <p className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          <a href="/user/login" className="mt-4 block text-sm text-cyan-700 underline">
            Go to User login
          </a>
        </div>
      </div>
    </main>
  );
}
