import { describe, expect, test } from "bun:test";
import { evaluateHealth } from "./health";

describe("evaluateHealth", () => {
  test("returns ok when db and worker checks pass", () => {
    const now = new Date("2026-02-25T10:00:00.000Z");
    const health = evaluateHealth({
      dbOk: true,
      appVersion: "1.2.3",
      now,
      workerHeartbeat: {
        workerId: "worker-a",
        host: "host-a",
        pid: 1234,
        version: "1.2.3",
        recordedAt: new Date(now.getTime() - 20_000),
      },
    });

    expect(health.status).toBe("ok");
    expect(health.checks.db.ok).toBe(true);
    expect(health.checks.worker.ok).toBe(true);
  });

  test("returns degraded when worker heartbeat is stale", () => {
    const now = new Date("2026-02-25T10:00:00.000Z");
    const health = evaluateHealth({
      dbOk: true,
      appVersion: "1.2.3",
      now,
      workerHeartbeat: {
        workerId: "worker-a",
        host: "host-a",
        pid: 1234,
        version: "1.2.3",
        recordedAt: new Date(now.getTime() - 91_000),
      },
    });

    expect(health.status).toBe("degraded");
    expect(health.checks.worker.ok).toBe(false);
  });

  test("returns degraded when db check fails", () => {
    const health = evaluateHealth({
      dbOk: false,
      appVersion: "1.2.3",
      workerHeartbeat: null,
    });

    expect(health.status).toBe("degraded");
    expect(health.checks.db.ok).toBe(false);
  });
});
