import crypto from "node:crypto";
import type { NextResponse } from "next/server";

export type SessionRole = "ADMIN" | "EMPLOYEE";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: SessionRole;
};

type SessionPayload = SessionUser & {
  exp: number;
};

const SESSION_COOKIE_NAME = "ob_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getSessionSecret() {
  return process.env.SESSION_SECRET ?? "orientbell-session-secret-change-me";
}

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payloadBase64: string): string {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadBase64)
    .digest("base64url");
}

export function createSessionToken(user: SessionUser): string {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };

  const payloadBase64 = toBase64Url(JSON.stringify(payload));
  const signature = sign(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function verifySessionToken(token: string): SessionUser | null {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    return null;
  }

  const expectedSignature = sign(payloadBase64);
  if (signature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadBase64)) as SessionPayload;
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (payload.exp < nowSeconds) {
      return null;
    }

    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

function getCookieValue(cookieHeader: string, name: string): string | null {
  const cookies = cookieHeader.split(";").map((item) => item.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith(`${name}=`)) {
      return cookie.slice(name.length + 1);
    }
  }
  return null;
}

export function getSessionFromRequest(request: Request): SessionUser | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = getCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export function getSessionFromCookieStore(cookieStore: {
  get(name: string): { value: string } | undefined;
}): SessionUser | null {
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

export function setSessionCookie(response: NextResponse, user: SessionUser) {
  const token = createSessionToken(user);

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    maxAge: 0,
    path: "/",
  });
}
