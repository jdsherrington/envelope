import { type NextRequest, NextResponse } from "next/server";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest, requireCsrf } from "./guards";
import { forbidden, notFound, serverError, unauthorized } from "./http";

export type AuthenticatedRequest = Awaited<ReturnType<typeof requireAuthenticatedRequest>>;

export const runMutationRoute = async (
  request: NextRequest,
  handler: (auth: AuthenticatedRequest) => Promise<NextResponse>,
  defaultError: string,
): Promise<NextResponse> => {
  try {
    const auth = await requireAuthenticatedRequest(request);
    requireCsrf(request, auth.session.csrfToken);
    return await handler(auth);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    if (error instanceof Error && error.message === "INVALID_CSRF") {
      return forbidden("Invalid CSRF token");
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return forbidden("Invalid request origin");
    }
    if (error instanceof Error && error.message === "ACCOUNT_NOT_FOUND") {
      return notFound("Account not found");
    }
    return serverError(error instanceof Error ? error.message : defaultError);
  }
};

export const requireOwnedAccount = async (userId: string, accountId: string) => {
  const account = await appRepository.getAccountById(accountId);
  if (!account || account.userId !== userId) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }
  return account;
};
