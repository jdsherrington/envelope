import {
  classifyJobError,
  type JobExecutionResult,
  type JobType,
  ProviderError,
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

const executeJob = async (job: {
  id: string;
  accountId: string;
  type: string;
  payload: Record<string, unknown>;
}) => {
  const type = job.type as JobType;
  const account = await ensureFreshToken(job.accountId);

  switch (type) {
    case "gmail.initialSync": {
      const delta = await gmailAdapter.mail.initialSync({ account, mode: "recent" });
      await persistSyncDelta(job.accountId, delta);
      await appRepository.setAccountStatus({ accountId: job.accountId, status: "ok" });
      return;
    }

    case "gmail.incrementalSync": {
      const payloadCursor =
        typeof job.payload["cursor"] === "string" && job.payload["cursor"].length > 0
          ? job.payload["cursor"]
          : null;
      const cursor = (await appRepository.getSyncCursor(job.accountId)) ?? payloadCursor;
      if (!cursor) {
        const delta = await gmailAdapter.mail.initialSync({ account, mode: "recent" });
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
      const delta = await gmailAdapter.mail.initialSync({ account, mode: "recent" });
      await persistSyncDelta(job.accountId, delta);
      return;
    }

    case "gmail.archiveThreads": {
      const threadIds = (job.payload["threadIds"] as string[]) ?? [];
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      await gmailAdapter.mutate.archiveThreads({ account, providerThreadIds });
      return;
    }

    case "gmail.markThreadsRead": {
      const threadIds = (job.payload["threadIds"] as string[]) ?? [];
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      await gmailAdapter.mutate.markThreadsRead({ account, providerThreadIds });
      return;
    }

    case "gmail.markThreadsUnread": {
      const threadIds = (job.payload["threadIds"] as string[]) ?? [];
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      await gmailAdapter.mutate.markThreadsUnread({ account, providerThreadIds });
      return;
    }

    case "gmail.addLabelsToThreads": {
      const threadIds = (job.payload["threadIds"] as string[]) ?? [];
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      const providerLabelIds = (job.payload["labelIds"] as string[]) ?? [];
      await gmailAdapter.mutate.addLabelsToThreads({ account, providerThreadIds, providerLabelIds });
      return;
    }

    case "gmail.removeLabelsFromThreads": {
      const threadIds = (job.payload["threadIds"] as string[]) ?? [];
      const providerThreadIds = await getProviderThreadIds(job.accountId, threadIds);
      const providerLabelIds = (job.payload["labelIds"] as string[]) ?? [];
      await gmailAdapter.mutate.removeLabelsFromThreads({
        account,
        providerThreadIds,
        providerLabelIds,
      });
      return;
    }

    default:
      throw new Error(`Unsupported job type: ${job.type}`);
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
      logger.info({ jobId: job.id, type: job.type }, "job.succeeded");
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
