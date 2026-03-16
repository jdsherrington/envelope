import { NextResponse, type NextRequest } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { z } from "zod";
import { appRepository } from "@envelope/db";
import { badRequest, serverError } from "@/lib/server/http";
import { runMutationRoute } from "@/lib/server/mutation-route";
import { env } from "@/lib/server/env";
import { resolveWebAuthnRpId } from "@/lib/server/passkeys";

const schema = z.object({
  response: z.unknown(),
  name: z.string().optional(),
});

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      const payload = schema.safeParse(await request.json());
      if (!payload.success) {
        return badRequest(payload.error.message);
      }

      const challenge = await appRepository.consumePasskeyChallenge({
        userId: auth.user.id,
        flow: "register",
      });

      if (!challenge) {
        return badRequest("Passkey challenge missing or expired");
      }

      try {
        const verification = await verifyRegistrationResponse({
          response: payload.data.response as never,
          expectedChallenge: challenge.challenge,
          expectedOrigin: env.APP_ORIGIN,
          expectedRPID: resolveWebAuthnRpId(),
        });

        if (!verification.verified || !verification.registrationInfo) {
          return badRequest("Passkey registration verification failed");
        }

        const credential = verification.registrationInfo.credential;

        await appRepository.upsertPasskeyCredential({
          userId: auth.user.id,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey).toString("base64url"),
          counter: credential.counter,
          backedUp: verification.registrationInfo.credentialBackedUp,
          transports: credential.transports ?? [],
          deviceType: verification.registrationInfo.credentialDeviceType,
          name: payload.data.name,
        });

        return NextResponse.json({ ok: true });
      } catch (error) {
        return serverError(error instanceof Error ? error.message : "Failed to verify passkey");
      }
    },
    "Failed to verify passkey registration",
  );
}
