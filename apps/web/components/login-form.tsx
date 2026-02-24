"use client";

import { useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-4 rounded-2xl border border-stone-800 bg-stone-900/80 p-5"
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
      <p className="text-stone-400 text-pretty">Authenticate with password and TOTP.</p>

      {error ? (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-200 text-pretty">
          {error}
        </div>
      ) : null}

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
          className="rounded-lg border border-stone-700 bg-stone-950 px-3 py-2"
        />
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
        />
      </div>

      <button
        type="submit"
        className="rounded-lg border border-amber-500 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-200"
      >
        Sign in
      </button>
    </form>
  );
}
