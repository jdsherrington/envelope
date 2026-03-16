import {
  PickerSourceRegistry,
  type CommandContext,
  type PickerItem,
  type PickerSource,
} from "@envelope/core";

export type InboxAccountOption = {
  id: string;
  email: string;
  status: "ok" | "syncing" | "rate_limited" | "needs_reauth" | "error";
};

export type PickerSourceDependencies = {
  getAccounts: () => InboxAccountOption[];
  fetchLabels: (accountId: string) => Promise<Array<{ providerLabelId: string; name: string }>>;
  fetchSnippets: () => Promise<Array<{ id: string; title: string; body: string }>>;
  fetchTemplates: () => Promise<Array<{ id: string; title: string; body: string }>>;
  fetchFailedJobs?: () => Promise<Array<{ id: string; type: string; accountId: string }>>;
};

const filterItems = (items: PickerItem[], query: string): PickerItem[] => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return items;
  }

  return items.filter((item) => {
    const haystack = `${item.title} ${item.subtitle ?? ""} ${(item.keywords ?? []).join(" ")}`.toLowerCase();
    return haystack.includes(q);
  });
};

const toSchedulePresets = (): Array<{ id: string; title: string; sendAt: string }> => {
  const now = new Date();
  const in30m = new Date(now.getTime() + 30 * 60 * 1000);
  const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(8, 0, 0, 0);

  return [
    { id: "in-30m", title: "In 30 minutes", sendAt: in30m.toISOString() },
    { id: "in-2h", title: "In 2 hours", sendAt: in2h.toISOString() },
    { id: "tomorrow-8", title: "Tomorrow 8:00 AM", sendAt: tomorrow.toISOString() },
  ];
};

export const createPickerSourceRegistry = (
  deps: PickerSourceDependencies,
): PickerSourceRegistry => {
  const registry = new PickerSourceRegistry();

  const labelsSource: PickerSource = {
    id: "labels.activeAccount",
    async getItems(ctx: CommandContext, query: string): Promise<PickerItem[]> {
      if (!ctx.activeAccountId) {
        return [];
      }

      const labels = await deps.fetchLabels(ctx.activeAccountId);
      const items = labels.map((label) => ({
        id: label.providerLabelId,
        title: label.name,
        subtitle: label.providerLabelId,
        keywords: [label.providerLabelId],
      }));

      return filterItems(items, query);
    },
    async resolve(_ctx, itemId) {
      return { providerLabelId: itemId };
    },
  };

  const accountsSource: PickerSource = {
    id: "accounts.available",
    async getItems(_ctx: CommandContext, query: string): Promise<PickerItem[]> {
      const items = deps.getAccounts().map((account) => ({
        id: account.id,
        title: account.email,
        subtitle: account.status,
        keywords: [account.status],
      }));
      return filterItems(items, query);
    },
    async resolve(_ctx, itemId) {
      return { accountId: itemId };
    },
  };

  const snippetsSource: PickerSource = {
    id: "snippets.all",
    async getItems(_ctx, query) {
      const snippets = await deps.fetchSnippets();
      const items = snippets.map((snippet) => ({
        id: snippet.id,
        title: snippet.title,
        subtitle: snippet.body.slice(0, 80),
        keywords: [snippet.title],
      }));
      return filterItems(items, query);
    },
    async resolve(_ctx, itemId) {
      const snippets = await deps.fetchSnippets();
      const snippet = snippets.find((entry) => entry.id === itemId);
      return snippet ? { snippetId: snippet.id, body: snippet.body } : null;
    },
  };

  const templatesSource: PickerSource = {
    id: "templates.all",
    async getItems(_ctx, query) {
      const templates = await deps.fetchTemplates();
      const items = templates.map((template) => ({
        id: template.id,
        title: template.title,
        subtitle: template.body.slice(0, 80),
        keywords: [template.title],
      }));
      return filterItems(items, query);
    },
    async resolve(_ctx, itemId) {
      const templates = await deps.fetchTemplates();
      const template = templates.find((entry) => entry.id === itemId);
      return template ? { templateId: template.id, body: template.body } : null;
    },
  };

  const scheduleSource: PickerSource = {
    id: "schedule.presets",
    async getItems(_ctx, query) {
      const items = toSchedulePresets().map((preset) => ({
        id: preset.id,
        title: preset.title,
        subtitle: new Date(preset.sendAt).toLocaleString(),
      }));
      return filterItems(items, query);
    },
    async resolve(_ctx, itemId) {
      const preset = toSchedulePresets().find((entry) => entry.id === itemId);
      return preset ? { sendAt: preset.sendAt } : null;
    },
  };

  const failedJobsSource: PickerSource = {
    id: "jobs.failed",
    async getItems(_ctx, query) {
      if (!deps.fetchFailedJobs) {
        return [];
      }
      const jobs = await deps.fetchFailedJobs();
      const items = jobs.map((job) => ({
        id: job.id,
        title: job.type,
        subtitle: `${job.id.slice(0, 8)}…`,
        keywords: [job.id, job.type, job.accountId],
      }));
      return filterItems(items, query);
    },
    async resolve(_ctx, itemId) {
      if (!deps.fetchFailedJobs) {
        return null;
      }
      const jobs = await deps.fetchFailedJobs();
      const job = jobs.find((entry) => entry.id === itemId);
      return job ? { jobId: job.id, accountId: job.accountId } : null;
    },
  };

  registry.registerMany([
    labelsSource,
    accountsSource,
    snippetsSource,
    templatesSource,
    scheduleSource,
    failedJobsSource,
  ]);
  return registry;
};
