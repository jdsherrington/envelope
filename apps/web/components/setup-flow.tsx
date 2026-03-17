"use client";

import Link from "next/link";
import { useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";

type SetupFlowProps = {
  initialTotpSecret: string;
  otpAuthUri: string;
  defaultRedirectUri: string;
  initialStep?: "user" | "gmail";
};

export function SetupFlow({
  initialTotpSecret,
  otpAuthUri,
  defaultRedirectUri,
  initialStep = "user",
}: SetupFlowProps) {
  const [step, setStep] = useState<"user" | "gmail" | "done">(initialStep);
  const [totpSecret] = useState(initialTotpSecret);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isGmailOnlyFlow = initialStep === "gmail";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-8">
      <header className="mb-8">
        <p className="envelope-text-soft text-xs uppercase">Envelope setup</p>
        <h1 className="mt-2 text-4xl font-semibold text-balance">
          {isGmailOnlyFlow ? "Finish Gmail setup" : "Bootstrap your instance"}
        </h1>
        <p className="envelope-text-muted mt-2 max-w-2xl text-pretty">
          {isGmailOnlyFlow
            ? "Your admin account already exists. Add Gmail OAuth credentials so Envelope can connect to Gmail."
            : "Create your local admin account with mandatory TOTP, then provide Gmail OAuth credentials."}
        </p>
      </header>

      {error ? (
        <div className="envelope-status-danger mb-4 rounded-xl px-4 py-3 text-sm text-pretty">
          {error}
        </div>
      ) : null}

      {status ? (
        <div className="envelope-status-success mb-4 rounded-xl px-4 py-3 text-sm text-pretty">
          {status}
        </div>
      ) : null}

      <section className="envelope-panel rounded-2xl p-5">
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
              <label htmlFor="email" className="text-sm">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="envelope-input rounded-lg px-3 py-2"
                placeholder="you@example.com"
              />
            </div>

            <div className="grid gap-1">
              <label htmlFor="password" className="text-sm">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                className="envelope-input rounded-lg px-3 py-2"
                placeholder="At least 8 characters"
              />
            </div>

            <div className="envelope-panel-strong rounded-xl p-3">
              <p className="text-sm text-pretty">
                Add this secret to your authenticator app and enter the current 6-digit code.
              </p>
              <p className="mt-2 font-mono text-[var(--color-accent)] text-sm break-all">{totpSecret}</p>
              <p className="envelope-text-soft mt-2 text-xs break-all">{otpAuthUri}</p>
            </div>

            <div className="grid gap-1">
              <label htmlFor="totpCode" className="text-sm">
                TOTP code
              </label>
              <input
                id="totpCode"
                name="totpCode"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
                className="envelope-input rounded-lg px-3 py-2 font-mono tabular-nums"
                placeholder="123456"
              />
            </div>

            <button
              type="submit"
              className="envelope-button-accent rounded-lg px-4 py-2 text-sm font-medium"
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
            <h2 className="text-2xl font-medium text-balance">
              {isGmailOnlyFlow ? "Configure Gmail OAuth" : "2. Configure Gmail OAuth"}
            </h2>
            <div className="envelope-panel-strong rounded-xl p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em]">
                How to get these values
              </h3>
              <ol className="mt-3 grid gap-2 text-sm">
                <li>
                  1. Open{" "}
                  <Link
                    href="https://console.cloud.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="envelope-link underline underline-offset-4"
                  >
                    Google Cloud Console
                  </Link>{" "}
                  and choose or create a project for Envelope.
                </li>
                <li>2. Enable the Gmail API for that project.</li>
                <li>3. Configure the OAuth consent screen if Google asks for it.</li>
                <li>4. Create an OAuth client ID for a Web application.</li>
                <li>5. Add the redirect URI shown below to the client configuration.</li>
                <li>6. Copy the generated client ID and client secret into this form.</li>
              </ol>
              <p className="envelope-text-soft mt-3 text-xs text-pretty">
                Use the same host here and in Google Cloud. If they do not match exactly, Gmail
                connect will fail on callback.
              </p>
            </div>

            <div className="grid gap-1">
              <label htmlFor="clientId" className="text-sm">
                Google Client ID
              </label>
              <input
                id="clientId"
                name="clientId"
                required
                className="envelope-input rounded-lg px-3 py-2"
              />
            </div>

            <div className="grid gap-1">
              <label htmlFor="clientSecret" className="text-sm">
                Google Client Secret
              </label>
              <input
                id="clientSecret"
                name="clientSecret"
                type="password"
                required
                className="envelope-input rounded-lg px-3 py-2"
              />
            </div>

            <div className="grid gap-1">
              <label htmlFor="redirectUri" className="text-sm">
                Redirect URI
              </label>
              <input
                id="redirectUri"
                name="redirectUri"
                required
                defaultValue={defaultRedirectUri}
                className="envelope-input rounded-lg px-3 py-2 font-mono text-xs"
              />
              <p className="envelope-text-soft text-xs text-pretty">
                Paste this exact URI into the Authorized redirect URIs field for your Google OAuth
                client.
              </p>
            </div>

            <button
              type="submit"
              className="envelope-button-accent rounded-lg px-4 py-2 text-sm font-medium"
            >
              Save Gmail config
            </button>
          </form>
        ) : null}

        {step === "done" ? (
          <div className="grid gap-4">
            <h2 className="text-2xl font-medium text-balance">Setup complete</h2>
            <p className="text-pretty">
              Continue to inbox to connect your first Gmail account and start initial sync.
            </p>
            <Link
              href="/inbox"
              className="envelope-button-accent inline-flex w-fit rounded-lg px-4 py-2 text-sm font-medium"
            >
              Open inbox
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
