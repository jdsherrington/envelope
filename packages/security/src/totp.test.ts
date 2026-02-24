import { describe, expect, test } from "bun:test";
import { generateTotpCode, generateTotpSecret, verifyTotpCode } from "./totp";

describe("totp", () => {
  test("generates verifiable code", () => {
    const secret = generateTotpSecret();
    const now = Date.now();

    const code = generateTotpCode(secret, now);
    expect(verifyTotpCode(secret, code, now)).toBe(true);
  });
});
