import type { JobType } from "../jobs/types";

export type MailActionRepository = {
  archiveThreads(accountId: string, threadIds: string[]): Promise<void>;
  markThreadsRead(accountId: string, threadIds: string[]): Promise<void>;
  markThreadsUnread(accountId: string, threadIds: string[]): Promise<void>;
  addLabels(accountId: string, threadIds: string[], labelIds: string[]): Promise<void>;
  removeLabels(accountId: string, threadIds: string[], labelIds: string[]): Promise<void>;
  enqueueJob(args: {
    accountId: string;
    type: JobType;
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<{ jobId: string }>;
};

const jobKey = (prefix: string, accountId: string, ids: string[]): string =>
  [prefix, accountId, ...ids.sort()].join(":");

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
