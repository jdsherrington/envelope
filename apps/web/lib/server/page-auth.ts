import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { appRepository } from "@envelope/db";
import { env } from "./env";
import { hashToken } from "./auth";

export const requirePageUser = async () => {
  const configured = await appRepository.hasUsers();
  if (!configured) {
    redirect("/setup");
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) {
    redirect("/login");
  }

  const session = await appRepository.getSessionByTokenHash(hashToken(token));
  if (!session) {
    redirect("/login");
  }

  const user = await appRepository.getUserById(session.userId);
  if (!user) {
    redirect("/login");
  }

  return { user, session };
};
