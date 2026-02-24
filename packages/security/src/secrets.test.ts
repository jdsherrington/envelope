import { describe, expect, test } from "bun:test";
import {
  decryptSecret,
  encryptSecret,
  getSecretsKey,
  parseEncryptedSecret,
  serializeEncryptedSecret,
} from "./secrets";

describe("secrets", () => {
  test("encrypts and decrypts payload", () => {
    const raw = Buffer.alloc(32, 7).toString("base64");
    const key = getSecretsKey(raw);

    const encrypted = encryptSecret("hello-envelope", key);
    const roundtrip = decryptSecret(encrypted, key);

    expect(roundtrip).toBe("hello-envelope");
  });

  test("serializes and parses encrypted payload", () => {
    const payload = {
      iv: "abc",
      ciphertext: "def",
      tag: "ghi",
    };

    expect(parseEncryptedSecret(serializeEncryptedSecret(payload))).toEqual(payload);
  });

  test("rejects invalid key length", () => {
    expect(() => getSecretsKey(Buffer.alloc(31).toString("base64"))).toThrow();
  });
});
