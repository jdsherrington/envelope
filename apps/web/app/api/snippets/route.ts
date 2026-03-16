import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest } from "@/lib/server/guards";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { runMutationRoute } from "@/lib/server/mutation-route";

const createSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  kind: z.enum(["snippet", "template"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    const kind = request.nextUrl.searchParams.get("kind");
    const items =
      kind === "snippet" || kind === "template"
        ? await appRepository.listSnippetsByKind({ userId: auth.user.id, kind })
        : await appRepository.listSnippets(auth.user.id);
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return serverError(error instanceof Error ? error.message : "Failed to list snippets");
  }
}

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      const payload = createSchema.safeParse(await request.json());
      if (!payload.success) {
        return badRequest(payload.error.message);
      }

      const snippet = await appRepository.createSnippet({
        userId: auth.user.id,
        title: payload.data.title,
        body: payload.data.body,
        kind: payload.data.kind,
      });

      return NextResponse.json({ snippet });
    },
    "Failed to create snippet",
  );
}
