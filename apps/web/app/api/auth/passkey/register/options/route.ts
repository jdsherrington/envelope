import { NextResponse, type NextRequest } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { appRepository } from "@envelope/db";
import { runMutationRoute } from "@/lib/server/mutation-route";
import { env } from "@/lib/server/env";
import { resolveWebAuthnRpId } from "@/lib/server/passkeys";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      const existing = await appRepository.listPasskeysForUser(auth.user.id);

      const options = await generateRegistrationOptions({
        rpName: env.WEBAUTHN_RP_NAME,
        rpID: resolveWebAuthnRpId(),
        userName: auth.user.email,
        userID: Buffer.from(auth.user.id, "utf8"),
        timeout: 60000,
        attestationType: "none",
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
        excludeCredentials: existing.map((credential) => ({
          id: credential.credentialId,
          transports: credential.transports as never,
        })),
      });

      await appRepository.upsertPasskeyChallenge({
        userId: auth.user.id,
        flow: "register",
        challenge: options.challenge,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });

      return NextResponse.json({ options });
    },
    "Failed to create passkey registration options",
  );
}
