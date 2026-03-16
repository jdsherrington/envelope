import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest } from "@/lib/server/guards";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/server/http";
import { searchSchema } from "@/lib/server/schemas";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);

    const payload = searchSchema.safeParse({
      accountId: request.nextUrl.searchParams.get("accountId"),
      q: request.nextUrl.searchParams.get("q"),
      page: request.nextUrl.searchParams.get("page") ?? "1",
    });

    if (!payload.success) {
      return badRequest(payload.error.message);
    }

    const account = await appRepository.getAccountById(payload.data.accountId);
    if (!account || account.userId !== auth.user.id) {
      return notFound("Account not found");
    }

    const items = await appRepository.searchThreads({
      accountId: payload.data.accountId,
      query: payload.data.q,
      page: payload.data.page,
      pageSize: 50,
    });

    return NextResponse.json({
      items: items.map((item) => ({
        ...item,
        lastMessageAt: item.lastMessageAt.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return serverError(error instanceof Error ? error.message : "Failed to search threads");
  }
}
