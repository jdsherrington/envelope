import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { appRepository } from "@envelope/db";
import { env } from "@/lib/server/env";
import { hashToken } from "@/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
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

  redirect("/inbox");
}
