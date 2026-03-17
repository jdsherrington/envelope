"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";
import { recordPerfEvent } from "@/lib/client/perf";

type Snippet = {
  id: string;
  title: string;
  body: string;
};

const stripHtml = (raw: string): string => raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const toLocalDateTimeInput = (iso: string): string => {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export function ComposeForm({
  accountId,
  snippets,
  templates,
  initialDraft,
}: {
  accountId: string;
  snippets: Snippet[];
  templates: Snippet[];
  initialDraft?: {
    to: string;
    subject: string;
    textBody: string;
    htmlBody: string;
  };
}) {
  const [to, setTo] = useState(initialDraft?.to ?? "");
  const [subject, setSubject] = useState(initialDraft?.subject ?? "");
  const [textBody, setTextBody] = useState(initialDraft?.textBody ?? "");
  const [htmlBody, setHtmlBody] = useState(initialDraft?.htmlBody ?? "");
  const [isRich, setIsRich] = useState(Boolean(initialDraft?.htmlBody));
  const [sendAt, setSendAt] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoState, setUndoState] = useState<
    | {
        undoToken: string;
        expiresAt: number;
      }
    | null
  >(null);

  const richRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!undoState) {
      return;
    }

    const timeout = setTimeout(() => {
      setUndoState(null);
    }, Math.max(undoState.expiresAt - Date.now(), 0));

    return () => clearTimeout(timeout);
  }, [undoState]);

  const snippetMap = useMemo(
    () => Object.fromEntries(snippets.map((snippet) => [snippet.id, snippet.body])),
    [snippets],
  );
  const templateMap = useMemo(
    () => Object.fromEntries(templates.map((template) => [template.id, template.body])),
    [templates],
  );

  const buildMessage = useCallback(() => {
    const currentHtml = isRich ? htmlBody : undefined;
    const currentText = isRich ? stripHtml(htmlBody) || textBody : textBody;

    return {
      to: to
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((email) => ({ email })),
      subject,
      textBody: currentText,
      htmlBody: currentHtml,
    };
  }, [htmlBody, isRich, subject, textBody, to]);

  const submit = useCallback(
    async (endpoint: string, payload: Record<string, unknown>) => {
      const startedAt = performance.now();
      const response = await fetch(
        endpoint,
        withCsrfHeaders({
          method: "POST",
          body: JSON.stringify(payload),
        }),
      );

      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? `Request failed (${response.status})`);
      }

      void recordPerfEvent({
        accountId,
        route: "/compose",
        metric: "action_latency_ms",
        valueMs: performance.now() - startedAt,
        metadata: {
          endpoint,
        },
      });

      return (await response.json()) as { jobId?: string; undoToken?: string; undoExpiresAt?: string };
    },
    [accountId],
  );

  const appendBodyContent = useCallback(
    (content: string) => {
      if (isRich) {
        setHtmlBody((current) => {
          const next = `${current}${current ? "<br><br>" : ""}${content.replace(/\n/g, "<br>")}`;
          if (richRef.current) {
            richRef.current.innerHTML = next;
          }
          return next;
        });
        return;
      }

      setTextBody((current) => `${current}${current ? "\n\n" : ""}${content}`);
    },
    [isRich],
  );

  const runUndoSend = useCallback(async () => {
    if (!undoState) {
      setError("No pending send to cancel");
      return;
    }

    try {
      await submit("/api/actions/send/undo", {
        accountId,
        undoToken: undoState.undoToken,
      });
      setUndoState(null);
      setStatus("Send cancelled");
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to undo send");
    }
  }, [accountId, submit, undoState]);

  const runSend = useCallback(async () => {
    setError(null);
    setStatus(null);

    try {
      const mutationId = crypto.randomUUID();
      const result = await submit("/api/actions/send", {
        accountId,
        clientMutationId: mutationId,
        message: buildMessage(),
      });

      if (result.undoToken && result.undoExpiresAt) {
        setUndoState({
          undoToken: result.undoToken,
          expiresAt: new Date(result.undoExpiresAt).getTime(),
        });
      }

      setStatus(result.jobId ? `Queued send job ${result.jobId}` : "Queued send");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to send");
    }
  }, [accountId, buildMessage, submit]);

  const runSaveDraft = useCallback(async () => {
    setError(null);
    setStatus(null);

    try {
      const draftId = crypto.randomUUID();
      const result = await submit("/api/actions/draft/create", {
        accountId,
        draftId,
        draft: buildMessage(),
      });
      setStatus(result.jobId ? `Queued draft job ${result.jobId}` : "Draft queued");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to save draft");
    }
  }, [accountId, buildMessage, submit]);

  const runSendLater = useCallback(
    async (sendAtOverride?: string) => {
      setError(null);
      setStatus(null);

      const sendAtIso = sendAtOverride ?? (sendAt ? new Date(sendAt).toISOString() : "");
      if (!sendAtIso) {
        setError("Pick a send later time first");
        return;
      }

      try {
        const result = await submit("/api/actions/send-later", {
          accountId,
          clientMutationId: crypto.randomUUID(),
          sendAt: sendAtIso,
          message: buildMessage(),
        });
        setStatus(result.jobId ? `Scheduled job ${result.jobId}` : "Scheduled send");
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Failed to schedule send");
      }
    },
    [accountId, buildMessage, sendAt, submit],
  );

  useEffect(() => {
    const onSend = () => {
      void runSend();
    };
    const onSaveDraft = () => {
      void runSaveDraft();
    };
    const onSendLater = (event: Event) => {
      const detail = (event as CustomEvent<{ sendAt?: string }>).detail;
      const sendAtValue = detail?.sendAt;
      if (sendAtValue) {
        setSendAt(toLocalDateTimeInput(sendAtValue));
      }
      void runSendLater(sendAtValue);
    };
    const onUndoSend = () => {
      void runUndoSend();
    };
    const onInsertSnippet = (event: Event) => {
      const detail = (event as CustomEvent<{ body?: string }>).detail;
      if (detail?.body) {
        appendBodyContent(detail.body);
      }
    };
    const onInsertTemplate = (event: Event) => {
      const detail = (event as CustomEvent<{ body?: string }>).detail;
      if (detail?.body) {
        appendBodyContent(detail.body);
      }
    };

    window.addEventListener("envelope:compose:send", onSend);
    window.addEventListener("envelope:compose:save-draft", onSaveDraft);
    window.addEventListener("envelope:compose:send-later", onSendLater as EventListener);
    window.addEventListener("envelope:compose:undo-send", onUndoSend);
    window.addEventListener("envelope:compose:insert-snippet", onInsertSnippet as EventListener);
    window.addEventListener("envelope:compose:insert-template", onInsertTemplate as EventListener);

    return () => {
      window.removeEventListener("envelope:compose:send", onSend);
      window.removeEventListener("envelope:compose:save-draft", onSaveDraft);
      window.removeEventListener("envelope:compose:send-later", onSendLater as EventListener);
      window.removeEventListener("envelope:compose:undo-send", onUndoSend);
      window.removeEventListener("envelope:compose:insert-snippet", onInsertSnippet as EventListener);
      window.removeEventListener("envelope:compose:insert-template", onInsertTemplate as EventListener);
    };
  }, [appendBodyContent, runSaveDraft, runSend, runSendLater, runUndoSend]);

  return (
    <section className="envelope-panel rounded-2xl p-5">
      <h1 className="text-2xl font-semibold text-balance">Compose</h1>
      <p className="envelope-text-muted mt-1 text-sm">Draft, send now, or schedule delivery.</p>

      {status ? (
        <p className="envelope-status-success mt-3 rounded-lg px-3 py-2 text-sm">
          {status}
        </p>
      ) : null}

      {error ? (
        <p className="envelope-status-danger mt-3 rounded-lg px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {undoState ? (
        <div className="envelope-status-warning mt-3 flex items-center gap-3 rounded-lg px-3 py-2 text-sm">
          <span>
            Send queued. Undo available for {Math.max(0, Math.ceil((undoState.expiresAt - Date.now()) / 1000))}s.
          </span>
          <button
            type="button"
            onClick={() => {
              void runUndoSend();
            }}
            className="envelope-button-accent rounded px-2 py-1 text-xs uppercase"
          >
            Undo send
          </button>
        </div>
      ) : null}

      <form
        className="mt-4 grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          await runSend();
        }}
      >
        <label className="grid gap-1 text-sm">
          <span>To</span>
          <input
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="alice@example.com, bob@example.com"
            className="envelope-input rounded-lg px-3 py-2"
            required
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span>Subject</span>
          <input
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="envelope-input rounded-lg px-3 py-2"
            required
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="snippet" className="envelope-text-muted text-sm">
            Insert snippet
          </label>
          <select
            id="snippet"
            onChange={(event) => {
              const selected = snippetMap[event.target.value];
              if (!selected) {
                return;
              }
              appendBodyContent(selected);
            }}
            className="envelope-input rounded-lg px-2 py-1 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Choose snippet
            </option>
            {snippets.map((snippet) => (
              <option key={snippet.id} value={snippet.id}>
                {snippet.title}
              </option>
            ))}
          </select>

          <label htmlFor="template" className="envelope-text-muted text-sm">
            Insert template
          </label>
          <select
            id="template"
            onChange={(event) => {
              const selected = templateMap[event.target.value];
              if (!selected) {
                return;
              }
              appendBodyContent(selected);
            }}
            className="envelope-input rounded-lg px-2 py-1 text-sm"
            defaultValue=""
          >
            <option value="" disabled>
              Choose template
            </option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setIsRich((current) => !current);
            }}
            className="envelope-button-secondary rounded-lg px-3 py-1 text-xs uppercase"
          >
            {isRich ? "Plain text" : "Rich text"}
          </button>
        </div>

        <label className="grid gap-1 text-sm">
          <span>Body</span>
          {isRich ? (
            <div
              ref={richRef}
              contentEditable
              suppressContentEditableWarning
              onInput={(event) => {
                setHtmlBody((event.currentTarget as HTMLDivElement).innerHTML);
              }}
              className="envelope-input min-h-64 rounded-lg px-3 py-2"
              dangerouslySetInnerHTML={{ __html: htmlBody }}
            />
          ) : (
            <textarea
              value={textBody}
              onChange={(event) => setTextBody(event.target.value)}
              rows={12}
              className="envelope-input rounded-lg px-3 py-2"
            />
          )}
        </label>

        <label className="grid gap-1 text-sm">
          <span>Send later (optional)</span>
          <input
            type="datetime-local"
            value={sendAt}
            onChange={(event) => setSendAt(event.target.value)}
            className="envelope-input w-fit rounded-lg px-3 py-2"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="envelope-button-accent rounded-lg px-4 py-2 text-sm font-medium"
          >
            Send
          </button>

          <button
            type="button"
            onClick={() => {
              void runSaveDraft();
            }}
            className="envelope-button-secondary rounded-lg px-4 py-2 text-sm"
          >
            Save draft
          </button>

          <button
            type="button"
            onClick={() => {
              void runSendLater();
            }}
            className="envelope-button-secondary rounded-lg px-4 py-2 text-sm"
          >
            Send later
          </button>
        </div>
      </form>
    </section>
  );
}
