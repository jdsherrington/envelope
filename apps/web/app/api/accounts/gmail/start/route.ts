import { NextResponse, type NextRequest } from "next/server";
import { gmailAdapter } from "@envelope/providers-gmail";
import { appRepository } from "@envelope/db";
import { loadGmailOauthConfig } from "@/lib/server/provider-context";
import { generateCodeVerifier, generateState, toCodeChallenge } from "@/lib/server/oauth";
import { runMutationRoute } from "@/lib/server/mutation-route";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
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
  },
  "Failed to start OAuth",
);
}
