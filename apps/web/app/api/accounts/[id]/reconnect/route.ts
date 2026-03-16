import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { notFound } from "@/lib/server/http";
import { runMutationRoute } from "@/lib/server/mutation-route";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return runMutationRoute(
    request,
    async (auth) => {
    const { id } = await params;
    const account = await appRepository.getAccountById(id);
    if (!account || account.userId !== auth.user.id) {
      return notFound("Account not found");
    }

    await appRepository.setAccountStatus({
      accountId: id,
      status: "syncing",
      lastErrorCode: null,
      lastErrorMessage: null,
      backoffUntil: null,
    });

    await appRepository.enqueueJob({
      accountId: id,
      type: "gmail.initialSync",
      payload: { accountId: id },
      idempotencyKey: `reconnect-initial-sync:${id}:${Date.now()}`,
    });

    return NextResponse.json({ ok: true });
  },
  "Failed to reconnect account",
);
}
