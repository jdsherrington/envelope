import { NextResponse, type NextRequest } from "next/server";
import { runRegisteredAction } from "@/lib/server/action-registry";
import { badRequest } from "@/lib/server/http";
import { requireOwnedAccount, runMutationRoute } from "@/lib/server/mutation-route";
import { draftCreateSchema } from "@/lib/server/schemas";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      const payload = draftCreateSchema.safeParse(await request.json());
      if (!payload.success) {
        return badRequest(payload.error.message);
      }

      await requireOwnedAccount(auth.user.id, payload.data.accountId);
      const result = await runRegisteredAction("draft.create", {
        accountId: payload.data.accountId,
        draftId: payload.data.draftId,
        draft: payload.data.draft,
        sendLaterAt: payload.data.sendLaterAt,
      });
      return NextResponse.json(result);
    },
    "Failed to create draft",
  );
}
