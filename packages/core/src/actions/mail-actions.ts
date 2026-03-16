import type { JobType } from "../jobs/types";
import type { OutgoingDraft, OutgoingMessage } from "../providers/types";

export type MailActionRepository = {
  archiveThreads(accountId: string, threadIds: string[]): Promise<void>;
  trashThreads(accountId: string, threadIds: string[]): Promise<void>;
  deleteThreads(accountId: string, threadIds: string[]): Promise<void>;
  markThreadsSpam(accountId: string, threadIds: string[]): Promise<void>;
  markThreadsRead(accountId: string, threadIds: string[]): Promise<void>;
  markThreadsUnread(accountId: string, threadIds: string[]): Promise<void>;
  addLabels(accountId: string, threadIds: string[], labelIds: string[]): Promise<void>;
  removeLabels(accountId: string, threadIds: string[], labelIds: string[]): Promise<void>;
  upsertDraft(args: {
    accountId: string;
    draftId: string;
    providerDraftId?: string;
    payload: OutgoingDraft;
    sendLaterAt?: string;
  }): Promise<void>;
  markDraftSent(args: {
    accountId: string;
    draftId: string;
    providerMessageId?: string;
    providerThreadId?: string;
  }): Promise<void>;
  enqueueJob(args: {
    accountId: string;
    type: JobType;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    runAt?: Date;
  }): Promise<{ jobId: string }>;
};

const jobKey = (prefix: string, accountId: string, ids: string[]): string =>
  [prefix, accountId, ...ids.sort()].join(":");

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`);

  return `{${entries.join(",")}}`;
};

const payloadHashKey = (prefix: string, accountId: string, payload: unknown): string =>
  `${prefix}:${accountId}:${stableStringify(payload)}`;

export const archiveThreadsAction = async (
  repo: MailActionRepository,
  args: { accountId: string; threadIds: string[] },
): Promise<{ jobId: string }> => {
  await repo.archiveThreads(args.accountId, args.threadIds);
  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.archiveThreads",
    payload: args,
    idempotencyKey: jobKey("archive", args.accountId, args.threadIds),
  });
};

export const markThreadsReadAction = async (
  repo: MailActionRepository,
  args: { accountId: string; threadIds: string[] },
): Promise<{ jobId: string }> => {
  await repo.markThreadsRead(args.accountId, args.threadIds);
  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.markThreadsRead",
    payload: args,
    idempotencyKey: jobKey("read", args.accountId, args.threadIds),
  });
};

export const markThreadsUnreadAction = async (
  repo: MailActionRepository,
  args: { accountId: string; threadIds: string[] },
): Promise<{ jobId: string }> => {
  await repo.markThreadsUnread(args.accountId, args.threadIds);
  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.markThreadsUnread",
    payload: args,
    idempotencyKey: jobKey("unread", args.accountId, args.threadIds),
  });
};

export const trashThreadsAction = async (
  repo: MailActionRepository,
  args: { accountId: string; threadIds: string[] },
): Promise<{ jobId: string }> => {
  await repo.trashThreads(args.accountId, args.threadIds);
  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.trashThreads",
    payload: args,
    idempotencyKey: jobKey("trash", args.accountId, args.threadIds),
  });
};

export const deleteThreadsAction = async (
  repo: MailActionRepository,
  args: { accountId: string; threadIds: string[] },
): Promise<{ jobId: string }> => {
  await repo.deleteThreads(args.accountId, args.threadIds);
  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.deleteThreadsPermanently",
    payload: args,
    idempotencyKey: jobKey("delete", args.accountId, args.threadIds),
  });
};

export const markThreadsSpamAction = async (
  repo: MailActionRepository,
  args: { accountId: string; threadIds: string[] },
): Promise<{ jobId: string }> => {
  await repo.markThreadsSpam(args.accountId, args.threadIds);
  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.moveThreadsToSpam",
    payload: args,
    idempotencyKey: jobKey("spam", args.accountId, args.threadIds),
  });
};

export const addLabelsToThreadsAction = async (
  repo: MailActionRepository,
  args: { accountId: string; threadIds: string[]; labelIds: string[] },
): Promise<{ jobId: string }> => {
  await repo.addLabels(args.accountId, args.threadIds, args.labelIds);
  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.addLabelsToThreads",
    payload: args,
    idempotencyKey: jobKey(
      `add-label-${args.labelIds.sort().join("-")}`,
      args.accountId,
      args.threadIds,
    ),
  });
};

export const removeLabelsFromThreadsAction = async (
  repo: MailActionRepository,
  args: { accountId: string; threadIds: string[]; labelIds: string[] },
): Promise<{ jobId: string }> => {
  await repo.removeLabels(args.accountId, args.threadIds, args.labelIds);
  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.removeLabelsFromThreads",
    payload: args,
    idempotencyKey: jobKey(
      `remove-label-${args.labelIds.sort().join("-")}`,
      args.accountId,
      args.threadIds,
    ),
  });
};

export const createDraftAction = async (
  repo: MailActionRepository,
  args: { accountId: string; draftId: string; draft: OutgoingDraft; sendLaterAt?: string },
): Promise<{ jobId: string }> => {
  await repo.upsertDraft({
    accountId: args.accountId,
    draftId: args.draftId,
    payload: args.draft,
    sendLaterAt: args.sendLaterAt,
  });

  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.createDraft",
    payload: args,
    idempotencyKey: payloadHashKey("draft-create", args.accountId, args),
  });
};

export const updateDraftAction = async (
  repo: MailActionRepository,
  args: {
    accountId: string;
    draftId: string;
    providerDraftId: string;
    draft: OutgoingDraft;
    sendLaterAt?: string;
  },
): Promise<{ jobId: string }> => {
  await repo.upsertDraft({
    accountId: args.accountId,
    draftId: args.draftId,
    providerDraftId: args.providerDraftId,
    payload: args.draft,
    sendLaterAt: args.sendLaterAt,
  });

  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.updateDraft",
    payload: args,
    idempotencyKey: payloadHashKey("draft-update", args.accountId, args),
  });
};

export const sendDraftAction = async (
  repo: MailActionRepository,
  args: { accountId: string; draftId: string; providerDraftId: string },
): Promise<{ jobId: string }> => {
  await repo.markDraftSent({ accountId: args.accountId, draftId: args.draftId });
  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.sendDraft",
    payload: args,
    idempotencyKey: payloadHashKey("draft-send", args.accountId, args),
  });
};

export const sendMessageAction = async (
  repo: MailActionRepository,
  args: {
    accountId: string;
    clientMutationId: string;
    message: OutgoingMessage;
  },
): Promise<{ jobId: string }> => {
  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.sendMessage",
    payload: args,
    idempotencyKey: payloadHashKey("send", args.accountId, args),
  });
};

export const sendLaterAction = async (
  repo: MailActionRepository,
  args: {
    accountId: string;
    clientMutationId: string;
    message: OutgoingMessage;
    sendAt: string;
  },
): Promise<{ jobId: string }> => {
  const runAt = new Date(args.sendAt);
  return repo.enqueueJob({
    accountId: args.accountId,
    type: "gmail.sendLater",
    payload: args,
    runAt,
    idempotencyKey: payloadHashKey("send-later", args.accountId, args),
  });
};
