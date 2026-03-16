import { describe, expect, test } from "bun:test";
import {
  archiveThreadsAction,
  sendLaterAction,
  trashThreadsAction,
} from "./mail-actions";

const buildRepo = () => {
  const calls: string[] = [];
  const repo = {
    async archiveThreads() {
      calls.push("archive");
    },
    async trashThreads() {
      calls.push("trash");
    },
    async deleteThreads() {
      calls.push("delete");
    },
    async markThreadsSpam() {
      calls.push("spam");
    },
    async markThreadsRead() {
      calls.push("read");
    },
    async markThreadsUnread() {
      calls.push("unread");
    },
    async addLabels() {
      calls.push("add");
    },
    async removeLabels() {
      calls.push("remove");
    },
    async upsertDraft() {
      calls.push("upsertDraft");
    },
    async markDraftSent() {
      calls.push("markDraftSent");
    },
    async enqueueJob() {
      calls.push("enqueue");
      return { jobId: "job_1" };
    },
  };

  return { repo, calls };
};

describe("archiveThreadsAction", () => {
  test("optimistically updates and enqueues job", async () => {
    const { repo, calls } = buildRepo();

    const result = await archiveThreadsAction(repo, {
      accountId: "account_1",
      threadIds: ["thread_1"],
    });

    expect(result.jobId).toBe("job_1");
    expect(calls).toEqual(["archive", "enqueue"]);
  });
});

describe("trashThreadsAction", () => {
  test("optimistically trashes before queueing", async () => {
    const { repo, calls } = buildRepo();
    await trashThreadsAction(repo, {
      accountId: "account_1",
      threadIds: ["thread_1"],
    });
    expect(calls).toEqual(["trash", "enqueue"]);
  });
});

describe("sendLaterAction", () => {
  test("enqueues delayed send job", async () => {
    const { repo, calls } = buildRepo();
    await sendLaterAction(repo, {
      accountId: "account_1",
      clientMutationId: "mut_1",
      sendAt: "2030-01-01T00:00:00.000Z",
      message: {
        to: [{ email: "demo@example.com" }],
        subject: "hello",
      },
    });
    expect(calls).toEqual(["enqueue"]);
  });
});
