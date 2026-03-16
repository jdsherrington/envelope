import {
  classifyJobError,
  type InitialSyncChunk,
  type JobExecutionResult,
  type JobType,
  ProviderError,
  type OutgoingDraft,
  type OutgoingMessage,
} from "@envelope/core";
import { appRepository } from "@envelope/db";
import { logger } from "@envelope/observability";
import { gmailAdapter } from "@envelope/providers-gmail";
import {
  encryptSecret,
  getSecretsKey,
  serializeEncryptedSecret,
} from "@envelope/security";
import { env } from "./env";
import { loadAccountProviderContext } from "./provider-context";
import { persistSyncDelta } from "./sync";

const key = getSecretsKey(env.ENVELOPE_SECRETS_KEY);

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

const toOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const toDraft = (value: unknown): OutgoingDraft => {
  if (!value || typeof value !== "object") {
    throw new Error("Invalid draft payload");
  }

  const draft = value as OutgoingDraft;
  if (!draft.to?.length || !draft.subject) {
    throw new Error("Draft requires recipients and subject");
  }

  return draft;
};

const toMessage = (value: unknown): OutgoingMessage => toDraft(value);

const ensureFreshToken = async (accountId: string) => {
  const context = await loadAccountProviderContext(accountId);
  if (!context) {
    throw new Error("Account context not found");
  }

  const expiresSoon = new Date(context.tokens.expiresAt).getTime() <= Date.now() + 2 * 60 * 1000;
  if (!expiresSoon) {
    return context;
  }

  const refreshed = await gmailAdapter.auth.refreshAccessToken({
    oauthConfig: context.oauthConfig,
    refreshToken: context.tokens.refreshToken,
  });

  await appRepository.updateAccountTokens({
    accountId,
    encryptedAccessToken: serializeEncryptedSecret(encryptSecret(refreshed.accessToken, key)),
    tokenExpiresAt: new Date(refreshed.expiresAt),
  });

  return {
    ...context,
    tokens: {
      ...context.tokens,
      accessToken: refreshed.accessToken,
      expiresAt: refreshed.expiresAt,
    },
  };
};

const getProviderThreadIds = async (accountId: string, threadIds: string[]): Promise<string[]> => {
  const rows = await appRepository.getProviderThreadIds(accountId, threadIds);
  return rows.map((row) => row.providerThreadId);
};

const persistInitialSyncChunk = async (accountId: string, chunk: InitialSyncChunk) => {
  if (chunk.upsertLabels?.length) {
    await appRepository.upsertLabels(accountId, chunk.upsertLabels);
  }

  if (chunk.upsertThreads?.length) {
    await appRepository.upsertThreads(accountId, chunk.upsertThreads);
  }

  if (chunk.upsertMessages?.length) {
    await appRepository.upsertMessages(accountId, chunk.upsertMessages);
  }
};

const executeJob = async (job: {
  id: string;
  accountId: string;
  type: string;
  payload: Record<string, unknown>;
}) => {
  const type = job.type as JobType;

  if (type === "envelope.reminderWakeup") {
    await appRepository.wakeReminderThreads({
      accountId: job.accountId,
      threadIds: toStringArray(job.payload["threadIds"]),
    });
    return;
  }

  const account = await ensureFreshToken(job.accountId);

  switch (type) {
    case "gmail.initialSync": {
      await appRepository.startInitialSyncProgress({
        accountId: job.accountId,
        phase: "initializing",
        target: 1000,
      });

      const delta = await gmailAdapter.mail.initialSync({
        account,
        mode: "recent",
        onProgress: (progress) =>
          appRepository.updateInitialSyncProgress({
            accountId: job.accountId,
            phase: progress.phase,
            processed: progress.processed,
            target: progress.target,
          }),
        onChunk: (chunk) => persistInitialSyncChunk(job.accountId, chunk),
      });
      await persistSyncDelta(job.accountId, delta);
      await appRepository.setAccountStatus({ accountId: job.accountId, status: "ok" });
      return;
    }

    case "gmail.incrementalSync": {
      const payloadCursor = toOptionalString(job.payload["cursor"]);
      const cursor = (await appRepository.getSyncCursor(job.accountId)) ?? payloadCursor;
      if (!cursor) {
        const delta = await gmailAdapter.mail.initialSync({
          account,
          mode: "recent",
          onProgress: (progress) =>
            appRepository.updateInitialSyncProgress({
              accountId: job.accountId,
              phase: progress.phase,
              processed: progress.processed,
              target: progress.target,
            }),
          onChunk: (chunk) => persistInitialSyncChunk(job.accountId, chunk),
        });
        await persistSyncDelta(job.accountId, delta);
        return;
      }

      try {
        const delta = await gmailAdapter.mail.incrementalSync({
          account,
          cursor: { raw: cursor },
        });
        await persistSyncDelta(job.accountId, delta);
        await appRepository.setAccountStatus({ accountId: job.accountId, status: "ok" });
      } catch (error) {
        if (error instanceof ProviderError && error.code === "NOT_FOUND") {
          await appRepository.setAccountStatus({
            accountId: job.accountId,
            status: "syncing",
            lastErrorCode: "CURSOR_STALE",
            lastErrorMessage: "Sync cursor expired; queued partial resync",
          });
          await appRepository.enqueueJob({
            accountId: job.accountId,
            type: "gmail.partialResync",
            payload: { accountId: job.accountId },
            idempotencyKey: `partial-resync:${job.accountId}:${Date.now()}`,
          });
          return;
        }
        throw error;
      }
      return;
    }

    case "gmail.partialResync": {
      await appRepository.startInitialSyncProgress({
        accountId: job.accountId,
        phase: "partial-resync",
        target: 500,
      });

      const delta = await gmailAdapter.mail.initialSync({
        account,
        mode: "recent",
        onProgress: (progress) =>
          appRepository.updateInitialSyncProgress({
            accountId: job.accountId,
            phase: progress.phase,
            processed: progress.processed,
            target: progress.target,
          }),
        onChunk: (chunk) => persistInitialSyncChunk(job.accountId, chunk),
      });
      await persistSyncDelta(job.accountId, delta);
      await appRepository.setAccountStatus({ accountId: job.accountId, status: "ok" });
      return;
    }

    case "gmail.prefetchThreadBodies": {
      const providerThreadIds = toStringArray(job.payload["providerThreadIds"]);
      for (const providerThreadId of providerThreadIds) {
        const missing = await appRepository.listMessagesMissingBodies({
          accountId: job.accountId,
          providerThreadId,
        });

        if (!missing.length) {
          continue;
        }

        const full = await gmailAdapter.mail.getThread({
          account,
          providerThreadId,
          includeBodies: true,
        });

        for (const message of full.messages) {
          if (!message.textBody && !message.htmlBody) {
            continue;
          }
          await appRepository.updateMessageBodies({
            accountId: job.accountId,
            providerMessageId: message.providerMessageId,
            textBody: message.textBody,
            htmlBody: message.htmlBody,
          });
        }
      }
      return;
    }

    case "gmail.archiveThreads": {
      const threadIds = toStringArray(job.payload["threadIds"]);
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      if (!providerThreadIds.length) {
        return;
      }
      await gmailAdapter.mutate.archiveThreads({ account, providerThreadIds });
      return;
    }

    case "gmail.trashThreads": {
      const threadIds = toStringArray(job.payload["threadIds"]);
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      if (!providerThreadIds.length) {
        return;
      }
      await gmailAdapter.mutate.trashThreads({ account, providerThreadIds });
      return;
    }

    case "gmail.deleteThreadsPermanently": {
      const threadIds = toStringArray(job.payload["threadIds"]);
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      if (!providerThreadIds.length) {
        return;
      }
      await gmailAdapter.mutate.deleteThreadsPermanently({ account, providerThreadIds });
      return;
    }

    case "gmail.moveThreadsToSpam": {
      const threadIds = toStringArray(job.payload["threadIds"]);
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      if (!providerThreadIds.length) {
        return;
      }
      if (!gmailAdapter.mutate.moveThreadsToSpam) {
        throw new ProviderError({
          message: "Provider does not support spam mutation",
          code: "INVALID_REQUEST",
          retryable: false,
        });
      }
      await gmailAdapter.mutate.moveThreadsToSpam({ account, providerThreadIds });
      return;
    }

    case "gmail.markThreadsRead": {
      const threadIds = toStringArray(job.payload["threadIds"]);
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      if (!providerThreadIds.length) {
        return;
      }
      await gmailAdapter.mutate.markThreadsRead({ account, providerThreadIds });
      return;
    }

    case "gmail.markThreadsUnread": {
      const threadIds = toStringArray(job.payload["threadIds"]);
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      if (!providerThreadIds.length) {
        return;
      }
      await gmailAdapter.mutate.markThreadsUnread({ account, providerThreadIds });
      return;
    }

    case "gmail.addLabelsToThreads": {
      const threadIds = toStringArray(job.payload["threadIds"]);
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      const providerLabelIds = toStringArray(job.payload["labelIds"]);
      if (!providerThreadIds.length || !providerLabelIds.length) {
        return;
      }
      await gmailAdapter.mutate.addLabelsToThreads({ account, providerThreadIds, providerLabelIds });
      return;
    }

    case "gmail.removeLabelsFromThreads": {
      const threadIds = toStringArray(job.payload["threadIds"]);
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      const providerLabelIds = toStringArray(job.payload["labelIds"]);
      if (!providerThreadIds.length || !providerLabelIds.length) {
        return;
      }
      await gmailAdapter.mutate.removeLabelsFromThreads({
        account,
        providerThreadIds,
        providerLabelIds,
      });
      return;
    }

    case "gmail.createDraft": {
      const draftId = toOptionalString(job.payload["draftId"]);
      const draft = toDraft(job.payload["draft"]);
      if (!draftId) {
        throw new Error("Missing draftId");
      }

      const created = await gmailAdapter.mutate.createDraft({ account, draft });
      await appRepository.patchDraftProviderMetadata({
        accountId: job.accountId,
        draftId,
        providerDraftId: created.providerDraftId,
        lastProviderMessageId: created.providerMessageId,
        providerThreadId: draft.threadProviderId,
      });
      return;
    }

    case "gmail.updateDraft": {
      const providerDraftId = toOptionalString(job.payload["providerDraftId"]);
      const draft = toDraft(job.payload["draft"]);
      if (!providerDraftId) {
        throw new Error("Missing providerDraftId");
      }

      await gmailAdapter.mutate.updateDraft({
        account,
        providerDraftId,
        draft,
      });
      return;
    }

    case "gmail.sendDraft": {
      const providerDraftId = toOptionalString(job.payload["providerDraftId"]);
      const draftId = toOptionalString(job.payload["draftId"]);
      if (!providerDraftId || !draftId) {
        throw new Error("Missing draft send payload");
      }

      const result = await gmailAdapter.mutate.sendDraft({ account, providerDraftId });
      await appRepository.markDraftSent({
        accountId: job.accountId,
        draftId,
        providerMessageId: result.providerMessageId,
        providerThreadId: result.providerThreadId,
      });
      return;
    }

    case "gmail.sendMessage": {
      const message = toMessage(job.payload["message"]);
      await gmailAdapter.mutate.sendMessage({ account, message });
      return;
    }

    case "gmail.sendLater": {
      const message = toMessage(job.payload["message"]);
      const sendAt = toOptionalString(job.payload["sendAt"]);
      if (!sendAt) {
        throw new Error("Missing sendAt");
      }

      if (gmailAdapter.mutate.sendLater && gmailAdapter.capabilities.supportsSendLater) {
        await gmailAdapter.mutate.sendLater({ account, message, sendAt });
      } else {
        await gmailAdapter.mutate.sendMessage({ account, message });
      }
      return;
    }

    default: {
      throw new Error(`Unsupported job type: ${job.type}`);
    }
  }
};

const handleError = async (
  job: { id: string; attempt: number; maxAttempts: number; accountId: string },
  error: unknown,
): Promise<JobExecutionResult> => {
  const result = classifyJobError(error, job.attempt, job.maxAttempts);

  if (result.status === "retry") {
    await appRepository.retryJob({
      jobId: job.id,
      retryAfterMs: result.retryAfterMs,
      errorCode: result.errorCode,
      errorMessage: result.reason,
    });

    if (result.errorCode === "RATE_LIMITED") {
      const backoffUntil = new Date(Date.now() + result.retryAfterMs);
      await appRepository.setAccountStatus({
        accountId: job.accountId,
        status: "rate_limited",
        lastErrorCode: result.errorCode,
        lastErrorMessage: result.reason,
        backoffUntil,
      });
      await appRepository.recordQuotaEvent({
        accountId: job.accountId,
        windowLabel: "perMinute",
        backoffUntil,
        errorCode: result.errorCode,
        errorMessage: result.reason,
      });
    }

    if (result.errorCode === "AUTH_EXPIRED") {
      await appRepository.setAccountStatus({
        accountId: job.accountId,
        status: "needs_reauth",
        lastErrorCode: result.errorCode,
        lastErrorMessage: result.reason,
      });
    }

    return result;
  }

  await appRepository.deadLetterJob({
    jobId: job.id,
    errorCode: result.errorCode,
    errorMessage: result.reason,
  });

  await appRepository.setAccountStatus({
    accountId: job.accountId,
    status: result.errorCode === "AUTH_REVOKED" ? "needs_reauth" : "error",
    lastErrorCode: result.errorCode,
    lastErrorMessage: result.reason,
  });

  return result;
};

export const processJobBatch = async (limit = 20): Promise<void> => {
  const dueJobs = await appRepository.takeDueJobs(limit);
  if (!dueJobs.length) {
    return;
  }

  for (const job of dueJobs) {
    try {
      await executeJob(job);
      await appRepository.completeJob(job.id);

      if (job.type.startsWith("gmail.")) {
        await appRepository.incrementQuotaRequestCount({
          accountId: job.accountId,
          count: 1,
        });
        await appRepository.recordQuotaEvent({
          accountId: job.accountId,
          windowLabel: "request",
          used: 1,
        });
      }

      logger.info({ jobId: job.id, type: job.type }, "job.succeeded");
      await appRepository.recordAccountLogEvent({
        accountId: job.accountId,
        level: "info",
        scope: "worker.job",
        message: "Job succeeded",
        metadata: {
          jobId: job.id,
          type: job.type,
        },
      });
    } catch (error) {
      const result = await handleError(job, error);
      logger.error(
        {
          jobId: job.id,
          type: job.type,
          result,
          error: error instanceof Error ? error.message : error,
        },
        "job.failed",
      );
      await appRepository.recordAccountLogEvent({
        accountId: job.accountId,
        level: "error",
        scope: "worker.job",
        message: "Job failed",
        metadata: {
          jobId: job.id,
          type: job.type,
          result,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
};

export const scheduleIncrementalSyncJobs = async (): Promise<void> => {
  const accounts = await appRepository.getAccountsForIncrementalSync();
  for (const account of accounts) {
    await appRepository.enqueueJob({
      accountId: account.id,
      type: "gmail.incrementalSync",
      payload: { accountId: account.id, cursor: account.syncCursor },
      idempotencyKey: `incremental-sync:${account.id}`,
    });
  }
};
