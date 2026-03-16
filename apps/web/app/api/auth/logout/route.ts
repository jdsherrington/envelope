import { type NextRequest, NextResponse } from "next/server";
import { appRepository } from "@envelope/db";
import { clearSessionCookies, hashToken } from "@/lib/server/auth";
import { runMutationRoute } from "@/lib/server/mutation-route";

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      await appRepository.deleteSessionByTokenHash(hashToken(auth.token));
      await clearSessionCookies();
      return NextResponse.json({ ok: true });
    },
    "Failed to logout",
  );
}
