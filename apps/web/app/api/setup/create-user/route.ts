import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { hashPassword, verifyTotpCode } from "@envelope/security";
import { issueSession, setSessionCookies } from "@/lib/server/auth";
import { encryptForStorage } from "@/lib/server/secrets";
import { createUserSchema } from "@/lib/server/schemas";
import { badRequest, serverError } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  try {
    const payload = createUserSchema.safeParse(await request.json());
    if (!payload.success) {
      return badRequest(payload.error.message);
    }

    const alreadyConfigured = await appRepository.hasUsers();
    if (alreadyConfigured) {
      return NextResponse.json({ error: "Setup already complete" }, { status: 409 });
    }

    const { email, password, totpCode, totpSecret } = payload.data;

    const validTotp = verifyTotpCode(totpSecret, totpCode);
    if (!validTotp) {
      return badRequest("Invalid TOTP code");
    }

    const passwordHash = await hashPassword(password);
    const user = await appRepository.createUser({ email, passwordHash });

    await appRepository.setTotpFactor({
      userId: user.id,
      encryptedSecret: encryptForStorage(totpSecret),
      isVerified: true,
    });

    const session = await issueSession(user.id);
    await setSessionCookies(session);

    return NextResponse.json({
      user,
      csrfToken: session.csrfToken,
      next: "/setup",
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : "Failed to create user");
  }
}
