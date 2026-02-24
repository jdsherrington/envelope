import Link from "next/link";
import { notFound } from "next/navigation";
import { appRepository } from "@envelope/db";
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

  const thread = await appRepository.getThreadById(threadId, accountId);
  if (!thread) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-6">
      <Link href={`/inbox?accountId=${accountId}`} className="mb-4 text-sm text-amber-300">
        Back to inbox
      </Link>

      <section className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4">
        <h1 className="text-2xl font-semibold text-balance">{thread.thread.subject}</h1>
        <p className="mt-2 text-sm text-stone-400 text-pretty">{thread.thread.snippet}</p>
      </section>

      <div className="mt-4 grid gap-4">
        {thread.messages.map((message) => (
          <article key={message.id} className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-stone-300">
                From: {message.fromName ? `${message.fromName} <${message.fromEmail}>` : message.fromEmail}
              </p>
              <time className="text-xs text-stone-500 tabular-nums">
                {message.internalDate.toLocaleString()}
              </time>
            </header>

            {message.htmlBody ? (
              <div
                className="prose prose-invert max-w-none text-pretty"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(message.htmlBody) }}
              />
            ) : (
              <pre className="whitespace-pre-wrap font-sans text-sm text-stone-200 text-pretty">
                {message.textBody ?? message.snippet ?? "(empty)"}
              </pre>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
