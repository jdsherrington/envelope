"use client";

import Link from "next/link";
import { useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";

type SetupFlowProps = {
  initialTotpSecret: string;
  otpAuthUri: string;
  defaultRedirectUri: string;
};

export function SetupFlow({
  initialTotpSecret,
  otpAuthUri,
  defaultRedirectUri,
}: SetupFlowProps) {
  const [step, setStep] = useState<"user" | "gmail" | "done">("user");
  const [totpSecret] = useState(initialTotpSecret);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-8">
      <header className="mb-8">
        <p className="text-xs uppercase text-stone-500">Envelope setup</p>
        <h1 className="mt-2 text-4xl font-semibold text-balance">Bootstrap your instance</h1>
        <p className="mt-2 max-w-2xl text-stone-400 text-pretty">
          Create your local admin account with mandatory TOTP, then provide Gmail OAuth credentials.
        </p>
      </header>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200 text-pretty">
          {error}
        </div>
      ) : null}

      {status ? (
        <div className="mb-4 rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 text-pretty">
          {status}
        </div>
      ) : null}

      <section className="rounded-2xl border border-stone-800 bg-stone-900/80 p-5">
        {step === "user" ? (
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setStatus(null);

              const form = new FormData(event.currentTarget);
              const payload = {
                email: String(form.get("email") ?? ""),
                password: String(form.get("password") ?? ""),
                totpCode: String(form.get("totpCode") ?? ""),
                totpSecret,
              };

              const response = await fetch(
                "/api/setup/create-user",
                withCsrfHeaders({
                  method: "POST",
                  body: JSON.stringify(payload),
                }),
              );

              if (!response.ok) {
                const body = (await response.json()) as { error?: string };
                setError(body.error ?? "Failed to create user");
                return;
              }

              setStatus("User created. Configure Gmail OAuth credentials next.");
              setStep("gmail");
            }}
          >
            <h2 className="text-2xl font-medium text-balance">1. Create admin user</h2>

            <div className="grid gap-1">
              <label htmlFor="email" className="text-sm text-stone-300">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
                placeholder="you@example.com"
              />
            </div>

            <div className="grid gap-1">
              <label htmlFor="password" className="text-sm text-stone-300">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={12}
                className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
                placeholder="At least 12 characters"
              />
            </div>

            <div className="rounded-xl border border-stone-700 bg-stone-950 p-3">
              <p className="text-sm text-stone-300 text-pretty">
                Add this secret to your authenticator app and enter the current 6-digit code.
              </p>
              <p className="mt-2 font-mono text-sm text-amber-300 break-all">{totpSecret}</p>
              <p className="mt-2 text-xs text-stone-500 break-all">{otpAuthUri}</p>
            </div>

            <div className="grid gap-1">
              <label htmlFor="totpCode" className="text-sm text-stone-300">
                TOTP code
              </label>
              <input
                id="totpCode"
                name="totpCode"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
                className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 font-mono tabular-nums"
                placeholder="123456"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg border border-amber-500 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-200"
            >
              Create user
            </button>
          </form>
        ) : null}

        {step === "gmail" ? (
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setStatus(null);

              const form = new FormData(event.currentTarget);
              const payload = {
                clientId: String(form.get("clientId") ?? ""),
                clientSecret: String(form.get("clientSecret") ?? ""),
                redirectUri: String(form.get("redirectUri") ?? defaultRedirectUri),
              };

              const response = await fetch(
                "/api/setup/gmail-config",
                withCsrfHeaders({
                  method: "POST",
                  body: JSON.stringify(payload),
                }),
              );

              if (!response.ok) {
                const body = (await response.json()) as { error?: string };
                setError(body.error ?? "Failed to save Gmail config");
                return;
              }

              setStep("done");
              setStatus("Setup complete. Continue to inbox and connect Gmail account.");
            }}
          >
            <h2 className="text-2xl font-medium text-balance">2. Configure Gmail OAuth</h2>

            <div className="grid gap-1">
              <label htmlFor="clientId" className="text-sm text-stone-300">
                Google Client ID
              </label>
              <input
                id="clientId"
                name="clientId"
                required
                className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
              />
            </div>

            <div className="grid gap-1">
              <label htmlFor="clientSecret" className="text-sm text-stone-300">
                Google Client Secret
              </label>
              <input
                id="clientSecret"
                name="clientSecret"
                type="password"
                required
                className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
              />
            </div>

            <div className="grid gap-1">
              <label htmlFor="redirectUri" className="text-sm text-stone-300">
                Redirect URI
              </label>
              <input
                id="redirectUri"
                name="redirectUri"
                required
                defaultValue={defaultRedirectUri}
                className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 font-mono text-xs"
              />
            </div>

            <button
              type="submit"
              className="rounded-lg border border-amber-500 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-200"
            >
              Save Gmail config
            </button>
          </form>
        ) : null}

        {step === "done" ? (
          <div className="grid gap-4">
            <h2 className="text-2xl font-medium text-balance">Setup complete</h2>
            <p className="text-stone-300 text-pretty">
              Continue to inbox to connect your first Gmail account and start initial sync.
            </p>
            <Link
              href="/inbox"
              className="inline-flex w-fit rounded-lg border border-amber-500 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-200"
            >
              Open inbox
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
