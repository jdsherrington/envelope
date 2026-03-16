import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { badRequest, notFound } from "@/lib/server/http";
import { runMutationRoute } from "@/lib/server/mutation-route";
import { syncRefreshSchema } from "@/lib/server/schemas";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      const payload = syncRefreshSchema.safeParse(await request.json());
      if (!payload.success) {
        return badRequest(payload.error.message);
      }

      const account = await appRepository.getAccountById(payload.data.accountId);
      if (!account || account.userId !== auth.user.id) {
        return notFound("Account not found");
      }

      const result = await appRepository.enqueueJob({
        accountId: payload.data.accountId,
        type: "gmail.incrementalSync",
        payload: {
          accountId: payload.data.accountId,
          cursor: account.syncCursor,
          manual: true,
        },
        idempotencyKey: `manual-refresh:${payload.data.accountId}:${Date.now()}`,
      });

      await appRepository.setAccountStatus({
        accountId: payload.data.accountId,
        status: "syncing",
        lastErrorCode: null,
        lastErrorMessage: null,
      });

      return NextResponse.json(result);
    },
    "Failed to queue refresh",
  );
}
