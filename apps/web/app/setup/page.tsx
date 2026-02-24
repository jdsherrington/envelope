import { redirect } from "next/navigation";
import { appRepository } from "@envelope/db";
import { buildOtpAuthUri, generateTotpSecret } from "@envelope/security";
import { SetupFlow } from "@/components/setup-flow";
import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const hasUsers = await appRepository.hasUsers();
  if (hasUsers) {
    redirect("/inbox");
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
    />
  );
}
