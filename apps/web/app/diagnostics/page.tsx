import Link from "next/link";
import { appRepository } from "@envelope/db";
import { requirePageUser } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  const { user } = await requirePageUser();
  const diagnostics = await appRepository.diagnosticsForUser(user.id);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-balance">Diagnostics</h1>
        <Link href="/inbox" className="text-sm text-amber-300">
          Back to inbox
        </Link>
      </div>

      <section className="rounded-2xl border border-stone-800 bg-stone-900/80 p-4">
        <h2 className="text-xl font-medium text-balance">Accounts</h2>
        <ul className="mt-3 grid gap-2">
          {diagnostics.accounts.map((account) => (
            <li key={account.id} className="rounded-xl border border-stone-800 bg-stone-950/60 p-3">
              <p className="text-sm text-stone-200">{account.email}</p>
              <p className="mt-1 text-xs text-stone-400">Status: {account.status}</p>
              <p className="text-xs text-stone-500">
                Last sync: {account.lastSyncedAt ? account.lastSyncedAt.toLocaleString() : "never"}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-2xl border border-stone-800 bg-stone-900/80 p-4">
        <h2 className="text-xl font-medium text-balance">Queue</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-stone-400">
              <tr>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Attempt</th>
                <th className="px-2 py-1">Updated</th>
                <th className="px-2 py-1">Error</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.jobs.map((job) => (
                <tr key={job.id} className="border-t border-stone-800">
                  <td className="px-2 py-1 font-mono text-xs text-stone-200">{job.type}</td>
                  <td className="px-2 py-1">
                    <span className="rounded border border-stone-700 px-1.5 py-0.5 text-xs uppercase">
                      {job.status}
                    </span>
                  </td>
                  <td className="px-2 py-1 tabular-nums">{job.attempt}</td>
                  <td className="px-2 py-1 tabular-nums text-xs text-stone-400">
                    {job.updatedAt.toLocaleString()}
                  </td>
                  <td className="px-2 py-1 text-xs text-red-300 text-pretty">
                    {job.lastErrorCode ? `${job.lastErrorCode}: ${job.lastErrorMessage ?? ""}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
