import { hostname } from "node:os";
import { appRepository } from "@envelope/db";
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
  const workerId = `${hostname()}:${process.pid}`;
  let batchRunning = false;
  let scheduleRunning = false;

  const runJobBatch = async () => {
    if (batchRunning) {
      return;
    }

    batchRunning = true;
    try {
      await processJobBatch();
    } catch (error) {
      logger.error({ error }, "worker.batch_error");
    } finally {
      batchRunning = false;
    }
  };

  const runSyncSchedule = async () => {
    if (scheduleRunning) {
      return;
    }

    scheduleRunning = true;
    try {
      await scheduleIncrementalSyncJobs();
    } catch (error) {
      logger.error({ error }, "worker.sync_schedule_error");
    } finally {
      scheduleRunning = false;
    }
  };

  const writeHeartbeat = async () => {
    try {
      await appRepository.updateWorkerHeartbeat({
        workerId,
        host: hostname(),
        pid: process.pid,
        version: env.WORKER_VERSION,
      });
    } catch (error) {
      logger.error({ error }, "worker.heartbeat_error");
    }
  };

  void runJobBatch();
  void runSyncSchedule();

  void writeHeartbeat();

  setInterval(() => {
    void runJobBatch();
  }, env.WORKER_POLL_MS);

  setInterval(() => {
    void runSyncSchedule();
  }, env.SYNC_POLL_MS);

  setInterval(() => {
    void writeHeartbeat();
  }, env.WORKER_HEARTBEAT_MS);
};

start();
