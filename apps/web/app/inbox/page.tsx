import { appRepository } from "@envelope/db";
import { InboxApp } from "@/components/inbox-app";
import { ConnectGmailButton } from "@/components/connect-gmail-button";
import { requirePageUser } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

type InboxPageProps = {
  searchParams: Promise<{
    accountId?: string;
    connected?: string;
    oauth?: string;
  }>;
};

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const { user } = await requirePageUser();
  const query = await searchParams;

  const accounts = await appRepository.listAccountsForUser(user.id);
  const hasGmailConfig = Boolean(await appRepository.getOAuthClientConfig("gmail"));
  const settings = await appRepository.getUserSettings(user.id);
  const activeAccountId = query.accountId ?? accounts[0]?.id ?? null;

  const initialThreads = activeAccountId
    ? await appRepository.listInboxThreads({
        accountId: activeAccountId,
        page: 1,
        pageSize: 100,
      })
    : [];

  if (!accounts.length) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-8">
        {query.oauth ? (
          <div className="mb-4 rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            OAuth status: {query.oauth}
          </div>
        ) : null}
        <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-6">
          <h1 className="text-3xl font-semibold text-balance">
            {hasGmailConfig ? "Connect your first Gmail account" : "Finish Gmail setup"}
          </h1>
          <p className="mt-2 text-stone-400 text-pretty">
            {hasGmailConfig
              ? "OAuth client configuration is saved. Start the OAuth flow to import your inbox."
              : "Add your Google OAuth client ID, secret, and redirect URI before starting the Gmail connect flow."}
          </p>
          <div className="mt-5">
            {hasGmailConfig ? (
              <ConnectGmailButton />
            ) : (
              <a
                href="/setup"
                className="inline-flex w-fit rounded-lg border border-amber-500 bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-200"
              >
                Configure Gmail OAuth
              </a>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      {query.connected ? (
        <div className="mx-auto mt-4 w-full max-w-7xl rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
          Account connected. Initial sync is running.
        </div>
      ) : null}
      <InboxApp
        userId={user.id}
        initialAccountId={activeAccountId}
        initialSettings={{
          theme: settings.theme === "light" ? "light" : "dark",
          density: settings.density === "compact" ? "compact" : "comfortable",
          keymap: settings.keymap === "vim" ? "vim" : "superhuman",
          contrast: settings.contrast === "high" ? "high" : "standard",
          hideRareLabels: settings.hideRareLabels,
        }}
        accounts={accounts.map((account) => ({
          id: account.id,
          email: account.email,
          providerId: account.providerId,
          status: account.status,
          lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
          backoffUntil: account.backoffUntil?.toISOString() ?? null,
          lastErrorCode: account.lastErrorCode,
          lastErrorMessage: account.lastErrorMessage,
        }))}
        initialThreads={initialThreads.map((thread) => ({
          ...thread,
          lastMessageAt: thread.lastMessageAt.toISOString(),
        }))}
      />
    </>
  );
}
