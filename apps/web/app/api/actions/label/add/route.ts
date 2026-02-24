import { NextResponse, type NextRequest } from "next/server";
import { runAddLabelAction } from "@/lib/server/mail-actions";
import { requireAuthenticatedRequest, requireCsrf } from "@/lib/server/guards";
import { badRequest, forbidden, serverError, unauthorized } from "@/lib/server/http";
import { labelActionSchema } from "@/lib/server/schemas";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    requireCsrf(request, auth.session.csrfToken);

    const payload = labelActionSchema.safeParse(await request.json());
    if (!payload.success) {
      return badRequest(payload.error.message);
    }

    const result = await runAddLabelAction(
      payload.data.accountId,
      payload.data.threadIds,
      payload.data.labelIds,
    );

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "INVALID_CSRF") {
      return forbidden("Invalid CSRF token");
    }
    return serverError(error instanceof Error ? error.message : "Failed to add labels");
  }
}
