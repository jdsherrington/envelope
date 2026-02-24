import {
  addLabelsToThreadsAction,
  archiveThreadsAction,
  markThreadsReadAction,
  markThreadsUnreadAction,
  removeLabelsFromThreadsAction,
  type MailActionRepository,
} from "@envelope/core";
import { appRepository } from "@envelope/db";

const repo: MailActionRepository = {
  archiveThreads: (accountId, threadIds) => appRepository.archiveThreads(accountId, threadIds),
  markThreadsRead: (accountId, threadIds) => appRepository.markThreadsRead(accountId, threadIds),
  markThreadsUnread: (accountId, threadIds) => appRepository.markThreadsUnread(accountId, threadIds),
  addLabels: (accountId, threadIds, labelIds) => appRepository.addLabels(accountId, threadIds, labelIds),
  removeLabels: (accountId, threadIds, labelIds) =>
    appRepository.removeLabels(accountId, threadIds, labelIds),
  enqueueJob: ({ accountId, type, payload, idempotencyKey }) =>
    appRepository.enqueueJob({ accountId, type, payload, idempotencyKey }),
};

export const runArchiveAction = (accountId: string, threadIds: string[]) =>
  archiveThreadsAction(repo, { accountId, threadIds });

export const runMarkReadAction = (accountId: string, threadIds: string[]) =>
  markThreadsReadAction(repo, { accountId, threadIds });

export const runMarkUnreadAction = (accountId: string, threadIds: string[]) =>
  markThreadsUnreadAction(repo, { accountId, threadIds });

export const runAddLabelAction = (accountId: string, threadIds: string[], labelIds: string[]) =>
  addLabelsToThreadsAction(repo, { accountId, threadIds, labelIds });

export const runRemoveLabelAction = (
  accountId: string,
  threadIds: string[],
  labelIds: string[],
) => removeLabelsFromThreadsAction(repo, { accountId, threadIds, labelIds });
