import { logger } from "./logger";

export const logCommandEvent = (event: {
  type: "command.invoked" | "command.succeeded" | "command.failed";
  userId: string;
  accountId?: string | null;
  commandId: string;
  commandVersion: number;
  viewScope: string;
  selectionCount: number;
  durationMs?: number;
  outcome?: "success" | "error" | "queued";
  errorCode?: string;
}): void => {
  logger.info(event, event.type);
};
