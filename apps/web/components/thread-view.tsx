"use client";

import { useEffect, useState } from "react";
import { recordPerfEvent } from "@/lib/client/perf";

type ThreadViewMessage = {
  id: string;
  fromName: string | null;
  fromEmail: string;
  internalDate: string;
  snippet: string | null;
  textBody: string | null;
  htmlBody: string | null;
  bodyState: "deferred" | "present" | "failed";
  attachments: Array<{
    providerAttachmentId: string;
    filename: string;
    mimeType: string;
    sizeBytes?: number;
  }>;
};

export function ThreadView({
  accountId,
  initialMessages,
}: {
  accountId: string;
  initialMessages: ThreadViewMessage[];
}) {
  const [messages, setMessages] = useState(initialMessages);

  useEffect(() => {
    const startedAt = performance.now();
    let cancelled = false;
    let recordedUncached = false;

    const initialMissingCount = initialMessages.filter((message) => !message.textBody && !message.htmlBody).length;
    if (initialMissingCount === 0) {
      void recordPerfEvent({
        accountId,
        route: "/thread",
        metric: "thread_open_cached_ms",
        valueMs: performance.now() - startedAt,
      });
    }

    const loadBodies = async () => {
      for (const message of initialMessages) {
        if (message.textBody || message.htmlBody) {
          continue;
        }

        try {
          const response = await fetch(
            `/api/messages/${message.id}/body?accountId=${encodeURIComponent(accountId)}`,
          );

          if (!response.ok) {
            continue;
          }

          const payload = (await response.json()) as {
            textBody?: string | null;
            htmlBody?: string | null;
          };

          if (cancelled) {
            return;
          }

          setMessages((current) =>
            current.map((entry) =>
              entry.id === message.id
                  ? {
                      ...entry,
                      textBody: payload.textBody ?? null,
                      htmlBody: payload.htmlBody ?? null,
                      bodyState: "present",
                    }
                : entry,
            ),
          );
          if (!recordedUncached) {
            recordedUncached = true;
            void recordPerfEvent({
              accountId,
              route: "/thread",
              metric: "thread_open_uncached_ms",
              valueMs: performance.now() - startedAt,
              metadata: {
                messageId: message.id,
              },
            });
          }
        } catch {
          if (cancelled) {
            return;
          }
          setMessages((current) =>
            current.map((entry) =>
              entry.id === message.id
                ? {
                    ...entry,
                    bodyState: "failed",
                  }
                : entry,
            ),
          );
        }
      }

      if (initialMissingCount > 0 && !recordedUncached) {
        recordedUncached = true;
        void recordPerfEvent({
          accountId,
          route: "/thread",
          metric: "thread_open_uncached_ms",
          valueMs: performance.now() - startedAt,
          metadata: {
            status: "fallback_only",
          },
        });
      }
    };

    void loadBodies();

    return () => {
      cancelled = true;
    };
  }, [accountId, initialMessages]);

  return (
    <div className="mt-4 grid gap-4">
      {messages.map((message) => (
        <article key={message.id} className="envelope-panel rounded-2xl p-4">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="envelope-text-muted text-sm">
              From: {message.fromName ? `${message.fromName} <${message.fromEmail}>` : message.fromEmail}
            </p>
            <time className="envelope-text-soft text-xs tabular-nums">
              {new Date(message.internalDate).toLocaleString()}
            </time>
          </header>

          {message.htmlBody ? (
            <div
              className="envelope-mail-preview max-w-none text-pretty text-sm"
              dangerouslySetInnerHTML={{ __html: message.htmlBody }}
            />
          ) : (
            <div className="grid gap-2">
              <pre className="whitespace-pre-wrap font-sans text-sm text-pretty">
                {message.textBody ?? message.snippet ?? "(empty)"}
              </pre>
              {message.bodyState === "failed" ? (
                <p className="text-[var(--color-warning-fg)] text-xs">
                  Full body fetch failed for this message. Showing available fallback content.
                </p>
              ) : null}
              {message.bodyState === "deferred" ? (
                <p className="envelope-text-muted text-xs">Loading full message body…</p>
              ) : null}
            </div>
          )}

          {message.attachments.length > 0 ? (
            <div className="envelope-divider mt-4 border-t pt-3">
              <p className="envelope-text-soft mb-2 text-xs uppercase">Attachments</p>
              <ul className="grid gap-2">
                {message.attachments.map((attachment) => (
                  <li key={attachment.providerAttachmentId}>
                    <a
                      href={`/api/messages/${message.id}/attachments/${attachment.providerAttachmentId}?accountId=${encodeURIComponent(accountId)}`}
                      className="envelope-button-secondary inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs"
                    >
                      <span>{attachment.filename}</span>
                      <span className="envelope-text-soft">{attachment.mimeType}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
