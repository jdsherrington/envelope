import { NextResponse } from "next/server";
import { appRepository } from "@envelope/db";
import { env } from "@/lib/server/env";
import { evaluateHealth } from "@/lib/server/health";

export async function GET() {
  let dbOk = false;

  try {
    dbOk = await appRepository.pingDatabase();
  } catch {
    dbOk = false;
  }

  const workerHeartbeat = await appRepository.getLatestWorkerHeartbeat();
  const payload = evaluateHealth({
    dbOk,
    workerHeartbeat,
    appVersion: env.APP_VERSION,
  });

  return NextResponse.json(payload, {
    status: payload.status === "ok" ? 200 : 503,
  });
}
