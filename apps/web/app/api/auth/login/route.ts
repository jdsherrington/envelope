import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { verifyPassword, verifyTotpCode } from "@envelope/security";
import { getClientRateLimitKey, issueSession, setSessionCookies } from "@/lib/server/auth";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { loginSchema } from "@/lib/server/schemas";
import { decryptFromStorage } from "@/lib/server/secrets";

export async function POST(request: NextRequest) {
  try {
    const payload = loginSchema.safeParse(await request.json());
    if (!payload.success) {
      return badRequest(payload.error.message);
    }

    const rateLimitKey = getClientRateLimitKey(request);
    const rateLimit = await appRepository.checkAndBumpLoginRateLimit(rateLimitKey);
    if (rateLimit.blocked) {
      return forbidden(`Too many attempts. Retry at ${rateLimit.retryAt?.toISOString()}`);
    }

    const user = await appRepository.getUserByEmail(payload.data.email);
    if (!user) {
      return unauthorized("Invalid credentials");
    }

    const passwordOk = await verifyPassword(user.passwordHash, payload.data.password);
    if (!passwordOk) {
      return unauthorized("Invalid credentials");
    }

    const totp = await appRepository.getTotpFactor(user.id);
    if (!totp || !totp.isVerified) {
      return unauthorized("TOTP is not configured");
    }

    const totpSecret = decryptFromStorage(totp.encryptedSecret);
    const totpOk = verifyTotpCode(totpSecret, payload.data.totpCode);
    if (!totpOk) {
      return unauthorized("Invalid credentials");
    }

    await appRepository.resetLoginRateLimit(rateLimitKey);
    const session = await issueSession(user.id);
    await setSessionCookies(session);

    return NextResponse.json({ ok: true, csrfToken: session.csrfToken });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to login");
  }
}
