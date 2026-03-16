import { NextResponse, type NextRequest } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { z } from "zod";
import { appRepository } from "@envelope/db";
import { issueSession, setSessionCookies } from "@/lib/server/auth";
import { requireSameOrigin } from "@/lib/server/guards";
import { badRequest, forbidden, notFound, serverError } from "@/lib/server/http";
import { dbCredentialToWebAuthnCredential, resolveWebAuthnRpId } from "@/lib/server/passkeys";
import { env } from "@/lib/server/env";

const schema = z.object({
  email: z.string().email(),
  response: z.unknown(),
});

export async function POST(request: NextRequest) {
  try {
    requireSameOrigin(request);

    const payload = schema.safeParse(await request.json());
    if (!payload.success) {
      return badRequest(payload.error.message);
    }

    const user = await appRepository.getUserByEmail(payload.data.email);
    if (!user) {
      return notFound("User not found");
    }

    const challenge = await appRepository.consumePasskeyChallenge({
      userId: user.id,
      flow: "login",
    });

    if (!challenge) {
      return badRequest("Passkey challenge missing or expired");
    }

    const response = payload.data.response as { id?: string };
    if (!response.id) {
      return badRequest("Missing passkey credential id");
    }

    const credential = await appRepository.getPasskeyByCredentialId(response.id);
    if (!credential || credential.userId !== user.id) {
      return notFound("Passkey not found");
    }

    const verification = await verifyAuthenticationResponse({
      response: payload.data.response as never,
      expectedChallenge: challenge.challenge,
      expectedOrigin: env.APP_ORIGIN,
      expectedRPID: resolveWebAuthnRpId(),
      credential: dbCredentialToWebAuthnCredential(credential),
    });

    if (!verification.verified) {
      return badRequest("Passkey verification failed");
    }

    await appRepository.updatePasskeyCounter(
      credential.credentialId,
      verification.authenticationInfo.newCounter,
    );

    const session = await issueSession(user.id);
    await setSessionCookies(session);

    return NextResponse.json({ ok: true, csrfToken: session.csrfToken });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return forbidden("Invalid request origin");
    }
    return serverError(error instanceof Error ? error.message : "Failed to verify passkey login");
  }
}
