import type { ProviderAccountContext } from "@envelope/core";
import { appRepository } from "@envelope/db";
import {
  decryptSecret,
  getSecretsKey,
  parseEncryptedSecret,
} from "@envelope/security";
import { env } from "./env";

const key = getSecretsKey(env.ENVELOPE_SECRETS_KEY);

const decryptFromStorage = (value: string): string =>
  decryptSecret(parseEncryptedSecret(value), key);

export const loadGmailOauthConfig = async () => {
  const config = await appRepository.getOAuthClientConfig("gmail");
  if (!config) {
    throw new Error("Missing Gmail OAuth config");
  }

  return {
    clientId: decryptFromStorage(config.encryptedClientId),
    clientSecret: decryptFromStorage(config.encryptedClientSecret),
    redirectUri: config.redirectUri,
  };
};

export const loadAccountProviderContext = async (
  accountId: string,
): Promise<ProviderAccountContext | null> => {
  const account = await appRepository.loadAccountContext(accountId);
  if (!account) {
    return null;
  }

  const oauthConfig = await loadGmailOauthConfig();

  return {
    accountId: account.id,
    email: account.email,
    oauthConfig,
    tokens: {
      accessToken: decryptFromStorage(account.encryptedAccessToken),
      refreshToken: decryptFromStorage(account.encryptedRefreshToken),
      expiresAt: account.tokenExpiresAt.toISOString(),
    },
  };
};
