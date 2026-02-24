import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest, requireCsrf } from "@/lib/server/guards";
import { forbidden, notFound, serverError, unauthorized } from "@/lib/server/http";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    requireCsrf(request, auth.session.csrfToken);

    const { id } = await params;
    const account = await appRepository.getAccountById(id);
    if (!account || account.userId !== auth.user.id) {
      return notFound("Account not found");
    }

    await appRepository.removeAccount(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "INVALID_CSRF") {
      return forbidden("Invalid CSRF token");
    }
    return serverError(error instanceof Error ? error.message : "Failed to remove account");
  }
}
