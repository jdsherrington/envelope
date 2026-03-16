import type { WebAuthnCredential } from "@simplewebauthn/server";
import { env } from "./env";

export const resolveWebAuthnRpId = (): string => {
  if (env.WEBAUTHN_RP_ID && env.WEBAUTHN_RP_ID.length > 0) {
    return env.WEBAUTHN_RP_ID;
  }

  const origin = new URL(env.APP_ORIGIN);
  return origin.hostname;
};

export const dbCredentialToWebAuthnCredential = (credential: {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
}): WebAuthnCredential => ({
  id: credential.credentialId,
  publicKey: Buffer.from(credential.publicKey, "base64url"),
  counter: credential.counter,
  transports: credential.transports as WebAuthnCredential["transports"],
});
