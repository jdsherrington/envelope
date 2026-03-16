import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { verifyCsrf } from "./auth";

describe("verifyCsrf", () => {
  test("accepts matching cookie/header/session token", () => {
    const request = new NextRequest("http://localhost/api/actions/archive", {
      headers: {
        cookie: "envelope_csrf=abc123",
        "x-csrf-token": "abc123",
      },
    });

    expect(verifyCsrf(request, "abc123")).toBe(true);
  });

  test("rejects mismatched token", () => {
    const request = new NextRequest("http://localhost/api/actions/archive", {
      headers: {
        cookie: "envelope_csrf=abc123",
        "x-csrf-token": "wrong",
      },
    });

    expect(verifyCsrf(request, "abc123")).toBe(false);
  });
});
