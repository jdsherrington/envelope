"use client";

import { useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";

export function ConnectGmailButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-2">
      <button
        type="button"
        onClick={async () => {
          setIsLoading(true);
          setError(null);

          try {
            const response = await fetch(
              "/api/accounts/gmail/start",
              withCsrfHeaders({ method: "POST" }),
            );

            if (!response.ok) {
              const payload = (await response.json()) as { error?: string };
              throw new Error(payload.error ?? "Failed to start OAuth");
            }

            const payload = (await response.json()) as { authUrl: string };
            window.location.href = payload.authUrl;
          } catch (error) {
            setError(error instanceof Error ? error.message : "Failed to start OAuth");
            setIsLoading(false);
          }
        }}
        className="envelope-button-accent inline-flex w-fit rounded-lg px-4 py-2 text-sm font-medium"
      >
        {isLoading ? "Redirecting..." : "Connect with Google"}
      </button>
      {error ? (
        <p className="text-[var(--color-danger-fg)] text-sm text-pretty" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
