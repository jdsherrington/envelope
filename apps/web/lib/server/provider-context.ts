import type { ProviderAccountContext } from "@envelope/core";
import { appRepository } from "@envelope/db";
import { decryptFromStorage } from "./secrets";

export const loadGmailOauthConfig = async () => {
  const config = await appRepository.getOAuthClientConfig("gmail");
  if (!config) {
    throw new Error("Missing Gmail OAuth config");
  }

  return {
    clientId: decryptFromStorage(config.encryptedClientId),
    clientSecret: decryptFromStorage(config.encryptedClientSecret),
    redirectUri: config.redirectUri,
    scopes: config.scopes,
  };
};

export const loadAccountProviderContext = async (
  accountId: string,
): Promise<ProviderAccountContext> => {
  const account = await appRepository.loadAccountContext(accountId);
  if (!account) {
    throw new Error("Account not found");
  }

  const oauthConfig = await loadGmailOauthConfig();

  return {
    accountId: account.id,
    email: account.email,
    oauthConfig: {
      clientId: oauthConfig.clientId,
      clientSecret: oauthConfig.clientSecret,
      redirectUri: oauthConfig.redirectUri,
    },
    tokens: {
      accessToken: decryptFromStorage(account.encryptedAccessToken),
      refreshToken: decryptFromStorage(account.encryptedRefreshToken),
      expiresAt: account.tokenExpiresAt.toISOString(),
    },
  };
};
