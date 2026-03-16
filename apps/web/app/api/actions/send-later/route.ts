import { NextResponse, type NextRequest } from "next/server";
import { runRegisteredAction } from "@/lib/server/action-registry";
import { badRequest } from "@/lib/server/http";
import { requireOwnedAccount, runMutationRoute } from "@/lib/server/mutation-route";
import { sendLaterSchema } from "@/lib/server/schemas";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      const payload = sendLaterSchema.safeParse(await request.json());
      if (!payload.success) {
        return badRequest(payload.error.message);
      }

      await requireOwnedAccount(auth.user.id, payload.data.accountId);
      const result = await runRegisteredAction("compose.sendLater", {
        accountId: payload.data.accountId,
        clientMutationId: payload.data.clientMutationId,
        message: payload.data.message,
        sendAt: payload.data.sendAt,
      });
      return NextResponse.json(result);
    },
    "Failed to schedule send",
  );
}
