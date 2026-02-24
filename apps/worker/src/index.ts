import { logger } from "@envelope/observability";
import { env } from "./env";
import { processJobBatch, scheduleIncrementalSyncJobs } from "./job-handlers";

logger.info(
  {
    workerPollMs: env.WORKER_POLL_MS,
    syncPollMs: env.SYNC_POLL_MS,
  },
  "worker.start",
);

const start = () => {
  void processJobBatch().catch((error) => {
    logger.error({ error }, "worker.batch_error");
  });

  void scheduleIncrementalSyncJobs().catch((error) => {
    logger.error({ error }, "worker.sync_schedule_error");
  });

  setInterval(() => {
    void processJobBatch().catch((error) => {
      logger.error({ error }, "worker.batch_error");
    });
  }, env.WORKER_POLL_MS);

  setInterval(() => {
    void scheduleIncrementalSyncJobs().catch((error) => {
      logger.error({ error }, "worker.sync_schedule_error");
    });
  }, env.SYNC_POLL_MS);
};

start();
