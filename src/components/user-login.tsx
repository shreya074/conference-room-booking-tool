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

export default function UserLogin() {
  const [email, setEmail] = useState("gnanachaitanyature@gmail.com");
  const [password, setPassword] = useState("User@99899");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAccessRequest, setShowAccessRequest] = useState(false);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestError, setRequestError] = useState("");
  const [requestForm, setRequestForm] = useState({
    name: "",
    email: "",
    department: "",
    password: "",
  });

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = await parseJson<{ redirectTo: string }>(
        await fetch("/api/auth/user/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }),
      );

      window.location.href = payload.redirectTo;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const submitAccessRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRequestError("");
    setRequestMessage("");
    setRequestLoading(true);

    try {
      const payload = await parseJson<{ message: string }>(
        await fetch("/api/user-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestForm),
        }),
      );

      setRequestMessage(payload.message);
      setRequestForm({
        name: "",
        email: "",
        department: "",
        password: "",
      });
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Could not submit access request");
    } finally {
      setRequestLoading(false);
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
          <h1 className="mt-4 text-2xl font-bold text-slate-900">User Login</h1>
          <p className="mt-1 text-sm text-slate-600">Use employee email and password.</p>

          <form onSubmit={submit} className="mt-4 space-y-3">
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
              {loading ? "Logging in..." : "Login as User"}
            </button>
          </form>

          {error ? <p className="mt-3 rounded-lg bg-rose-100 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

          <a href="/admin/login" className="mt-4 block text-sm text-cyan-700 underline">
            Go to Admin login
          </a>

          <button
            type="button"
            onClick={() => setShowAccessRequest((previous) => !previous)}
            className="mt-3 text-sm text-[#4f40df] underline"
          >
            {showAccessRequest ? "Hide access request" : "New user? Request access"}
          </button>

          {showAccessRequest ? (
            <form onSubmit={submitAccessRequest} className="mt-3 space-y-2 rounded-xl border border-slate-200 bg-white/70 p-3">
              <p className="text-xs text-slate-600">
                Submit your details. Admin will approve your account before login is enabled.
              </p>
              <input
                required
                placeholder="Full name"
                value={requestForm.name}
                onChange={(event) =>
                  setRequestForm((previous) => ({ ...previous, name: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="email"
                required
                placeholder="Work email"
                value={requestForm.email}
                onChange={(event) =>
                  setRequestForm((previous) => ({ ...previous, email: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                required
                placeholder="Department"
                value={requestForm.department}
                onChange={(event) =>
                  setRequestForm((previous) => ({ ...previous, department: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <input
                type="password"
                required
                placeholder="Create password"
                value={requestForm.password}
                onChange={(event) =>
                  setRequestForm((previous) => ({ ...previous, password: event.target.value }))
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={requestLoading}
                className="w-full rounded-lg bg-[#5444e8] px-3 py-2 text-sm font-semibold text-white disabled:opacity-70"
              >
                {requestLoading ? "Submitting..." : "Request Admin Approval"}
              </button>
              {requestMessage ? (
                <p className="rounded-lg bg-emerald-100 px-3 py-2 text-xs text-emerald-700">
                  {requestMessage}
                </p>
              ) : null}
              {requestError ? (
                <p className="rounded-lg bg-rose-100 px-3 py-2 text-xs text-rose-700">{requestError}</p>
              ) : null}
            </form>
          ) : null}
        </div>
      </div>
    </main>
  );
}
