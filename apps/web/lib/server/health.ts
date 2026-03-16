export type HealthStatus = "ok" | "degraded";

export type WorkerHeartbeatSnapshot = {
  workerId: string;
  host: string;
  pid: number;
  version: string;
  recordedAt: Date;
} | null;

export type HealthResponse = {
  status: HealthStatus;
  timestamp: string;
  version: string;
  checks: {
    db: {
      ok: boolean;
    };
    worker: {
      ok: boolean;
      staleMs: number | null;
      lastSeenAt: string | null;
      workerId: string | null;
      host: string | null;
      pid: number | null;
      version: string | null;
    };
  };
};

export const evaluateHealth = (args: {
  dbOk: boolean;
  workerHeartbeat: WorkerHeartbeatSnapshot;
  appVersion: string;
  now?: Date;
  maxWorkerStalenessMs?: number;
}): HealthResponse => {
  const nowAt = args.now ?? new Date();
  const maxStaleMs = args.maxWorkerStalenessMs ?? 90_000;
  const lastSeenAt = args.workerHeartbeat?.recordedAt ?? null;
  const staleMs = lastSeenAt ? nowAt.getTime() - lastSeenAt.getTime() : null;
  const workerOk = staleMs !== null && staleMs <= maxStaleMs;
  const status: HealthStatus = args.dbOk && workerOk ? "ok" : "degraded";

  return {
    status,
    timestamp: nowAt.toISOString(),
    version: args.appVersion,
    checks: {
      db: {
        ok: args.dbOk,
      },
      worker: {
        ok: workerOk,
        staleMs,
        lastSeenAt: lastSeenAt ? lastSeenAt.toISOString() : null,
        workerId: args.workerHeartbeat?.workerId ?? null,
        host: args.workerHeartbeat?.host ?? null,
        pid: args.workerHeartbeat?.pid ?? null,
        version: args.workerHeartbeat?.version ?? null,
      },
    },
  };
};
