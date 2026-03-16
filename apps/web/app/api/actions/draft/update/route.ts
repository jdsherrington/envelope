import { NextResponse, type NextRequest } from "next/server";
import { runRegisteredAction } from "@/lib/server/action-registry";
import { badRequest } from "@/lib/server/http";
import { requireOwnedAccount, runMutationRoute } from "@/lib/server/mutation-route";
import { draftUpdateSchema } from "@/lib/server/schemas";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      const payload = draftUpdateSchema.safeParse(await request.json());
      if (!payload.success) {
        return badRequest(payload.error.message);
      }

      await requireOwnedAccount(auth.user.id, payload.data.accountId);
      const result = await runRegisteredAction("draft.update", {
        accountId: payload.data.accountId,
        draftId: payload.data.draftId,
        providerDraftId: payload.data.providerDraftId,
        draft: payload.data.draft,
        sendLaterAt: payload.data.sendLaterAt,
      });
      return NextResponse.json(result);
    },
    "Failed to update draft",
  );
}
