import { NextResponse, type NextRequest } from "next/server";
import { gmailAdapter } from "@envelope/providers-gmail";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest, requireCsrf } from "@/lib/server/guards";
import { loadGmailOauthConfig } from "@/lib/server/provider-context";
import { generateCodeVerifier, generateState, toCodeChallenge } from "@/lib/server/oauth";
import { forbidden, serverError, unauthorized } from "@/lib/server/http";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    requireCsrf(request, auth.session.csrfToken);

    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = toCodeChallenge(codeVerifier);

    const oauthConfig = await loadGmailOauthConfig();
    await appRepository.createOAuthState({
      state,
      userId: auth.user.id,
      codeVerifier,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const authUrl = await gmailAdapter.auth.getAuthorizationUrl({
      oauthConfig,
      state,
      scopes: oauthConfig.scopes,
      codeChallenge,
      codeChallengeMethod: "S256",
      loginHint: auth.user.email,
    });

    return NextResponse.json({ authUrl });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "INVALID_CSRF") {
      return forbidden("Invalid CSRF token");
    }
    return serverError(error instanceof Error ? error.message : "Failed to start OAuth");
  }
}
