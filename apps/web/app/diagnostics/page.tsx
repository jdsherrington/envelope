import Link from "next/link";
import { appRepository } from "@envelope/db";
import {
  AccountActionButtons,
  RegisterPasskeyButton,
  RetryJobButton,
} from "@/components/diagnostics-actions";
import { AppCommandShell } from "@/components/app-command-shell";
import { RoutePerfMarker } from "@/components/route-perf-marker";
import { cn } from "@/lib/client/cn";
import { requirePageUser } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function DiagnosticsPage() {
  const { user } = await requirePageUser();
  const settings = await appRepository.getUserSettings(user.id);
  const diagnostics = await appRepository.diagnosticsForUser(user.id);

  const accountPanels = await Promise.all(
    diagnostics.accounts.map(async (account) => {
      const quota = await appRepository.getQuotaSummary(account.id);
      const sync = await appRepository.getSyncProgress(account.id);
      const failedJobs = await appRepository.listFailedJobsForAccount(account.id);
      return {
        account,
        quota,
        sync,
        failedJobs,
      };
    }),
  );

  return (
    <main
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 py-6",
        settings.contrast === "high" ? "envelope-contrast-high" : "",
      )}
    >
      <RoutePerfMarker route="/diagnostics" />
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-balance">Diagnostics</h1>
        <div className="flex items-center gap-2">
          <a
            href="/api/diagnostics/export"
            className="envelope-button-secondary rounded-lg px-2 py-1 text-xs"
          >
            Export JSON
          </a>
          <RegisterPasskeyButton />
          <Link href="/inbox" className="envelope-link text-sm">
            Back to inbox
          </Link>
        </div>
      </div>

      <section className="envelope-panel rounded-2xl p-4">
        <h2 className="text-xl font-medium text-balance">Account Health</h2>
        <ul className="mt-3 grid gap-3">
          {accountPanels.map(({ account, quota, sync, failedJobs }) => (
            <li key={account.id} className="envelope-panel-strong rounded-xl p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm">{account.email}</p>
                  <p className="envelope-text-muted mt-1 text-xs">Status: {account.status}</p>
                  <p className="envelope-text-soft text-xs">
                    Last sync: {account.lastSyncedAt ? account.lastSyncedAt.toLocaleString() : "never"}
                  </p>
                </div>
                <AccountActionButtons accountId={account.id} status={account.status} />
              </div>

              <div className="envelope-panel mt-3 grid gap-2 rounded-lg p-2 text-xs md:grid-cols-2">
                <div>
                  <p className="envelope-text-soft">Quota</p>
                  <p>Requests last 60s: {quota.requestsLast60s}</p>
                  <p>Daily estimate: {quota.dailyEstimate}</p>
                  <p>
                    Backoff until:{" "}
                    {quota.backoffUntil ? new Date(quota.backoffUntil).toLocaleString() : "none"}
                  </p>
                  <p>
                    Last limit event:{" "}
                    {quota.lastRateLimitEvent
                      ? `${quota.lastRateLimitEvent.code} at ${new Date(quota.lastRateLimitEvent.at).toLocaleString()}`
                      : "none"}
                  </p>
                </div>

                <div>
                  <p className="envelope-text-soft">Sync</p>
                  <p>In progress: {sync?.inProgress ? "yes" : "no"}</p>
                  <p>Phase: {sync?.phase ?? "unknown"}</p>
                  <p>
                    Progress: {sync?.processed ?? 0}
                    {sync?.target ? ` / ${sync.target}` : ""}
                  </p>
                  <p>Failed jobs: {failedJobs.length}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="envelope-panel mt-4 rounded-2xl p-4">
        <h2 className="text-xl font-medium text-balance">Queue</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="envelope-text-muted">
              <tr>
                <th className="px-2 py-1">Type</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Attempt</th>
                <th className="px-2 py-1">Updated</th>
                <th className="px-2 py-1">Error</th>
                <th className="px-2 py-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.jobs.map((job) => (
                <tr key={job.id} className="envelope-divider border-t">
                  <td className="px-2 py-1 font-mono text-xs">{job.type}</td>
                  <td className="px-2 py-1">
                    <span className="envelope-pill rounded px-1.5 py-0.5 text-xs uppercase">
                      {job.status}
                    </span>
                  </td>
                  <td className="px-2 py-1 tabular-nums">{job.attempt}</td>
                  <td className="envelope-text-muted px-2 py-1 text-xs tabular-nums">
                    {job.updatedAt.toLocaleString()}
                  </td>
                  <td className="px-2 py-1 text-xs text-[var(--color-danger-fg)] text-pretty">
                    {job.lastErrorCode ? `${job.lastErrorCode}: ${job.lastErrorMessage ?? ""}` : ""}
                  </td>
                  <td className="px-2 py-1">
                    {job.status === "dead" || job.status === "failed" ? (
                      <RetryJobButton accountId={job.accountId} jobId={job.id} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="envelope-panel mt-4 rounded-2xl p-4">
        <h2 className="text-xl font-medium text-balance">Command Events</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="envelope-text-muted">
              <tr>
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">Command</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Duration</th>
                <th className="px-2 py-1">Error</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.commandEvents.map((event) => (
                <tr key={event.id} className="envelope-divider border-t">
                  <td className="envelope-text-muted px-2 py-1 text-xs">{event.recordedAt.toLocaleString()}</td>
                  <td className="px-2 py-1 font-mono text-xs">{event.commandId}</td>
                  <td className="px-2 py-1 text-xs uppercase">{event.status}</td>
                  <td className="px-2 py-1 text-xs tabular-nums">
                    {event.durationMs != null ? `${event.durationMs}ms` : "-"}
                  </td>
                  <td className="px-2 py-1 text-xs text-[var(--color-danger-fg)]">{event.errorMessage ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="envelope-panel mt-4 rounded-2xl p-4">
        <h2 className="text-xl font-medium text-balance">Performance Events</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="envelope-text-muted">
              <tr>
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">Route</th>
                <th className="px-2 py-1">Metric</th>
                <th className="px-2 py-1">Value</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.perfEvents.map((event) => (
                <tr key={event.id} className="envelope-divider border-t">
                  <td className="envelope-text-muted px-2 py-1 text-xs">{event.recordedAt.toLocaleString()}</td>
                  <td className="px-2 py-1 text-xs font-mono">{event.route}</td>
                  <td className="px-2 py-1 text-xs">{event.metric}</td>
                  <td className="envelope-text-muted px-2 py-1 text-xs tabular-nums">{event.valueMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="logs" className="envelope-panel mt-4 rounded-2xl p-4">
        <h2 className="text-xl font-medium text-balance">Logs</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="envelope-text-muted">
              <tr>
                <th className="px-2 py-1">Time</th>
                <th className="px-2 py-1">Level</th>
                <th className="px-2 py-1">Scope</th>
                <th className="px-2 py-1">Message</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.logs.map((event) => (
                <tr key={event.id} className="envelope-divider border-t">
                  <td className="envelope-text-muted px-2 py-1 text-xs">{event.recordedAt.toLocaleString()}</td>
                  <td className="px-2 py-1 text-xs uppercase">{event.level}</td>
                  <td className="px-2 py-1 font-mono text-xs">{event.scope}</td>
                  <td className="envelope-text-muted px-2 py-1 text-xs">{event.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <AppCommandShell
        userId={user.id}
        scope="diagnostics"
        route="/diagnostics"
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
