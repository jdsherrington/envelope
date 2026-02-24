import { applySyncDelta, type SyncDeltaRepository } from "@envelope/core";
import { appRepository } from "@envelope/db";

const repo: SyncDeltaRepository = {
  upsertLabels: (accountId, labels) => appRepository.upsertLabels(accountId, labels),
  upsertThreads: (accountId, threads) => appRepository.upsertThreads(accountId, threads),
  upsertMessages: (accountId, messages) => appRepository.upsertMessages(accountId, messages),
  deleteThreadsByProviderIds: (accountId, providerThreadIds) =>
    appRepository.deleteThreadsByProviderIds(accountId, providerThreadIds),
  deleteMessagesByProviderIds: (accountId, providerMessageIds) =>
    appRepository.deleteMessagesByProviderIds(accountId, providerMessageIds),
  updateSyncCursor: (accountId, cursorRaw) => appRepository.updateSyncCursor(accountId, cursorRaw),
};

export const persistSyncDelta = async (
  accountId: string,
  delta: Parameters<typeof applySyncDelta>[2],
): Promise<void> => applySyncDelta(repo, accountId, delta);
