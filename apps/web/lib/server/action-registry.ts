import { ActionRegistry } from "@envelope/core";
import {
  runAddLabelAction,
  runArchiveAction,
  runCreateDraftAction,
  runDeleteAction,
  runMarkReadAction,
  runMarkUnreadAction,
  runReminderAction,
  runRemoveLabelAction,
  runSendAction,
  runSendDraftAction,
  runSendLaterAction,
  runSendUndoAction,
  runSnoozeAction,
  runSpamAction,
  runTrashAction,
  runUpdateDraftAction,
} from "@/lib/server/mail-actions";

const registry = new ActionRegistry();

registry.register({
  id: "thread.archive",
  run: async (input: { accountId: string; threadIds: string[] }) =>
    runArchiveAction(input.accountId, input.threadIds),
});

registry.register({
  id: "thread.trash",
  run: async (input: { accountId: string; threadIds: string[] }) =>
    runTrashAction(input.accountId, input.threadIds),
});

registry.register({
  id: "thread.delete",
  run: async (input: { accountId: string; threadIds: string[] }) =>
    runDeleteAction(input.accountId, input.threadIds),
});

registry.register({
  id: "thread.spam",
  run: async (input: { accountId: string; threadIds: string[] }) =>
    runSpamAction(input.accountId, input.threadIds),
});

registry.register({
  id: "thread.markRead",
  run: async (input: { accountId: string; threadIds: string[] }) =>
    runMarkReadAction(input.accountId, input.threadIds),
});

registry.register({
  id: "thread.markUnread",
  run: async (input: { accountId: string; threadIds: string[] }) =>
    runMarkUnreadAction(input.accountId, input.threadIds),
});

registry.register({
  id: "thread.addLabel",
  run: async (input: { accountId: string; threadIds: string[]; labelIds: string[] }) =>
    runAddLabelAction(input.accountId, input.threadIds, input.labelIds),
});

registry.register({
  id: "thread.removeLabel",
  run: async (input: { accountId: string; threadIds: string[]; labelIds: string[] }) =>
    runRemoveLabelAction(input.accountId, input.threadIds, input.labelIds),
});

registry.register({
  id: "thread.snooze",
  run: async (input: { accountId: string; threadIds: string[]; remindAt: string }) =>
    runSnoozeAction(input.accountId, input.threadIds, input.remindAt),
});

registry.register({
  id: "thread.reminder",
  run: async (input: { accountId: string; threadIds: string[]; remindAt: string; note?: string }) =>
    runReminderAction(input.accountId, input.threadIds, input.remindAt, input.note),
});

registry.register({
  id: "compose.send",
  run: async (input: {
    accountId: string;
    clientMutationId: string;
    message: {
      to: Array<{ name?: string; email: string }>;
      cc?: Array<{ name?: string; email: string }>;
      bcc?: Array<{ name?: string; email: string }>;
      subject: string;
      textBody?: string;
      htmlBody?: string;
      threadProviderId?: string;
    };
  }) => runSendAction(input.accountId, input.clientMutationId, input.message),
});

registry.register({
  id: "compose.sendLater",
  run: async (input: {
    accountId: string;
    clientMutationId: string;
    sendAt: string;
    message: {
      to: Array<{ name?: string; email: string }>;
      cc?: Array<{ name?: string; email: string }>;
      bcc?: Array<{ name?: string; email: string }>;
      subject: string;
      textBody?: string;
      htmlBody?: string;
      threadProviderId?: string;
    };
  }) => runSendLaterAction(input.accountId, input.clientMutationId, input.message, input.sendAt),
});

registry.register({
  id: "compose.sendUndo",
  run: async (input: { accountId: string; undoToken: string }) =>
    runSendUndoAction(input.accountId, input.undoToken),
});

registry.register({
  id: "draft.create",
  run: async (input: {
    accountId: string;
    draftId: string;
    draft: {
      to: Array<{ name?: string; email: string }>;
      cc?: Array<{ name?: string; email: string }>;
      bcc?: Array<{ name?: string; email: string }>;
      subject: string;
      textBody?: string;
      htmlBody?: string;
      threadProviderId?: string;
    };
    sendLaterAt?: string;
  }) => runCreateDraftAction(input.accountId, input.draftId, input.draft, input.sendLaterAt),
});

registry.register({
  id: "draft.update",
  run: async (input: {
    accountId: string;
    draftId: string;
    providerDraftId: string;
    draft: {
      to: Array<{ name?: string; email: string }>;
      cc?: Array<{ name?: string; email: string }>;
      bcc?: Array<{ name?: string; email: string }>;
      subject: string;
      textBody?: string;
      htmlBody?: string;
      threadProviderId?: string;
    };
    sendLaterAt?: string;
  }) =>
    runUpdateDraftAction(
      input.accountId,
      input.draftId,
      input.providerDraftId,
      input.draft,
      input.sendLaterAt,
    ),
});

registry.register({
  id: "draft.send",
  run: async (input: { accountId: string; draftId: string; providerDraftId: string }) =>
    runSendDraftAction(input.accountId, input.draftId, input.providerDraftId),
});

export const runRegisteredAction = async <TInput, TResult>(
  actionId: string,
  input: TInput,
): Promise<TResult> => {
  const action = registry.get<TInput, TResult>(actionId);
  return action.run(input);
};

export const listRegisteredActionIds = (): string[] =>
  registry
    .list()
    .map((entry) => entry.id)
    .sort();
