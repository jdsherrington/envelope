import { describe, expect, test } from "bun:test";
import { sanitizeHtml } from "./sanitize-html";

describe("sanitizeHtml", () => {
  test("removes script payloads", () => {
    const input = '<p>Hello</p><script>alert("x")</script>';
    const output = sanitizeHtml(input);
    expect(output).toBe("<p>Hello</p>");
  });

  test("removes event handler attributes", () => {
    const input = '<img src="https://example.com/a.png" onerror="alert(1)">';
    const output = sanitizeHtml(input);
    expect(output).toContain('<img src="https://example.com/a.png"');
    expect(output).not.toContain("onerror");
  });

  test("blocks unsafe javascript URLs", () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const output = sanitizeHtml(input);
    expect(output).toContain("<a");
    expect(output).not.toContain("javascript:");
  });

  test("removes inline event handlers on mixed tags", () => {
    const input = '<div onclick="x()"><a href="https://example.com" onmouseover="y()">ok</a></div>';
    const output = sanitizeHtml(input);
    expect(output).toBe('<div><a href="https://example.com" rel="noopener noreferrer">ok</a></div>');
    expect(output).not.toContain("onclick");
    expect(output).not.toContain("onmouseover");
  });

  test("drops malformed svg script vectors", () => {
    const input = '<svg><script>alert(1)</script><circle /></svg><p>safe</p>';
    const output = sanitizeHtml(input);
    expect(output).toBe("<p>safe</p>");
  });

  test("permits cid and data images but blocks javascript image src", () => {
    const safeCid = sanitizeHtml('<img src="cid:abc123" alt="x">');
    const safeData = sanitizeHtml('<img src="data:image/png;base64,AAAA" alt="x">');
    const blocked = sanitizeHtml('<img src="javascript:alert(1)" alt="x">');

    expect(safeCid).toContain('src="cid:abc123"');
    expect(safeData).toContain('src="data:image/png;base64,AAAA"');
    expect(blocked).not.toContain("javascript:");
  });
});
