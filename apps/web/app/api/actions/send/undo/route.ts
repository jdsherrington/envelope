import { NextResponse, type NextRequest } from "next/server";
import { runRegisteredAction } from "@/lib/server/action-registry";
import { badRequest, notFound } from "@/lib/server/http";
import { requireOwnedAccount, runMutationRoute } from "@/lib/server/mutation-route";
import { sendUndoSchema } from "@/lib/server/schemas";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      const payload = sendUndoSchema.safeParse(await request.json());
      if (!payload.success) {
        return badRequest(payload.error.message);
      }

      await requireOwnedAccount(auth.user.id, payload.data.accountId);

      const job = await runRegisteredAction<{
        accountId: string;
        undoToken: string;
      }, { id: string; status: string } | null>("compose.sendUndo", {
        accountId: payload.data.accountId,
        undoToken: payload.data.undoToken,
      });
      if (!job) {
        return notFound("No pending send found for undo token");
      }

      return NextResponse.json({ ok: true, jobId: job.id, status: job.status });
    },
    "Failed to undo send",
  );
}
