import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest } from "@/lib/server/guards";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);

    const page = Number(request.nextUrl.searchParams.get("page") ?? "1");
    const accountIdFromQuery = request.nextUrl.searchParams.get("accountId");
    const label = request.nextUrl.searchParams.get("label") ?? undefined;

    const accounts = await appRepository.listAccountsForUser(auth.user.id);
    if (!accounts.length) {
      return NextResponse.json({ items: [], accountId: null });
    }

    const accountId = accountIdFromQuery ?? accounts.at(0)?.id ?? null;
    if (!accountId) {
      return badRequest("No active account");
    }

    const selected = accounts.find((account) => account.id === accountId);
    if (!selected) {
      return badRequest("Account does not belong to user");
    }

    const items = await appRepository.listInboxThreads({
      accountId,
      page: Number.isFinite(page) ? Math.max(page, 1) : 1,
      pageSize: 50,
      label,
    });

    return NextResponse.json({
      accountId,
      accounts,
      items: items.map((item) => ({
        ...item,
        lastMessageAt: item.lastMessageAt.toISOString(),
        senderName: item.senderName,
        senderEmail: item.senderEmail,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return serverError(error instanceof Error ? error.message : "Failed to fetch inbox");
  }
}
