import {
  addLabelsToThreadsAction,
  archiveThreadsAction,
  createDraftAction,
  deleteThreadsAction,
  markThreadsReadAction,
  markThreadsSpamAction,
  markThreadsUnreadAction,
  removeLabelsFromThreadsAction,
  sendDraftAction,
  sendLaterAction,
  trashThreadsAction,
  updateDraftAction,
  type MailActionRepository,
} from "@envelope/core";
import { appRepository } from "@envelope/db";

const repo: MailActionRepository = {
  archiveThreads: (accountId, threadIds) => appRepository.archiveThreads(accountId, threadIds),
  trashThreads: (accountId, threadIds) => appRepository.trashThreads(accountId, threadIds),
  deleteThreads: (accountId, threadIds) => appRepository.deleteThreads(accountId, threadIds),
  markThreadsSpam: (accountId, threadIds) => appRepository.markThreadsSpam(accountId, threadIds),
  markThreadsRead: (accountId, threadIds) => appRepository.markThreadsRead(accountId, threadIds),
  markThreadsUnread: (accountId, threadIds) => appRepository.markThreadsUnread(accountId, threadIds),
  addLabels: (accountId, threadIds, labelIds) => appRepository.addLabels(accountId, threadIds, labelIds),
  removeLabels: (accountId, threadIds, labelIds) =>
    appRepository.removeLabels(accountId, threadIds, labelIds),
  upsertDraft: ({ accountId, draftId, providerDraftId, payload, sendLaterAt }) =>
    appRepository.upsertDraft({
      accountId,
      draftId,
      providerDraftId,
      payload,
      sendLaterAt,
    }),
  markDraftSent: ({ accountId, draftId, providerMessageId, providerThreadId }) =>
    appRepository.markDraftSent({
      accountId,
      draftId,
      providerMessageId,
      providerThreadId,
    }),
  enqueueJob: ({ accountId, type, payload, idempotencyKey, runAt }) =>
    appRepository.enqueueJob({ accountId, type, payload, idempotencyKey, runAt }),
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

export const runTrashAction = (accountId: string, threadIds: string[]) =>
  trashThreadsAction(repo, { accountId, threadIds });

export const runDeleteAction = (accountId: string, threadIds: string[]) =>
  deleteThreadsAction(repo, { accountId, threadIds });

export const runSpamAction = (accountId: string, threadIds: string[]) =>
  markThreadsSpamAction(repo, { accountId, threadIds });

export const runSendAction = (
  accountId: string,
  clientMutationId: string,
  message: {
    to: Array<{ name?: string; email: string }>;
    cc?: Array<{ name?: string; email: string }>;
    bcc?: Array<{ name?: string; email: string }>;
    subject: string;
    textBody?: string;
    htmlBody?: string;
    threadProviderId?: string;
  },
) => {
  const undoDelayMs = 10_000;
  const sendAt = new Date(Date.now() + undoDelayMs).toISOString();
  return sendLaterAction(repo, { accountId, clientMutationId, message, sendAt }).then((result) => ({
    ...result,
    undoToken: clientMutationId,
    undoExpiresAt: sendAt,
  }));
};

export const runCreateDraftAction = (
  accountId: string,
  draftId: string,
  draft: {
    to: Array<{ name?: string; email: string }>;
    cc?: Array<{ name?: string; email: string }>;
    bcc?: Array<{ name?: string; email: string }>;
    subject: string;
    textBody?: string;
    htmlBody?: string;
    threadProviderId?: string;
  },
  sendLaterAt?: string,
) => createDraftAction(repo, { accountId, draftId, draft, sendLaterAt });

export const runUpdateDraftAction = (
  accountId: string,
  draftId: string,
  providerDraftId: string,
  draft: {
    to: Array<{ name?: string; email: string }>;
    cc?: Array<{ name?: string; email: string }>;
    bcc?: Array<{ name?: string; email: string }>;
    subject: string;
    textBody?: string;
    htmlBody?: string;
    threadProviderId?: string;
  },
  sendLaterAt?: string,
) => updateDraftAction(repo, { accountId, draftId, providerDraftId, draft, sendLaterAt });

export const runSendDraftAction = (accountId: string, draftId: string, providerDraftId: string) =>
  sendDraftAction(repo, { accountId, draftId, providerDraftId });

export const runSendLaterAction = (
  accountId: string,
  clientMutationId: string,
  message: {
    to: Array<{ name?: string; email: string }>;
    cc?: Array<{ name?: string; email: string }>;
    bcc?: Array<{ name?: string; email: string }>;
    subject: string;
    textBody?: string;
    htmlBody?: string;
    threadProviderId?: string;
  },
  sendAt: string,
) => sendLaterAction(repo, { accountId, clientMutationId, message, sendAt });

export const runSendUndoAction = (accountId: string, undoToken: string) =>
  appRepository.cancelPendingSend({
    accountId,
    clientMutationId: undoToken,
  });

export const runSnoozeAction = async (
  accountId: string,
  threadIds: string[],
  remindAt: string,
) => {
  const remindAtDate = new Date(remindAt);
  await appRepository.snoozeThreads({
    accountId,
    threadIds,
    remindAt: remindAtDate,
  });

  return appRepository.enqueueJob({
    accountId,
    type: "envelope.reminderWakeup",
    payload: {
      threadIds,
      remindAt,
      reason: "snooze",
    },
    runAt: remindAtDate,
    idempotencyKey: `reminder-wakeup:snooze:${accountId}:${[...threadIds].sort().join(",")}:${remindAt}`,
  });
};

export const runReminderAction = async (
  accountId: string,
  threadIds: string[],
  remindAt: string,
  note?: string,
) => {
  const remindAtDate = new Date(remindAt);
  await appRepository.scheduleReminders({
    accountId,
    threadIds,
    remindAt: remindAtDate,
    note,
  });

  return appRepository.enqueueJob({
    accountId,
    type: "envelope.reminderWakeup",
    payload: {
      threadIds,
      remindAt,
      reason: "reminder",
      note,
    },
    runAt: remindAtDate,
    idempotencyKey: `reminder-wakeup:reminder:${accountId}:${[...threadIds].sort().join(",")}:${remindAt}`,
  });
};
