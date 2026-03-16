import type { CommandDefinition } from "@envelope/core";

export type NavigationCommandDependencies = {
  navigate: (href: string) => void;
};

export const buildNavigationCommands = (
  deps: NavigationCommandDependencies,
): CommandDefinition[] => [
  {
    id: "nav.goInbox",
    version: 1,
    scope: ["global", "inbox", "thread", "compose", "settings", "diagnostics"],
    availability: () => true,
    presentation: {
      title: "Go to inbox",
      category: "Navigation",
      keywords: ["inbox", "home"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "g i" }],
    execute: async () => {
      deps.navigate("/inbox");
      return { status: "success" };
    },
  },
  {
    id: "nav.openSettings",
    version: 1,
    scope: ["global", "inbox", "thread", "compose", "settings", "diagnostics"],
    availability: () => true,
    presentation: {
      title: "Open settings",
      category: "Navigation",
      keywords: ["settings", "preferences"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "g s" }],
    execute: async () => {
      deps.navigate("/settings");
      return { status: "success" };
    },
  },
  {
    id: "diag.showQuota",
    version: 1,
    scope: ["global", "inbox", "thread", "compose", "settings", "diagnostics"],
    availability: () => true,
    presentation: {
      title: "Open diagnostics",
      subtitle: "Quota and sync health",
      category: "Diagnostics",
      keywords: ["diagnostics", "quota", "health"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "g d" }],
    execute: async () => {
      deps.navigate("/diagnostics");
      return { status: "success" };
    },
  },
  {
    id: "compose.new",
    version: 1,
    scope: ["global", "inbox", "thread", "compose", "settings", "diagnostics"],
    availability: () => true,
    presentation: {
      title: "Compose new message",
      category: "Compose",
      keywords: ["compose", "new"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "c" }],
    execute: async (ctx) => {
      if (ctx.activeAccountId) {
        deps.navigate(`/compose?accountId=${ctx.activeAccountId}`);
      } else {
        deps.navigate("/compose");
      }
      return { status: "success" };
    },
  },
];
