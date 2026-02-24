import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest } from "@/lib/server/guards";
import { badRequest, notFound, serverError, unauthorized } from "@/lib/server/http";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    const { threadId } = await params;
    const accountId = request.nextUrl.searchParams.get("accountId");

    if (!accountId) {
      return badRequest("accountId is required");
    }

    const account = await appRepository.getAccountById(accountId);
    if (!account || account.userId !== auth.user.id) {
      return notFound("Account not found");
    }

    const thread = await appRepository.getThreadById(threadId, accountId);
    if (!thread) {
      return notFound("Thread not found");
    }

    return NextResponse.json({
      thread: {
        ...thread.thread,
        lastMessageAt: thread.thread.lastMessageAt.toISOString(),
      },
      messages: thread.messages.map((message) => ({
        ...message,
        internalDate: message.internalDate.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return serverError(error instanceof Error ? error.message : "Failed to fetch thread");
  }
}
