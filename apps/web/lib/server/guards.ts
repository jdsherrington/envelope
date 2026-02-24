import type { NextRequest } from "next/server";
import { requireSession, verifyCsrf } from "./auth";

export const requireAuthenticatedRequest = async (request: NextRequest) => {
  const auth = await requireSession(request);
  return auth;
};

export const requireCsrf = (request: NextRequest, csrfTokenFromSession: string) => {
  if (!verifyCsrf(request, csrfTokenFromSession)) {
    throw new Error("INVALID_CSRF");
  }
};
