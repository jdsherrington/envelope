import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { badRequest } from "@/lib/server/http";
import { requireOwnedAccount, runMutationRoute } from "@/lib/server/mutation-route";
import { perfEventSchema } from "@/lib/server/schemas";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      const payload = perfEventSchema.safeParse(await request.json());
      if (!payload.success) {
        return badRequest(payload.error.message);
      }

      if (payload.data.accountId) {
        await requireOwnedAccount(auth.user.id, payload.data.accountId);
      }

      await appRepository.recordPerfEvent({
        userId: auth.user.id,
        accountId: payload.data.accountId ?? null,
        route: payload.data.route,
        metric: payload.data.metric,
        valueMs: payload.data.valueMs,
        metadata: payload.data.metadata,
      });

      return NextResponse.json({ ok: true });
    },
    "Failed to record perf event",
  );
}
