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
        <div className="rounded-2xl border border-stone-800 bg-stone-900/80 p-6">
          <h1 className="text-3xl font-semibold text-balance">Connect your first Gmail account</h1>
          <p className="mt-2 text-stone-400 text-pretty">
            OAuth client configuration is saved. Start the OAuth flow to import your inbox.
          </p>
          <div className="mt-5">
            <ConnectGmailButton />
          </div>
        </div>
      </main>
    );
  }

  return (
    <InboxApp
      userId={user.id}
      initialAccountId={activeAccountId}
      accounts={accounts.map((account) => ({
        ...account,
        lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null,
      }))}
      initialThreads={initialThreads.map((thread) => ({
        ...thread,
        lastMessageAt: thread.lastMessageAt.toISOString(),
      }))}
    />
  );
}
