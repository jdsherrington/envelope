import { ProviderError } from "../providers/types";
import type { JobExecutionResult } from "./types";

const MAX_BACKOFF_MS = 5 * 60 * 1000;
type JobFailureResult = Exclude<JobExecutionResult, { status: "success" }>;

export const getRetryDelayMs = (attempt: number): number => {
  const base = 1000;
  return Math.min(MAX_BACKOFF_MS, base * 2 ** Math.max(attempt, 0));
};

export const classifyJobError = (
  error: unknown,
  attempt: number,
  maxAttempts: number,
): JobFailureResult => {
  const unknownResult = (reason: string): JobFailureResult => {
    if (attempt >= maxAttempts) {
      return { status: "dead", reason, errorCode: "UNKNOWN" };
    }
    return {
      status: "retry",
      reason,
      retryAfterMs: getRetryDelayMs(attempt),
      errorCode: "UNKNOWN",
    };
  };

  if (!(error instanceof ProviderError)) {
    return unknownResult(error instanceof Error ? error.message : "Unknown error");
  }

  if (!error.retryable || attempt >= maxAttempts) {
    return {
      status: "dead",
      reason: error.message,
      errorCode: error.code,
    };
  }

  return {
    status: "retry",
    reason: error.message,
    retryAfterMs: error.retryAfterMs ?? getRetryDelayMs(attempt),
    errorCode: error.code,
  };
};
