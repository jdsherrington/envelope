import { createHmac } from "node:crypto";
import { checkA11y, injectAxe } from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";

const databaseUrl =
  process.env["DATABASE_URL"] ?? "postgres://envelope:envelope@localhost:5432/envelope";

const sql = postgres(databaseUrl, { max: 1 });

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const decodeBase32 = (input: string): Uint8Array => {
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

const hotp = (secret: Uint8Array, counter: number): string => {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac("sha1", secret).update(counterBuffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const code =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);

  return (code % 1_000_000).toString().padStart(6, "0");
};

const generateTotpCode = (secretBase32: string): string => {
  const counter = Math.floor(Date.now() / 1000 / 30);
  return hotp(decodeBase32(secretBase32), counter);
};

const resetDatabase = async () => {
  const tables = await sql<{ tablename: string }[]>`
    select tablename
    from pg_tables
    where schemaname = 'public'
  `;

  const tableNames = tables.map((entry) => `"${entry.tablename}"`).join(", ");
  if (!tableNames) {
    return;
  }

  await sql.unsafe(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`);
};

const bootstrapInstance = async (page: Page) => {
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Bootstrap your instance" })).toBeVisible();

  const setupText = await page.locator("main").innerText();
  const secretMatch = setupText.match(/secret=([A-Z2-7]+)/);
  expect(secretMatch).not.toBeNull();
  const totpSecret = secretMatch?.[1] ?? "";
  const totpCode = generateTotpCode(totpSecret);

  await page.getByLabel("Email").fill("admin@a11y.local");
  await page.getByLabel("Password").fill("change-me-now-123");
  await page.getByLabel("TOTP code").fill(totpCode);
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByRole("heading", { name: "2. Configure Gmail OAuth" })).toBeVisible();

  await page.getByLabel("Google Client ID").fill("dummy-client-id.apps.googleusercontent.com");
  await page.getByLabel("Google Client Secret").fill("dummy-client-secret");
  await page.getByRole("button", { name: "Save Gmail config" }).click();
  await expect(page.getByRole("heading", { name: "Setup complete" })).toBeVisible();
};

const assertPageAccessibility = async (page: Page, path: string) => {
  await page.goto(path);
  await expect(page.locator("main")).toBeVisible();
  await injectAxe(page);
  await checkA11y(page, undefined, {
    detailedReport: true,
    detailedReportOptions: {
      html: true,
    },
  });
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("@a11y core route accessibility", async ({ page }) => {
  await bootstrapInstance(page);
  await assertPageAccessibility(page, "/inbox");
  await assertPageAccessibility(page, "/settings");
  await assertPageAccessibility(page, "/diagnostics");
  await assertPageAccessibility(page, "/compose");
});
