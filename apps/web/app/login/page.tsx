import { redirect } from "next/navigation";
import { appRepository } from "@envelope/db";
import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const configured = await appRepository.hasUsers();
  if (!configured) {
    redirect("/setup");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl items-center px-4 py-8">
      <LoginForm />
    </main>
  );
}
