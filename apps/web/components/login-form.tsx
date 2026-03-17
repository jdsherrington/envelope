"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  return (
    <form
      className="envelope-panel grid gap-4 rounded-2xl p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);

        const form = new FormData(event.currentTarget);
        const payload = {
          email: String(form.get("email") ?? ""),
          password: String(form.get("password") ?? ""),
          totpCode: String(form.get("totpCode") ?? ""),
        };

        const response = await fetch(
          "/api/auth/login",
          withCsrfHeaders({
            method: "POST",
            body: JSON.stringify(payload),
          }),
        );

        if (!response.ok) {
          const body = (await response.json()) as { error?: string };
          setError(body.error ?? "Failed to login");
          return;
        }

        window.location.href = "/inbox";
      }}
    >
      <h1 className="text-3xl font-semibold text-balance">Sign in</h1>
      <p className="envelope-text-muted text-pretty">Authenticate with password and TOTP.</p>

      {error ? (
        <div className="envelope-status-danger rounded-lg px-3 py-2 text-sm text-pretty">
          {error}
        </div>
      ) : null}

      <div className="grid gap-1">
        <label htmlFor="email" className="text-sm">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="envelope-input rounded-lg px-3 py-2"
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
          className="envelope-input rounded-lg px-3 py-2"
        />
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
        />
      </div>

      <button
        type="submit"
        className="envelope-button-accent rounded-lg px-4 py-2 text-sm font-medium"
      >
        Sign in
      </button>

      <button
        type="button"
        onClick={async () => {
          setError(null);
          if (!email) {
            setError("Enter your email to use passkey sign in");
            return;
          }

          try {
            const optionsResponse = await fetch("/api/auth/passkey/login/options", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email }),
            });

            if (!optionsResponse.ok) {
              const payload = (await optionsResponse.json()) as { error?: string };
              throw new Error(payload.error ?? "Failed to start passkey login");
            }

            const optionsPayload = (await optionsResponse.json()) as {
              options: Parameters<typeof startAuthentication>[0]["optionsJSON"];
            };

            const authenticationResponse = await startAuthentication({
              optionsJSON: optionsPayload.options,
            });

            const verifyResponse = await fetch(
              "/api/auth/passkey/login/verify",
              withCsrfHeaders({
                method: "POST",
                body: JSON.stringify({
                  email,
                  response: authenticationResponse,
                }),
              }),
            );

            if (!verifyResponse.ok) {
              const payload = (await verifyResponse.json()) as { error?: string };
              throw new Error(payload.error ?? "Passkey verification failed");
            }

            window.location.href = "/inbox";
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Passkey sign in failed");
          }
        }}
        className="envelope-button-secondary rounded-lg px-4 py-2 text-sm font-medium"
      >
        Sign in with passkey
      </button>
    </form>
  );
}
