import { describe, expect, test } from "bun:test";
import { mapGmailErrorResponse } from "./adapter";

describe("mapGmailErrorResponse", () => {
  test("maps 429 to RATE_LIMITED", async () => {
    const response = new Response(
      JSON.stringify({ error: { code: 429, message: "Rate limit exceeded" } }),
      {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "5" },
      },
    );

    const error = await mapGmailErrorResponse(response);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(5000);
  });

  test("maps 401 to AUTH_EXPIRED", async () => {
    const response = new Response(
      JSON.stringify({ error: { code: 401, message: "Invalid Credentials" } }),
      { status: 401, headers: { "content-type": "application/json" } },
    );

    const error = await mapGmailErrorResponse(response);
    expect(error.code).toBe("AUTH_EXPIRED");
    expect(error.retryable).toBe(true);
  });
});
