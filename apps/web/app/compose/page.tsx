import Link from "next/link";
import { appRepository } from "@envelope/db";
import { AppCommandShell } from "@/components/app-command-shell";
import { ComposeForm } from "@/components/compose-form";
import { RoutePerfMarker } from "@/components/route-perf-marker";
import { cn } from "@/lib/client/cn";
import { requirePageUser } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

type ComposePageProps = {
  searchParams: Promise<{
    accountId?: string;
    mode?: "new" | "reply" | "replyAll" | "forward";
    threadId?: string;
    messageId?: string;
  }>;
};

const quoteLines = (value: string): string =>
  value
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

export default async function ComposePage({ searchParams }: ComposePageProps) {
  const { user } = await requirePageUser();
  const query = await searchParams;
  const settings = await appRepository.getUserSettings(user.id);

  const accounts = await appRepository.listAccountsForUser(user.id);
  const accountId = query.accountId ?? accounts[0]?.id;

  if (!accountId) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-8">
        <p className="envelope-text-muted">Connect an account before composing.</p>
        <Link href="/inbox" className="envelope-link mt-3 text-sm">
          Back to inbox
        </Link>
      </main>
    );
  }

  const account = await appRepository.getAccountById(accountId);
  if (!account || account.userId !== user.id) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-8">
        <p className="envelope-text-muted">Account not found.</p>
        <Link href="/inbox" className="envelope-link mt-3 text-sm">
          Back to inbox
        </Link>
      </main>
    );
  }

  const mode = query.mode ?? "new";
  let initialDraft:
    | {
        to: string;
        subject: string;
        textBody: string;
        htmlBody: string;
      }
    | undefined;

  if (query.messageId && mode !== "new") {
    const message = await appRepository.getMessageById({
      accountId,
      messageId: query.messageId,
    });

    if (message) {
      const quoteText = message.textBody ?? message.snippet ?? "";
      const header = `On ${message.internalDate.toLocaleString()}, ${message.fromName ?? message.fromEmail} wrote:`;
      const prefixedRe = /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`;
      const prefixedFwd = /^fwd:/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}`;

      if (mode === "reply") {
        initialDraft = {
          to: message.fromEmail,
          subject: prefixedRe,
          textBody: `\n\n${header}\n${quoteLines(quoteText)}`,
          htmlBody: "",
        };
      }

      if (mode === "replyAll") {
        const recipients = new Set<string>([
          message.fromEmail,
          ...message.toRecipients.map((entry) => entry.email),
          ...message.ccRecipients.map((entry) => entry.email),
        ]);
        recipients.delete(account.email);

        initialDraft = {
          to: [...recipients].join(", "),
          subject: prefixedRe,
          textBody: `\n\n${header}\n${quoteLines(quoteText)}`,
          htmlBody: "",
        };
      }

      if (mode === "forward") {
        initialDraft = {
          to: "",
          subject: prefixedFwd,
          textBody: `\n\n--- Forwarded message ---\nFrom: ${message.fromEmail}\nDate: ${message.internalDate.toLocaleString()}\nSubject: ${message.subject}\n\n${quoteText}`,
          htmlBody: "",
        };
      }
    }
  }

  const savedSnippets = await appRepository.listSnippets(user.id);
  const snippets = savedSnippets.filter((snippet) => snippet.kind !== "template");
  const templates = savedSnippets.filter((snippet) => snippet.kind === "template");

  return (
    <main
      className={cn("mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-6")}
    >
      <RoutePerfMarker route="/compose" accountId={accountId} />
      <Link href={`/inbox?accountId=${accountId}`} className="envelope-link mb-4 text-sm">
        Back to inbox
      </Link>
      <ComposeForm
        accountId={accountId}
        initialDraft={initialDraft}
        snippets={snippets.map((snippet) => ({
          id: snippet.id,
          title: snippet.title,
          body: snippet.body,
        }))}
        templates={templates.map((template) => ({
          id: template.id,
          title: template.title,
          body: template.body,
        }))}
      />
      <AppCommandShell
        userId={user.id}
        scope="compose"
        route="/compose"
        activeAccountId={accountId}
        initialSettings={{
          theme:
            settings.theme === "light" || settings.theme === "dark" || settings.theme === "system"
              ? settings.theme
              : "system",
          density: settings.density === "compact" ? "compact" : "comfortable",
          keymap: settings.keymap === "vim" ? "vim" : "superhuman",
          accent:
            settings.accent === "blue" ||
            settings.accent === "emerald" ||
            settings.accent === "rose" ||
            settings.accent === "violet"
              ? settings.accent
              : "amber",
          hideRareLabels: settings.hideRareLabels,
        }}
      />
    </main>
  );
}
