import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { encryptForStorage } from "@/lib/server/secrets";
import { gmailConfigSchema } from "@/lib/server/schemas";
import { badRequest } from "@/lib/server/http";
import { runMutationRoute } from "@/lib/server/mutation-route";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async () => {
    const payload = gmailConfigSchema.safeParse(await request.json());
    if (!payload.success) {
      return badRequest(payload.error.message);
    }

    await appRepository.saveOAuthClientConfig({
      providerId: "gmail",
      encryptedClientId: encryptForStorage(payload.data.clientId),
      encryptedClientSecret: encryptForStorage(payload.data.clientSecret),
      redirectUri: payload.data.redirectUri,
      scopes: [
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.labels",
      ],
    });

    return NextResponse.json({ ok: true });
  },
  "Failed to save Gmail config",
);
}
