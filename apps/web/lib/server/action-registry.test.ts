import { describe, expect, test } from "bun:test";
import { listRegisteredActionIds } from "./action-registry";

describe("action registry", () => {
  test("registers the required action ids exactly once", () => {
    expect(listRegisteredActionIds()).toEqual([
      "compose.send",
      "compose.sendLater",
      "compose.sendUndo",
      "draft.create",
      "draft.send",
      "draft.update",
      "thread.addLabel",
      "thread.archive",
      "thread.delete",
      "thread.markRead",
      "thread.markUnread",
      "thread.reminder",
      "thread.removeLabel",
      "thread.snooze",
      "thread.spam",
      "thread.trash",
    ]);
  });
});
