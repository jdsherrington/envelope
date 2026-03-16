import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRepository } from "@envelope/db";
import { badRequest, notFound } from "@/lib/server/http";
import { runMutationRoute } from "@/lib/server/mutation-route";

const schema = z.object({
  accountId: z.string().uuid(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  return runMutationRoute(
    request,
    async (auth) => {
      const payload = schema.safeParse(await request.json());
      if (!payload.success) {
        return badRequest(payload.error.message);
      }

      const account = await appRepository.getAccountById(payload.data.accountId);
      if (!account || account.userId !== auth.user.id) {
        return notFound("Account not found");
      }

      const { jobId } = await params;
      const job = await appRepository.retryDeadJob({
        jobId,
        accountId: payload.data.accountId,
      });

      if (!job) {
        return notFound("Job not found");
      }

      return NextResponse.json({ ok: true, jobId: job.id, status: job.status });
    },
    "Failed to retry job",
  );
}
