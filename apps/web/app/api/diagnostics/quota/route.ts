import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest } from "@/lib/server/guards";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    const accountId = request.nextUrl.searchParams.get("accountId");

    if (!accountId) {
      return badRequest("accountId is required");
    }

    const account = await appRepository.getAccountById(accountId);
    if (!account || account.userId !== auth.user.id) {
      return notFound("Account not found");
    }

    const quota = await appRepository.getQuotaSummary(accountId);
    return NextResponse.json(quota);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return serverError(error instanceof Error ? error.message : "Failed to fetch quota diagnostics");
  }
}
