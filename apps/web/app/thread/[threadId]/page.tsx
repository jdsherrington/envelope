import Link from "next/link";
import { notFound } from "next/navigation";
import { appRepository } from "@envelope/db";
import { AppCommandShell } from "@/components/app-command-shell";
import { RoutePerfMarker } from "@/components/route-perf-marker";
import { ThreadView } from "@/components/thread-view";
import { cn } from "@/lib/client/cn";
import { requirePageUser } from "@/lib/server/page-auth";
import { sanitizeHtml } from "@/lib/server/sanitize-html";

export const dynamic = "force-dynamic";

type ThreadPageProps = {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<{ accountId?: string }>;
};

export default async function ThreadPage({ params, searchParams }: ThreadPageProps) {
  const { user } = await requirePageUser();
  const { threadId } = await params;
  const { accountId } = await searchParams;

  if (!accountId) {
    notFound();
  }

  const account = await appRepository.getAccountById(accountId);
  if (!account || account.userId !== user.id) {
    notFound();
  }

  const settings = await appRepository.getUserSettings(user.id);

  const thread = await appRepository.getThreadById(threadId, accountId);
  if (!thread) {
    notFound();
  }

  const missingBodies = thread.messages.some((message) => !message.textBody && !message.htmlBody);
  if (missingBodies) {
    await appRepository.enqueueJob({
      accountId,
      type: "gmail.prefetchThreadBodies",
      payload: { providerThreadIds: [thread.thread.providerThreadId] },
      idempotencyKey: `prefetch-thread-bodies:${accountId}:${thread.thread.providerThreadId}`,
    });
  }

  const latestMessage = thread.messages.at(-1);

  return (
    <main
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-6",
        settings.contrast === "high" ? "envelope-contrast-high" : "",
      )}
    >
      <RoutePerfMarker route="/thread" accountId={accountId} />
      <Link href={`/inbox?accountId=${accountId}`} className="mb-4 text-sm text-amber-300">
        Back to inbox
      </Link>

      <section className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4">
        <h1 className="text-2xl font-semibold text-balance">{thread.thread.subject}</h1>
        <p className="mt-2 text-sm text-stone-400 text-pretty">{thread.thread.snippet}</p>
        {thread.thread.providerLabelIds.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1">
            {thread.thread.providerLabelIds.slice(0, 8).map((labelId) => (
              <span
                key={labelId}
                className="rounded border border-stone-700 bg-stone-800 px-1.5 py-0.5 text-[10px] uppercase text-stone-300"
              >
                {labelId.replace(/^CATEGORY_/, "").replace(/_/g, " ")}
              </span>
            ))}
          </div>
        ) : null}

        {latestMessage ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/compose?accountId=${accountId}&mode=reply&threadId=${thread.thread.id}&messageId=${latestMessage.id}`}
              className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase text-stone-200"
            >
              Reply
            </Link>
            <Link
              href={`/compose?accountId=${accountId}&mode=replyAll&threadId=${thread.thread.id}&messageId=${latestMessage.id}`}
              className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase text-stone-200"
            >
              Reply All
            </Link>
            <Link
              href={`/compose?accountId=${accountId}&mode=forward&threadId=${thread.thread.id}&messageId=${latestMessage.id}`}
              className="rounded-lg border border-stone-700 px-3 py-1.5 text-xs uppercase text-stone-200"
            >
              Forward
            </Link>
          </div>
        ) : null}
      </section>

      <ThreadView
        accountId={accountId}
        initialMessages={thread.messages.map((message) => ({
          id: message.id,
          fromName: message.fromName,
          fromEmail: message.fromEmail,
          internalDate: message.internalDate.toISOString(),
          snippet: message.snippet,
          textBody: message.textBody,
          htmlBody: message.htmlBody ? sanitizeHtml(message.htmlBody) : null,
          bodyState: message.bodyState,
          attachments: message.attachments,
        }))}
      />
      <AppCommandShell
        userId={user.id}
        scope="thread"
        route="/thread"
        activeAccountId={accountId}
        selectedThreadIds={[thread.thread.id]}
        messageId={latestMessage?.id ?? null}
        threadContext={{
          threadId: thread.thread.id,
          messageId: latestMessage?.id ?? null,
        }}
        initialSettings={{
          theme: settings.theme === "light" ? "light" : "dark",
          density: settings.density === "compact" ? "compact" : "comfortable",
          keymap: settings.keymap === "vim" ? "vim" : "superhuman",
          contrast: settings.contrast === "high" ? "high" : "standard",
          hideRareLabels: settings.hideRareLabels,
        }}
      />
    </main>
  );
}
