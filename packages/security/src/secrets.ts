import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const IV_LENGTH = 12;

export type EncryptedSecret = {
  iv: string;
  ciphertext: string;
  tag: string;
};

const decodeBase64 = (value: string): Buffer => {
  try {
    return Buffer.from(value, "base64");
  } catch {
    throw new Error("Invalid base64 key");
  }
};

export const getSecretsKey = (base64Key: string): Buffer => {
  const key = decodeBase64(base64Key);
  if (key.length !== 32) {
    throw new Error("ENVELOPE_SECRETS_KEY must decode to 32 bytes");
  }
  return key;
};

export const encryptSecret = (plaintext: string, key: Buffer): EncryptedSecret => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("base64"),
    ciphertext: encrypted.toString("base64"),
    tag: tag.toString("base64"),
  };
};

export const decryptSecret = (encrypted: EncryptedSecret, key: Buffer): string => {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(encrypted.iv, "base64"));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};

export const serializeEncryptedSecret = (encrypted: EncryptedSecret): string =>
  JSON.stringify(encrypted);

export const parseEncryptedSecret = (value: string): EncryptedSecret => {
  const parsed = JSON.parse(value) as Partial<EncryptedSecret>;
  if (!parsed.iv || !parsed.ciphertext || !parsed.tag) {
    throw new Error("Malformed encrypted payload");
  }
  return {
    iv: parsed.iv,
    ciphertext: parsed.ciphertext,
    tag: parsed.tag,
  };
};
