import { NextResponse, type NextRequest } from "next/server";
import { gmailAdapter } from "@envelope/providers-gmail";
import { appRepository } from "@envelope/db";
import { encryptForStorage } from "@/lib/server/secrets";
import { env } from "@/lib/server/env";
import { loadGmailOauthConfig } from "@/lib/server/provider-context";

const fetchProfileEmail = async (accessToken: string): Promise<string> => {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Gmail profile: ${response.status}`);
  }

  const payload = (await response.json()) as { emailAddress?: string };
  if (!payload.emailAddress) {
    throw new Error("Missing profile email");
  }

  return payload.emailAddress;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/inbox?oauth=missing", env.APP_ORIGIN));
  }

  const stateRecord = await appRepository.consumeOAuthState(state);
  if (!stateRecord) {
    return NextResponse.redirect(new URL("/inbox?oauth=state_invalid", env.APP_ORIGIN));
  }

  try {
    const oauthConfig = await loadGmailOauthConfig();
    const tokenSet = await gmailAdapter.auth.exchangeCodeForTokens({
      oauthConfig,
      code,
      codeVerifier: stateRecord.codeVerifier,
    });

    const email = await fetchProfileEmail(tokenSet.accessToken);

    const account = await appRepository.upsertAccount({
      userId: stateRecord.userId,
      providerId: "gmail",
      email,
      status: "syncing",
      encryptedAccessToken: encryptForStorage(tokenSet.accessToken),
      encryptedRefreshToken: encryptForStorage(tokenSet.refreshToken),
      tokenExpiresAt: new Date(tokenSet.expiresAt),
    });

    if (!account) {
      throw new Error("Failed to upsert account");
    }

    await appRepository.enqueueJob({
      accountId: account.id,
      type: "gmail.initialSync",
      payload: { accountId: account.id },
      idempotencyKey: `initial-sync:${account.id}`,
    });

    return NextResponse.redirect(new URL("/inbox?connected=1", env.APP_ORIGIN));
  } catch {
    return NextResponse.redirect(new URL("/inbox?oauth=error", env.APP_ORIGIN));
  }
}
