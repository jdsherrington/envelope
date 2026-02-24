import { createHash, randomBytes } from "node:crypto";

export const generateState = (): string => randomBytes(24).toString("base64url");

export const generateCodeVerifier = (): string => randomBytes(48).toString("base64url");

export const toCodeChallenge = (codeVerifier: string): string =>
  createHash("sha256").update(codeVerifier).digest("base64url");
