import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest, requireCsrf } from "@/lib/server/guards";
import { encryptForStorage } from "@/lib/server/secrets";
import { gmailConfigSchema } from "@/lib/server/schemas";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    if (!auth) {
      return unauthorized();
    }
    requireCsrf(request, auth.session.csrfToken);

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
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "INVALID_CSRF") {
      return forbidden("Invalid CSRF token");
    }
    return serverError(error instanceof Error ? error.message : "Failed to save Gmail config");
  }
}
