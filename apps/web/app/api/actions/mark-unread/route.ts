import { NextResponse, type NextRequest } from "next/server";
import { runMarkUnreadAction } from "@/lib/server/mail-actions";
import { requireAuthenticatedRequest, requireCsrf } from "@/lib/server/guards";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { threadActionSchema } from "@/lib/server/schemas";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    requireCsrf(request, auth.session.csrfToken);

    const payload = threadActionSchema.safeParse(await request.json());
    if (!payload.success) {
      return badRequest(payload.error.message);
    }

    const result = await runMarkUnreadAction(payload.data.accountId, payload.data.threadIds);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "INVALID_CSRF") {
      return forbidden("Invalid CSRF token");
    }
    return serverError(error instanceof Error ? error.message : "Failed to mark unread");
  }
}
