"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/client/cn";
import { formatPreviewDate, formatStablePreviewDate, useHydrated } from "@/lib/client/date-time";

type ThreadSummary = {
  id: string;
  subject: string;
  snippet: string;
  lastMessageAt: string;
  providerLabelIds: string[];
  senderName: string | null;
  senderEmail: string | null;
};

type PreviewThread = {
  id: string;
  providerThreadId: string;
  subject: string;
  snippet: string;
  lastMessageAt: string;
  unreadCount: number;
  providerLabelIds: string[];
};

type PreviewMessage = {
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

type PreviewPayload = {
  thread: PreviewThread;
  messages: PreviewMessage[];
};

type InboxPreviewPaneProps = {
  accountId: string | null;
  threadId: string | null;
  summaryThread: ThreadSummary | null;
  id?: string;
  className?: string;
};

const previewCache = new Map<string, PreviewPayload>();
const previewRequests = new Map<string, Promise<PreviewPayload>>();

const getPreviewCacheKey = (accountId: string, threadId: string): string => `${accountId}:${threadId}`;

const fetchPreviewPayload = async (accountId: string, threadId: string): Promise<PreviewPayload> => {
  const cacheKey = getPreviewCacheKey(accountId, threadId);
  const cached = previewCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = previewRequests.get(cacheKey);
  if (pending) {
    return pending;
  }

  const request = (async () => {
    const response = await fetch(`/api/thread/${threadId}?accountId=${encodeURIComponent(accountId)}`);

    if (!response.ok) {
      throw new Error("Unable to load thread preview");
    }

    const payload = (await response.json()) as PreviewPayload;
    const latestMessage = payload.messages.at(-1);

    if (
      latestMessage &&
      !latestMessage.textBody &&
      !latestMessage.htmlBody &&
      latestMessage.bodyState !== "failed"
    ) {
      try {
        const bodyResponse = await fetch(
          `/api/messages/${latestMessage.id}/body?accountId=${encodeURIComponent(accountId)}`,
        );

        if (bodyResponse.ok) {
          const bodyPayload = (await bodyResponse.json()) as {
            bodyState: PreviewMessage["bodyState"];
            textBody?: string | null;
            htmlBody?: string | null;
          };

          payload.messages = payload.messages.map((message) =>
            message.id === latestMessage.id
              ? {
                  ...message,
                  bodyState: bodyPayload.bodyState,
                  textBody: bodyPayload.textBody ?? null,
                  htmlBody: bodyPayload.htmlBody ?? null,
                }
              : message,
          );
        }
      } catch {
        // Keep the cached summary payload if the body warmup fails.
      }
    }

    previewCache.set(cacheKey, payload);
    return payload;
  })();

  previewRequests.set(cacheKey, request);

  try {
    return await request;
  } finally {
    previewRequests.delete(cacheKey);
  }
};

export const peekThreadPreview = (
  accountId: string | null,
  threadId: string | null,
): PreviewPayload | null => {
  if (!accountId || !threadId) {
    return null;
  }

  return previewCache.get(getPreviewCacheKey(accountId, threadId)) ?? null;
};

export const warmThreadPreview = (accountId: string | null, threadId: string | null): void => {
  if (!accountId || !threadId) {
    return;
  }

  void fetchPreviewPayload(accountId, threadId).catch(() => {
    // Warmup is best-effort; interactive fetches will surface actual errors.
  });
};

const prettyLabel = (labelId: string): string =>
  labelId
    .replace(/^CATEGORY_/, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/(^|\s)\w/g, (char) => char.toUpperCase());

const formatSender = (name: string | null | undefined, email: string | null | undefined): string => {
  if (name?.trim()) {
    return name;
  }

  if (!email) {
    return "Unknown sender";
  }

  return email.split("@")[0] ?? email;
};

export function InboxPreviewPane({
  accountId,
  threadId,
  summaryThread,
  id,
  className,
}: InboxPreviewPaneProps) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hydrated = useHydrated();

  useEffect(() => {
    if (!accountId || !threadId) {
      setPreview(null);
      setIsLoading(false);
      setErrorMessage(null);
      return;
    }

    let cancelled = false;
    const cached = peekThreadPreview(accountId, threadId);

    if (cached) {
      setPreview(cached);
      setIsLoading(false);
      setErrorMessage(null);
      return () => {
        cancelled = true;
      };
    }

    const loadPreview = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      setPreview(null);

      try {
        const payload = await fetchPreviewPayload(accountId, threadId);

        if (!cancelled) {
          setPreview(payload);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Unable to load thread preview");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPreview();

    return () => {
      cancelled = true;
    };
  }, [accountId, threadId]);

  if (!threadId || !summaryThread) {
    return (
      <aside
        id={id}
        className={cn(
          "envelope-panel flex min-h-[18rem] flex-col rounded-lg p-6 lg:min-h-0",
          className,
        )}
      >
        <p className="envelope-text-soft text-xs font-medium uppercase">Reading Pane</p>
        <h2 className="mt-3 text-2xl font-semibold text-balance">Select a thread to preview it here.</h2>
        <p className="envelope-text-muted mt-3 max-w-sm text-sm">
          Envelope keeps the inbox list dense and the reading pane focused. Choose a conversation,
          then open the full thread when you need the deeper timeline.
        </p>
      </aside>
    );
  }

  const thread = preview?.thread ?? null;
  const latestMessage = preview?.messages.at(-1) ?? null;
  const activeLabels = (thread?.providerLabelIds ?? summaryThread.providerLabelIds).slice(0, 4);
  const senderName = latestMessage?.fromName ?? summaryThread.senderName;
  const senderEmail = latestMessage?.fromEmail ?? summaryThread.senderEmail;
  const subject = thread?.subject ?? summaryThread.subject;
  const snippet = thread?.snippet ?? summaryThread.snippet;
  const previewDateValue = latestMessage?.internalDate ?? summaryThread.lastMessageAt;
  const previewDate = previewDateValue
    ? hydrated
      ? formatPreviewDate(previewDateValue)
      : formatStablePreviewDate(previewDateValue)
    : "";
  const hasRenderableBody = Boolean(latestMessage?.htmlBody || latestMessage?.textBody);

  return (
    <aside
      id={id}
      className={cn(
        "envelope-panel flex min-h-[24rem] flex-col overflow-hidden rounded-lg lg:min-h-0",
        className,
      )}
      aria-busy={isLoading}
    >
      <div className="envelope-panel-muted envelope-divider border-b px-5 py-5">
        <p className="envelope-text-soft text-xs font-medium uppercase">Selected Thread</p>
        <h2 className="mt-3 text-[1.95rem] font-semibold leading-tight text-balance">{subject}</h2>
        <p className="envelope-text-muted mt-3 text-sm">{snippet}</p>

        {activeLabels.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {activeLabels.map((labelId) => (
              <span key={labelId} className="envelope-pill rounded-lg px-2.5 py-1 text-[11px] font-medium">
                {prettyLabel(labelId)}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/thread/${threadId}?accountId=${accountId}`}
            className="envelope-button-secondary rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Open Thread
          </Link>
          {latestMessage ? (
            <Link
              href={`/compose?accountId=${accountId}&mode=reply&threadId=${threadId}&messageId=${latestMessage.id}`}
              className="envelope-button-accent rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Reply
            </Link>
          ) : null}
          {latestMessage ? (
            <Link
              href={`/compose?accountId=${accountId}&mode=forward&threadId=${threadId}&messageId=${latestMessage.id}`}
              className="envelope-button-secondary rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
            >
              Forward
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="envelope-avatar flex size-11 shrink-0 items-center justify-center rounded-lg text-sm font-semibold">
            {formatSender(senderName, senderEmail).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="truncate text-sm font-semibold">{formatSender(senderName, senderEmail)}</p>
              {previewDate ? <time className="envelope-text-muted text-xs tabular-nums">{previewDate}</time> : null}
            </div>
            {senderEmail ? <p className="envelope-text-muted truncate text-xs">{senderEmail}</p> : null}
            {preview?.messages.length ? (
              <p className="envelope-text-soft mt-2 text-xs">
                Latest message of {preview.messages.length} in this conversation
              </p>
            ) : null}
          </div>
        </div>

        {isLoading ? (
          <div className="mt-6 space-y-3" aria-hidden>
            <div className="envelope-skeleton h-4 w-5/6 rounded-lg" />
            <div className="envelope-skeleton h-4 w-full rounded-lg" />
            <div className="envelope-skeleton h-4 w-4/5 rounded-lg" />
            <div className="envelope-skeleton h-40 rounded-lg" />
          </div>
        ) : null}

        {errorMessage ? (
          <div
            className="envelope-status-danger mt-6 rounded-lg px-4 py-3 text-sm text-pretty"
            role="status"
            aria-live="polite"
          >
            {errorMessage}
          </div>
        ) : null}

        {!isLoading && !errorMessage ? (
          <div className="mt-6">
            {!latestMessage ? (
              <div className="envelope-panel-muted envelope-text-muted rounded-lg px-4 py-3 text-sm" role="status" aria-live="polite">
                No message body is available for this thread yet. Open the full thread for the
                complete timeline.
              </div>
            ) : hasRenderableBody ? (
              latestMessage?.htmlBody ? (
                <div
                  className="envelope-mail-preview text-sm"
                  dangerouslySetInnerHTML={{ __html: latestMessage.htmlBody }}
                />
              ) : (
                <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-pretty">
                  {latestMessage?.textBody ?? snippet}
                </pre>
              )
            ) : latestMessage?.bodyState === "failed" ? (
              <div className="envelope-panel-muted envelope-text-muted rounded-lg px-4 py-3 text-sm" role="status" aria-live="polite">
                Message body could not be loaded. Showing the available thread summary above instead.
              </div>
            ) : (
              <div className="envelope-panel-muted envelope-text-muted rounded-lg px-4 py-3 text-sm" role="status" aria-live="polite">
                Loading the latest message body…
              </div>
            )}

            {latestMessage?.attachments.length ? (
              <div className="envelope-divider mt-6 border-t pt-4">
                <p className="envelope-text-soft text-xs font-medium uppercase">Attachments</p>
                <ul className="mt-3 grid gap-2">
                  {latestMessage.attachments.map((attachment) => (
                    <li key={attachment.providerAttachmentId}>
                      <a
                        href={`/api/messages/${latestMessage.id}/attachments/${attachment.providerAttachmentId}?accountId=${encodeURIComponent(accountId ?? "")}`}
                        className="envelope-button-secondary flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors"
                      >
                        <span className="truncate">{attachment.filename}</span>
                        <span className="envelope-text-muted ml-3 shrink-0 text-xs">{attachment.mimeType}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
