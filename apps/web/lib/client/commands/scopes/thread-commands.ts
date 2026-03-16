import type { CommandDefinition } from "@envelope/core";

export type ThreadCommandDependencies = {
  openCompose: (mode: "new" | "reply" | "replyAll" | "forward") => void;
};

export const buildThreadCommands = (deps: ThreadCommandDependencies): CommandDefinition[] => [
  {
    id: "thread.reply",
    version: 1,
    scope: ["thread"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length === 1 && ctx.selection.messageId),
    presentation: {
      title: "Reply",
      category: "Thread",
      keywords: ["reply"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "r" }],
    execute: async () => {
      deps.openCompose("reply");
      return { status: "success" };
    },
  },
  {
    id: "thread.replyAll",
    version: 1,
    scope: ["thread"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length === 1 && ctx.selection.messageId),
    presentation: {
      title: "Reply all",
      category: "Thread",
      keywords: ["reply all"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "shift+r" }],
    execute: async () => {
      deps.openCompose("replyAll");
      return { status: "success" };
    },
  },
  {
    id: "thread.forward",
    version: 1,
    scope: ["thread"],
    availability: (ctx) => Boolean(ctx.activeAccountId && ctx.selection.threadIds.length === 1 && ctx.selection.messageId),
    presentation: {
      title: "Forward",
      category: "Thread",
      keywords: ["forward"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "f" }],
    execute: async () => {
      deps.openCompose("forward");
      return { status: "success" };
    },
  },
  {
    id: "thread.openCompose",
    version: 1,
    scope: ["thread"],
    availability: (ctx) => Boolean(ctx.activeAccountId),
    presentation: {
      title: "Open compose from thread",
      category: "Compose",
      keywords: ["compose", "thread"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async () => {
      deps.openCompose("new");
      return { status: "success" };
    },
  },
];
