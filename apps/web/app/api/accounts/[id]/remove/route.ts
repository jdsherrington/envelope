import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { notFound } from "@/lib/server/http";
import { runMutationRoute } from "@/lib/server/mutation-route";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return runMutationRoute(
    request,
    async (auth) => {
    const { id } = await params;
    const account = await appRepository.getAccountById(id);
    if (!account || account.userId !== auth.user.id) {
      return notFound("Account not found");
    }

    await appRepository.removeAccount(id);
    return NextResponse.json({ ok: true });
  },
  "Failed to remove account",
);
}
