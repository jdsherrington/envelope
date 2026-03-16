import { ProviderError, type ProviderAccountContext } from "@envelope/core";
import { appRepository } from "@envelope/db";
import { gmailAdapter } from "@envelope/providers-gmail";
import { decryptFromStorage, encryptForStorage } from "./secrets";

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

export const ensureFreshAccountProviderContext = async (
  accountId: string,
): Promise<ProviderAccountContext> => {
  const context = await loadAccountProviderContext(accountId);
  const expiresSoon = new Date(context.tokens.expiresAt).getTime() <= Date.now() + 2 * 60 * 1000;
  if (!expiresSoon) {
    return context;
  }

  try {
    const refreshed = await gmailAdapter.auth.refreshAccessToken({
      oauthConfig: context.oauthConfig,
      refreshToken: context.tokens.refreshToken,
    });

    await appRepository.updateAccountTokens({
      accountId,
      encryptedAccessToken: encryptForStorage(refreshed.accessToken),
      tokenExpiresAt: new Date(refreshed.expiresAt),
    });

    await appRepository.setAccountStatus({
      accountId,
      status: "ok",
      lastErrorCode: null,
      lastErrorMessage: null,
      backoffUntil: null,
    });

    return {
      ...context,
      tokens: {
        ...context.tokens,
        accessToken: refreshed.accessToken,
        expiresAt: refreshed.expiresAt,
      },
    };
  } catch (error) {
    if (error instanceof ProviderError && error.code === "AUTH_REVOKED") {
      await appRepository.setAccountStatus({
        accountId,
        status: "needs_reauth",
        lastErrorCode: error.code,
        lastErrorMessage: error.message,
      });
    }

    throw error;
  }
};
