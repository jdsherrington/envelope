import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const toBase32 = (buffer: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
};

const fromBase32 = (input: string): Uint8Array => {
  const cleaned = input.replace(/=+$/, "").toUpperCase();

  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error("Invalid base32 secret");
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Uint8Array.from(bytes);
};

const hotp = (secret: Uint8Array, counter: number, digits = 6): string => {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const code =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);

  return (code % 10 ** digits).toString().padStart(digits, "0");
};

export const generateTotpSecret = (): string => toBase32(randomBytes(20));

export const generateTotpCode = (
  secretBase32: string,
  nowMs = Date.now(),
  periodSeconds = 30,
  digits = 6,
): string => {
  const counter = Math.floor(nowMs / 1000 / periodSeconds);
  return hotp(fromBase32(secretBase32), counter, digits);
};

export const verifyTotpCode = (
  secretBase32: string,
  code: string,
  nowMs = Date.now(),
  periodSeconds = 30,
  digits = 6,
  allowedDriftWindows = 1,
): boolean => {
  const baseCounter = Math.floor(nowMs / 1000 / periodSeconds);
  const secret = fromBase32(secretBase32);

  for (let i = -allowedDriftWindows; i <= allowedDriftWindows; i += 1) {
    if (hotp(secret, baseCounter + i, digits) === code) {
      return true;
    }
  }

  return false;
};

export const buildOtpAuthUri = (args: {
  issuer: string;
  accountName: string;
  secret: string;
}): string => {
  const issuer = encodeURIComponent(args.issuer);
  const accountName = encodeURIComponent(args.accountName);
  const secret = encodeURIComponent(args.secret);
  return `otpauth://totp/${issuer}:${accountName}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
};
