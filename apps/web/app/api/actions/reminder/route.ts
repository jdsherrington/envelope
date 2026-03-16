import { NextResponse, type NextRequest } from "next/server";
import { runRegisteredAction } from "@/lib/server/action-registry";
import { badRequest } from "@/lib/server/http";
import { requireOwnedAccount, runMutationRoute } from "@/lib/server/mutation-route";
import { reminderActionSchema } from "@/lib/server/schemas";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      const payload = reminderActionSchema.safeParse(await request.json());
      if (!payload.success) {
        return badRequest(payload.error.message);
      }

      await requireOwnedAccount(auth.user.id, payload.data.accountId);
      const result = await runRegisteredAction("thread.reminder", {
        accountId: payload.data.accountId,
        threadIds: payload.data.threadIds,
        remindAt: payload.data.remindAt,
        note: payload.data.note,
      });

      return NextResponse.json(result);
    },
    "Failed to schedule reminder",
  );
}
