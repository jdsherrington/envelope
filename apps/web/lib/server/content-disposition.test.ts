import { describe, expect, test } from "bun:test";
import { attachmentDisposition, sanitizeDownloadFilename } from "./content-disposition";

describe("sanitizeDownloadFilename", () => {
  test("removes control chars and separators", () => {
    const name = sanitizeDownloadFilename('..\\evil\\..\/payload\r\n.txt');
    expect(name).toBe("_evil_._payload.txt");
  });

  test("falls back for empty names", () => {
    expect(sanitizeDownloadFilename("   ")).toBe("attachment");
  });
});

describe("attachmentDisposition", () => {
  test("emits safe quoted and UTF-8 filename values", () => {
    const header = attachmentDisposition('invoice "Q1".pdf');
    expect(header).toContain('attachment; filename="invoice _Q1_.pdf"');
    expect(header).toContain("filename*=UTF-8''invoice%20_Q1_.pdf");
  });
});
