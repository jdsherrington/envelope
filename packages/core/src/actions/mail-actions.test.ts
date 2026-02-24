import { describe, expect, test } from "bun:test";
import { archiveThreadsAction } from "./mail-actions";

describe("archiveThreadsAction", () => {
  test("optimistically updates and enqueues job", async () => {
    const calls: string[] = [];

    const result = await archiveThreadsAction(
      {
        async archiveThreads() {
          calls.push("archive");
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
        async enqueueJob() {
          calls.push("enqueue");
          return { jobId: "job_1" };
        },
      },
      {
        accountId: "account_1",
        threadIds: ["thread_1"],
      },
    );

    expect(result.jobId).toBe("job_1");
    expect(calls).toEqual(["archive", "enqueue"]);
  });
});
