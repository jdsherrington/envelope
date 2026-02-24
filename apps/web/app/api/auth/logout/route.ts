import { type NextRequest, NextResponse } from "next/server";
import { appRepository } from "@envelope/db";
import { clearSessionCookies, hashToken } from "@/lib/server/auth";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(process.env["SESSION_COOKIE_NAME"] ?? "envelope_session")?.value;
  if (token) {
    await appRepository.deleteSessionByTokenHash(hashToken(token));
  }
  await clearSessionCookies();
  return NextResponse.json({ ok: true });
}
