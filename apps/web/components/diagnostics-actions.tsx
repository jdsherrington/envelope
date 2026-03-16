"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";

type MutationButtonProps = {
  label: string;
  endpoint: string;
  body?: Record<string, unknown>;
  variant?: "default" | "danger";
  onDone?: () => void;
};

function MutationButton({ label, endpoint, body, variant = "default", onDone }: MutationButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-1">
      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            const response = await fetch(
              endpoint,
              withCsrfHeaders({
                method: "POST",
                body: body ? JSON.stringify(body) : undefined,
              }),
            );
            if (!response.ok) {
              const payload = (await response.json()) as { error?: string };
              throw new Error(payload.error ?? `Failed (${response.status})`);
            }
            onDone?.();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Request failed");
          } finally {
            setLoading(false);
          }
        }}
        className={
          variant === "danger"
            ? "rounded-lg border border-red-500/60 bg-red-500/10 px-2 py-1 text-xs text-red-200"
            : "rounded-lg border border-stone-700 bg-stone-900 px-2 py-1 text-xs text-stone-200"
        }
      >
        {loading ? "Working..." : label}
      </button>
      {error ? <p className="text-[11px] text-red-300">{error}</p> : null}
    </div>
  );
}

export function AccountActionButtons({
  accountId,
  status,
}: {
  accountId: string;
  status: "ok" | "syncing" | "rate_limited" | "needs_reauth" | "error";
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {(status === "needs_reauth" || status === "error") && (
        <MutationButton label="Reconnect" endpoint={`/api/accounts/${accountId}/reconnect`} />
      )}
      {status === "rate_limited" && (
        <MutationButton
          label="Retry sync"
          endpoint="/api/sync/refresh"
          body={{ accountId }}
        />
      )}
      <MutationButton
        label="Remove Account"
        endpoint={`/api/accounts/${accountId}/remove`}
        variant="danger"
      />
    </div>
  );
}

export function RetryJobButton({ accountId, jobId }: { accountId: string; jobId: string }) {
  return (
    <MutationButton
      label="Retry"
      endpoint={`/api/diagnostics/jobs/${jobId}/retry`}
      body={{ accountId }}
    />
  );
}

export function RegisterPasskeyButton() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  return (
    <div className="grid gap-1">
      <button
        type="button"
        onClick={async () => {
          setError(null);
          setStatus(null);

          try {
            const optionsResponse = await fetch(
              "/api/auth/passkey/register/options",
              withCsrfHeaders({ method: "POST" }),
            );
            if (!optionsResponse.ok) {
              const payload = (await optionsResponse.json()) as { error?: string };
              throw new Error(payload.error ?? "Failed to create registration options");
            }

            const optionsPayload = (await optionsResponse.json()) as {
              options: Parameters<typeof startRegistration>[0]["optionsJSON"];
            };

            const registrationResponse = await startRegistration({
              optionsJSON: optionsPayload.options,
            });

            const verifyResponse = await fetch(
              "/api/auth/passkey/register/verify",
              withCsrfHeaders({
                method: "POST",
                body: JSON.stringify({ response: registrationResponse }),
              }),
            );

            if (!verifyResponse.ok) {
              const payload = (await verifyResponse.json()) as { error?: string };
              throw new Error(payload.error ?? "Failed to verify passkey registration");
            }

            setStatus("Passkey registered");
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Passkey registration failed");
          }
        }}
        className="rounded-lg border border-stone-700 bg-stone-900 px-2 py-1 text-xs text-stone-200"
      >
        Register Passkey
      </button>
      {status ? <p className="text-[11px] text-emerald-300">{status}</p> : null}
      {error ? <p className="text-[11px] text-red-300">{error}</p> : null}
    </div>
  );
}
