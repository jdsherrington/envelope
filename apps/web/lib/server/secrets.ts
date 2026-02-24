import {
  decryptSecret,
  encryptSecret,
  getSecretsKey,
  parseEncryptedSecret,
  serializeEncryptedSecret,
} from "@envelope/security";
import { env } from "./env";

const key = getSecretsKey(env.ENVELOPE_SECRETS_KEY);

export const encryptForStorage = (value: string): string =>
  serializeEncryptedSecret(encryptSecret(value, key));

export const decryptFromStorage = (value: string): string =>
  decryptSecret(parseEncryptedSecret(value), key);
