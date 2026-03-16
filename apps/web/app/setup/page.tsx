import { redirect } from "next/navigation";
import { appRepository } from "@envelope/db";
import { buildOtpAuthUri, generateTotpSecret } from "@envelope/security";
import { SetupFlow } from "@/components/setup-flow";
import { env } from "@/lib/server/env";
import { requirePageUser } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const hasUsers = await appRepository.hasUsers();
  const hasGmailConfig = Boolean(await appRepository.getOAuthClientConfig("gmail"));

  if (hasUsers && hasGmailConfig) {
    redirect("/inbox");
  }

  if (hasUsers && !hasGmailConfig) {
    await requirePageUser();
  }

  const secret = generateTotpSecret();
  const otpAuthUri = buildOtpAuthUri({
    issuer: "Envelope",
    accountName: "admin",
    secret,
  });

  return (
    <SetupFlow
      initialTotpSecret={secret}
      otpAuthUri={otpAuthUri}
      defaultRedirectUri={`${env.APP_ORIGIN}/api/auth/gmail/callback`}
      initialStep={hasUsers ? "gmail" : "user"}
    />
  );
}
