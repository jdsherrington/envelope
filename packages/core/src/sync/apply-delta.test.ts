import { describe, expect, test } from "bun:test";
import { applySyncDelta } from "./apply-delta";

describe("applySyncDelta", () => {
  test("applies upserts and cursor", async () => {
    const calls: string[] = [];

    await applySyncDelta(
      {
        async upsertLabels() {
          calls.push("labels");
        },
        async upsertThreads() {
          calls.push("threads");
        },
        async upsertMessages() {
          calls.push("messages");
        },
        async deleteThreadsByProviderIds() {
          calls.push("deleteThreads");
        },
        async deleteMessagesByProviderIds() {
          calls.push("deleteMessages");
        },
        async updateSyncCursor() {
          calls.push("cursor");
        },
      },
      "a1",
      {
        newCursor: { raw: "123" },
        upsertLabels: [
          {
            accountId: "a1",
            providerId: "gmail",
            providerLabelId: "INBOX",
            name: "Inbox",
            type: "system",
          },
        ],
        upsertThreads: [
          {
            accountId: "a1",
            providerId: "gmail",
            providerThreadId: "t1",
            subject: "Subject",
            snippet: "Snippet",
            lastMessageAt: new Date().toISOString(),
            unreadCount: 0,
            labelIds: [],
          },
        ],
        upsertMessages: [
          {
            accountId: "a1",
            providerId: "gmail",
            providerMessageId: "m1",
            providerThreadId: "t1",
            from: { email: "a@example.com" },
            to: [],
            cc: [],
            bcc: [],
            subject: "Subject",
            internalDate: new Date().toISOString(),
            flags: { isRead: true },
            attachments: [],
          },
        ],
        deleteThreadIds: ["t2"],
        deleteMessageIds: ["m2"],
      },
    );

    expect(calls).toEqual([
      "labels",
      "threads",
      "messages",
      "deleteMessages",
      "deleteThreads",
      "cursor",
    ]);
  });
});
