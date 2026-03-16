import { describe, expect, test } from "bun:test";
import { buildCsp } from "./csp";

describe("buildCsp", () => {
  test("includes nonce-based script policy in production", () => {
    const csp = buildCsp("nonce-abc", true);
    const scriptPolicy = csp
      .split(";")
      .map((chunk) => chunk.trim())
      .find((chunk) => chunk.startsWith("script-src"));

    expect(scriptPolicy).toBe("script-src 'self' 'nonce-nonce-abc' 'strict-dynamic'");
    expect(scriptPolicy).not.toContain("'unsafe-inline'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  test("keeps relaxed script policy in development", () => {
    const csp = buildCsp("nonce-abc", false);
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
