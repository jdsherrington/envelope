import { NextResponse, type NextRequest } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { z } from "zod";
import { appRepository } from "@envelope/db";
import { requireSameOrigin } from "@/lib/server/guards";
import { badRequest, forbidden, notFound, serverError } from "@/lib/server/http";
import { resolveWebAuthnRpId } from "@/lib/server/passkeys";

const schema = z.object({
  email: z.string().email(),
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

    const credentials = await appRepository.listPasskeysForUser(user.id);
    if (!credentials.length) {
      return notFound("No passkeys enrolled for this user");
    }

    const options = await generateAuthenticationOptions({
      rpID: resolveWebAuthnRpId(),
      timeout: 60000,
      userVerification: "preferred",
      allowCredentials: credentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports as never,
      })),
    });

    await appRepository.upsertPasskeyChallenge({
      userId: user.id,
      flow: "login",
      challenge: options.challenge,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    return NextResponse.json({ options, email: user.email });
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return forbidden("Invalid request origin");
    }
    return serverError(error instanceof Error ? error.message : "Failed to create login options");
  }
}
