import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { badRequest } from "@/lib/server/http";
import { requireOwnedAccount, runMutationRoute } from "@/lib/server/mutation-route";
import { commandEventSchema } from "@/lib/server/schemas";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      const payload = commandEventSchema.safeParse(await request.json());
      if (!payload.success) {
        return badRequest(payload.error.message);
      }

      if (payload.data.accountId) {
        await requireOwnedAccount(auth.user.id, payload.data.accountId);
      }

      await appRepository.recordCommandEvent({
        userId: auth.user.id,
        accountId: payload.data.accountId ?? null,
        commandId: payload.data.commandId,
        commandVersion: payload.data.commandVersion,
        viewScope: payload.data.viewScope,
        selectionCount: payload.data.selectionCount,
        status: payload.data.status,
        durationMs: payload.data.durationMs,
        errorMessage: payload.data.errorMessage,
      });

      return NextResponse.json({ ok: true });
    },
    "Failed to record command event",
  );
}
