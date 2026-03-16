import { describe, expect, test } from "bun:test";
import { ProviderError } from "../providers/types";
import { classifyJobError } from "./retry";

describe("classifyJobError", () => {
  test("returns retry for retryable provider errors", () => {
    const result = classifyJobError(
      new ProviderError({
        message: "rate limited",
        code: "RATE_LIMITED",
        retryable: true,
        retryAfterMs: 1200,
      }),
      1,
      5,
    );

    expect(result.status).toBe("retry");
  });

  test("returns dead for non-retryable errors", () => {
    const result = classifyJobError(
      new ProviderError({
        message: "invalid",
        code: "INVALID_REQUEST",
        retryable: false,
      }),
      1,
      5,
    );

    expect(result.status).toBe("dead");
  });

  test("returns dead immediately for auth revoked errors", () => {
    const result = classifyJobError(
      new ProviderError({
        message: "invalid_grant",
        code: "AUTH_REVOKED",
        retryable: false,
      }),
      1,
      5,
    );

    expect(result.status).toBe("dead");
    expect(result.errorCode).toBe("AUTH_REVOKED");
  });
});
