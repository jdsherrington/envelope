import type { ProviderErrorCode } from "../providers/types";

export type JobType =
  | "gmail.initialSync"
  | "gmail.incrementalSync"
  | "gmail.partialResync"
  | "gmail.archiveThreads"
  | "gmail.trashThreads"
  | "gmail.deleteThreadsPermanently"
  | "gmail.markThreadsRead"
  | "gmail.markThreadsUnread"
  | "gmail.addLabelsToThreads"
  | "gmail.removeLabelsFromThreads"
  | "gmail.createDraft"
  | "gmail.updateDraft"
  | "gmail.sendDraft"
  | "gmail.sendMessage"
  | "gmail.sendLater";

export type JobStatus = "pending" | "running" | "succeeded" | "failed" | "dead";

export type JobRecord = {
  id: string;
  accountId: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  runAt: string;
  attempt: number;
  maxAttempts: number;
  retryAfterMs?: number;
  lastErrorCode?: ProviderErrorCode | "UNKNOWN";
  lastErrorMessage?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
};

export type JobExecutionResult =
  | { status: "success" }
  | {
      status: "retry";
      reason: string;
      retryAfterMs: number;
      errorCode: ProviderErrorCode | "UNKNOWN";
    }
  | {
      status: "dead";
      reason: string;
      errorCode: ProviderErrorCode | "UNKNOWN";
    };
