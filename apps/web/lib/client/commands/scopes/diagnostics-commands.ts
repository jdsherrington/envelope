import type { CommandDefinition } from "@envelope/core";

export type DiagnosticsCommandDependencies = {
  navigate: (href: string) => void;
  exportDiagnostics: () => void;
  retryFailedJob: (jobId: string, accountId: string) => Promise<void> | void;
};

export const buildDiagnosticsCommands = (
  deps: DiagnosticsCommandDependencies,
): CommandDefinition[] => [
  {
    id: "diag.openLogs",
    version: 1,
    scope: ["global", "diagnostics", "inbox", "thread", "compose", "settings"],
    availability: () => true,
    presentation: {
      title: "Open diagnostics logs",
      category: "Diagnostics",
      keywords: ["logs", "diagnostics"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async () => {
      deps.navigate("/diagnostics#logs");
      return { status: "success" };
    },
  },
  {
    id: "diag.exportDiagnostics",
    version: 1,
    scope: ["global", "diagnostics", "inbox", "thread", "compose", "settings"],
    availability: () => true,
    presentation: {
      title: "Export diagnostics JSON",
      category: "Diagnostics",
      keywords: ["diagnostics", "export"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async () => {
      deps.exportDiagnostics();
      return { status: "success" };
    },
  },
  {
    id: "diag.retryFailedJob",
    version: 1,
    scope: ["diagnostics"],
    availability: () => true,
    presentation: {
      title: "Retry failed job",
      category: "Diagnostics",
      keywords: ["retry", "failed", "job"],
    },
    input: { type: "picker", source: "jobs.failed", placeholder: "Select failed job" },
    confirm: { type: "none" },
    execute: async (_ctx, input) => {
      const jobId =
        typeof input === "object" && input && "jobId" in input ? String((input as { jobId: string }).jobId) : null;
      const accountId =
        typeof input === "object" && input && "accountId" in input
          ? String((input as { accountId: string }).accountId)
          : null;
      if (!jobId || !accountId) {
        return { status: "error", message: "No failed job selected" };
      }
      await deps.retryFailedJob(jobId, accountId);
      return { status: "success" };
    },
  },
];
