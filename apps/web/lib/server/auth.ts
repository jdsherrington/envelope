import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { env } from "./env";

const SESSION_COOKIE = env.SESSION_COOKIE_NAME;
const CSRF_COOKIE = "envelope_csrf";

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const issueSession = async (userId: string): Promise<{ token: string; csrfToken: string }> => {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);

  await appRepository.createSession({
    userId,
    tokenHash,
    csrfToken,
    expiresAt,
  });

  return { token, csrfToken };
};

export const setSessionCookies = async (args: {
  token: string;
  csrfToken: string;
}): Promise<void> => {
  const cookieStore = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  cookieStore.set(SESSION_COOKIE, args.token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 60 * 60,
    priority: "high",
  });
  cookieStore.set(CSRF_COOKIE, args.csrfToken, {
    httpOnly: false,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    path: "/",
    maxAge: env.SESSION_TTL_HOURS * 60 * 60,
    priority: "high",
  });
};

export const clearSessionCookies = async (): Promise<void> => {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(CSRF_COOKIE);
};

export const getSessionFromRequest = async (request: NextRequest) => {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const session = await appRepository.getSessionByTokenHash(hashToken(token));
  if (!session) {
    return null;
  }

  const user = await appRepository.getUserById(session.userId);
  if (!user) {
    return null;
  }

  return {
    user,
    session,
    token,
  };
};

export const requireSession = async (request: NextRequest) => {
  const session = await getSessionFromRequest(request);
  if (!session) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
};

export const verifyCsrf = (request: NextRequest, csrfTokenFromSession: string): boolean => {
  const cookieToken = request.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = request.headers.get("x-csrf-token");
  return Boolean(cookieToken && headerToken && cookieToken === headerToken && cookieToken === csrfTokenFromSession);
};

export const getClientRateLimitKey = (request: NextRequest): string => {
  const ipHeader = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip");
  const ip = ipHeader?.split(",")[0]?.trim() ?? "unknown";
  return `${ip}:${request.nextUrl.pathname}`;
};
