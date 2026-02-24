import type { SyncDelta } from "../providers/types";

export type SyncDeltaRepository = {
  upsertLabels(accountId: string, labels: SyncDelta["upsertLabels"]): Promise<void>;
  upsertThreads(accountId: string, threads: SyncDelta["upsertThreads"]): Promise<void>;
  upsertMessages(accountId: string, messages: SyncDelta["upsertMessages"]): Promise<void>;
  deleteThreadsByProviderIds(accountId: string, providerThreadIds: string[]): Promise<void>;
  deleteMessagesByProviderIds(accountId: string, providerMessageIds: string[]): Promise<void>;
  updateSyncCursor(accountId: string, cursorRaw: string): Promise<void>;
};

export const applySyncDelta = async (
  repo: SyncDeltaRepository,
  accountId: string,
  delta: SyncDelta,
): Promise<void> => {
  if (delta.upsertLabels?.length) {
    await repo.upsertLabels(accountId, delta.upsertLabels);
  }

  if (delta.upsertThreads?.length) {
    await repo.upsertThreads(accountId, delta.upsertThreads);
  }

  if (delta.upsertMessages?.length) {
    await repo.upsertMessages(accountId, delta.upsertMessages);
  }

  if (delta.deleteMessageIds?.length) {
    await repo.deleteMessagesByProviderIds(accountId, delta.deleteMessageIds);
  }

  if (delta.deleteThreadIds?.length) {
    await repo.deleteThreadsByProviderIds(accountId, delta.deleteThreadIds);
  }

  await repo.updateSyncCursor(accountId, delta.newCursor.raw);
};
