import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect, test } from "@playwright/test";

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

type SeedFixture = {
  accountId: string;
  threadId: string;
  messageId: string;
  attachmentId: string;
};

const seedInboxFixtures = async (adminEmail: string): Promise<SeedFixture> => {
  const [user] = await sql<{ id: string }[]>`
    select id
    from users
    where email = ${adminEmail}
    limit 1
  `;

  if (!user) {
    throw new Error("Missing seeded user");
  }

  const accountId = randomUUID();
  const now = Date.now();

  await sql`
    insert into accounts (
      id,
      user_id,
      provider_id,
      email,
      status,
      encrypted_access_token,
      encrypted_refresh_token,
      token_expires_at,
      sync_cursor,
      last_synced_at
    )
    values (
      ${accountId},
      ${user.id},
      'gmail',
      ${`seeded+${Date.now()}@example.com`},
      'ok',
      'enc:access-token',
      'enc:refresh-token',
      ${new Date(now + 24 * 60 * 60 * 1000)},
      'history-1',
      ${new Date()}
    )
  `;

  let targetThreadId = "";
  let targetProviderThreadId = "";

  for (let i = 0; i < 120; i += 1) {
    const threadId = randomUUID();
    const providerThreadId = `pth_${i}`;
    const subject = i === 0 ? "Quarterly Plan Review" : `Seeded Thread ${i}`;
    const snippet = i === 0 ? "Action items and owners for this quarter" : `Snippet ${i}`;
    const lastMessageAt = new Date(now - i * 60_000);

    await sql`
      insert into threads (
        id,
        account_id,
        provider_thread_id,
        subject,
        snippet,
        last_message_at,
        unread_count,
        provider_label_ids
      )
      values (
        ${threadId},
        ${accountId},
        ${providerThreadId},
        ${subject},
        ${snippet},
        ${lastMessageAt},
        ${i === 0 ? 1 : 0},
        ${["INBOX", i % 2 === 0 ? "CATEGORY_UPDATES" : "CATEGORY_PERSONAL"]}
      )
    `;

    if (i === 0) {
      targetThreadId = threadId;
      targetProviderThreadId = providerThreadId;
    }
  }

  if (!targetThreadId || !targetProviderThreadId) {
    throw new Error("Missing target thread fixture");
  }

  const messageId = randomUUID();
  const attachmentId = "attachment-quarterly-plan";
  const toRecipientsJson = JSON.stringify([{ email: adminEmail }]);
  const emptyRecipientsJson = JSON.stringify([]);
  const attachmentsJson = JSON.stringify([
    {
      providerAttachmentId: attachmentId,
      filename: "quarterly-plan.txt",
      mimeType: "text/plain",
      sizeBytes: 22,
      inline: false,
    },
  ]);

  await sql`
    insert into messages (
      id,
      account_id,
      provider_message_id,
      provider_thread_id,
      from_name,
      from_email,
      to_recipients,
      cc_recipients,
      bcc_recipients,
      subject,
      internal_date,
      snippet,
      text_body,
      html_body,
      is_read,
      is_starred,
      is_draft,
      attachments
    )
    values (
      ${messageId},
      ${accountId},
      'pmsg_quarterly_plan',
      ${targetProviderThreadId},
      'Seed Bot',
      'seed-bot@example.com',
      ${toRecipientsJson}::jsonb,
      ${emptyRecipientsJson}::jsonb,
      ${emptyRecipientsJson}::jsonb,
      'Quarterly Plan Review',
      ${new Date(now)},
      'Seeded message with attachment',
      'Seeded body for e2e verification.',
      null,
      false,
      false,
      false,
      ${attachmentsJson}::jsonb
    )
  `;

  await sql`
    insert into attachment_cache (
      id,
      account_id,
      provider_message_id,
      provider_attachment_id,
      filename,
      mime_type,
      size_bytes,
      bytes_base64
    )
    values (
      ${randomUUID()},
      ${accountId},
      'pmsg_quarterly_plan',
      ${attachmentId},
      'quarterly-plan.txt',
      'text/plain',
      22,
      ${Buffer.from("seeded attachment bytes").toString("base64")}
    )
  `;

  return {
    accountId,
    threadId: targetThreadId,
    messageId,
    attachmentId,
  };
};

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetDatabase();
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("pre-setup routes enforce bootstrap", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Bootstrap your instance" })).toBeVisible();

  await page.goto("/login");
  await expect(page).toHaveURL(/\/setup/);

  const response = await page.goto("/inbox");
  expect(response?.status()).toBeGreaterThanOrEqual(200);
  await expect(page).toHaveURL(/\/setup/);
});

test("setup to usable inbox workflows", async ({ page }) => {
  const adminEmail = "admin@e2e.local";
  const adminPassword = "change-me-now-123";

  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Bootstrap your instance" })).toBeVisible();

  const setupText = await page.locator("main").innerText();
  const secretMatch = setupText.match(/secret=([A-Z2-7]+)/);
  expect(secretMatch).not.toBeNull();
  const totpSecret = secretMatch?.[1] ?? "";
  const totpCode = generateTotpCode(totpSecret);

  await page.getByLabel("Email").fill(adminEmail);
  await page.getByLabel("Password").fill(adminPassword);
  await page.getByLabel("TOTP code").fill(totpCode);
  await page.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByRole("heading", { name: "2. Configure Gmail OAuth" })).toBeVisible();

  await page.getByLabel("Google Client ID").fill("dummy-client-id.apps.googleusercontent.com");
  await page.getByLabel("Google Client Secret").fill("dummy-client-secret");
  await page.getByRole("button", { name: "Save Gmail config" }).click();
  await expect(page.getByRole("heading", { name: "Setup complete" })).toBeVisible();

  await page.getByRole("link", { name: "Open inbox" }).click();
  await expect(page).toHaveURL(/\/inbox/);

  const fixtures = await seedInboxFixtures(adminEmail);

  await page.goto(`/inbox?accountId=${fixtures.accountId}`);
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

  const renderedRows = await page.locator('ul[role="listbox"] > li button').count();
  expect(renderedRows).toBeLessThan(120);

  await page.getByLabel("Search inbox").fill("Quarterly Plan");
  const threadButton = page.getByRole("button", { name: /Quarterly Plan Review/i });
  await expect(threadButton).toBeVisible();
  await threadButton.click();
  await expect(page).toHaveURL(new RegExp(`/thread/${fixtures.threadId}\\?accountId=${fixtures.accountId}`));
  await expect(page.getByRole("link", { name: /^Reply$/ })).toBeVisible();
  await expect(page.getByText("Seeded body for e2e verification.")).toBeVisible();

  await page.goto(`/inbox?accountId=${fixtures.accountId}`);
  await threadButton.click({ modifiers: ["Meta"] });
  await page.keyboard.press("Control+K");
  await expect(page.getByRole("heading", { name: "Command Palette" })).toBeVisible();
  await page.getByLabel("Search commands").fill("Archive selected");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Queued: thread.archiveSelected")).toBeVisible();

  await page.goto(`/thread/${fixtures.threadId}?accountId=${fixtures.accountId}`);

  const attachmentResponse = await page.request.get(
    `/api/messages/${fixtures.messageId}/attachments/${fixtures.attachmentId}?accountId=${fixtures.accountId}`,
  );
  expect(attachmentResponse.status()).toBe(200);
  expect(attachmentResponse.headers()["content-disposition"] ?? "").toContain("attachment");

  await page.goto("/settings");
  await page.getByRole("button", { name: "Vim" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  const settingsResponse = await page.request.get("/api/settings");
  expect(settingsResponse.status()).toBe(200);
  const settings = (await settingsResponse.json()) as { keymap?: string };
  expect(settings.keymap).toBe("vim");

  const diagnosticsExport = await page.request.get("/api/diagnostics/export");
  expect(diagnosticsExport.status()).toBe(200);
  const diagnosticsPayload = (await diagnosticsExport.json()) as { diagnostics?: unknown };
  expect(diagnosticsPayload.diagnostics).toBeTruthy();
});
