import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest } from "@/lib/server/guards";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 1000)) : 200;

    const logs = await appRepository.listLogEvents(auth.user.id, limit);
    return NextResponse.json({ items: logs });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return serverError(error instanceof Error ? error.message : "Failed to load logs");
  }
}
