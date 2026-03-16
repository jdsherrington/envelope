import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest } from "@/lib/server/guards";
import { serverError, unauthorized } from "@/lib/server/http";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    const diagnostics = await appRepository.diagnosticsForUser(auth.user.id);

    const payload = {
      exportedAt: new Date().toISOString(),
      userId: auth.user.id,
      diagnostics,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="envelope-diagnostics.json"',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return serverError(error instanceof Error ? error.message : "Failed to export diagnostics");
  }
}
