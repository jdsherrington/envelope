import type { CommandDefinition } from "@envelope/core";

export type ComposeCommandDependencies = {
  send: () => Promise<void> | void;
  saveDraft: () => Promise<void> | void;
  sendLater: (sendAt: string) => Promise<void> | void;
  undoSend: () => Promise<void> | void;
  insertSnippet: (body: string) => Promise<void> | void;
  insertTemplate: (body: string) => Promise<void> | void;
};

export const buildComposeCommands = (deps: ComposeCommandDependencies): CommandDefinition[] => [
  {
    id: "compose.send",
    version: 1,
    scope: ["compose"],
    availability: () => true,
    presentation: {
      title: "Send message",
      category: "Compose",
      keywords: ["send", "submit"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "cmd+enter" }, { sequence: "ctrl+enter" }],
    execute: async () => {
      await deps.send();
      return { status: "success" };
    },
  },
  {
    id: "compose.saveDraft",
    version: 1,
    scope: ["compose"],
    availability: () => true,
    presentation: {
      title: "Save draft",
      category: "Compose",
      keywords: ["draft", "save"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "cmd+s" }, { sequence: "ctrl+s" }],
    execute: async () => {
      await deps.saveDraft();
      return { status: "success" };
    },
  },
  {
    id: "compose.sendLater",
    version: 1,
    scope: ["compose"],
    availability: () => true,
    presentation: {
      title: "Send later",
      category: "Compose",
      keywords: ["schedule", "later"],
    },
    input: { type: "picker", source: "schedule.presets", placeholder: "Choose send time" },
    confirm: { type: "none" },
    keybindings: [{ sequence: "shift+cmd+enter" }, { sequence: "shift+ctrl+enter" }],
    execute: async (_ctx, input) => {
      const sendAt =
        typeof input === "object" && input && "sendAt" in input ? String((input as { sendAt: string }).sendAt) : null;
      if (!sendAt) {
        return { status: "error", message: "No send time selected" };
      }
      await deps.sendLater(sendAt);
      return { status: "success" };
    },
  },
  {
    id: "compose.undoSend",
    version: 1,
    scope: ["compose"],
    availability: () => true,
    presentation: {
      title: "Undo send",
      category: "Compose",
      keywords: ["undo", "cancel send"],
    },
    input: { type: "none" },
    confirm: { type: "none" },
    execute: async () => {
      await deps.undoSend();
      return { status: "success" };
    },
  },
  {
    id: "compose.insertSnippet",
    version: 1,
    scope: ["compose"],
    availability: () => true,
    presentation: {
      title: "Insert snippet",
      category: "Snippet",
      keywords: ["snippet", "insert"],
    },
    input: { type: "picker", source: "snippets.all", placeholder: "Select snippet" },
    confirm: { type: "none" },
    execute: async (_ctx, input) => {
      const body =
        typeof input === "object" && input && "body" in input ? String((input as { body: string }).body) : null;
      if (!body) {
        return { status: "error", message: "No snippet selected" };
      }
      await deps.insertSnippet(body);
      return { status: "success" };
    },
  },
  {
    id: "compose.insertTemplate",
    version: 1,
    scope: ["compose"],
    availability: () => true,
    presentation: {
      title: "Insert template",
      category: "Snippet",
      keywords: ["template", "insert"],
    },
    input: { type: "picker", source: "templates.all", placeholder: "Select template" },
    confirm: { type: "none" },
    execute: async (_ctx, input) => {
      const body =
        typeof input === "object" && input && "body" in input ? String((input as { body: string }).body) : null;
      if (!body) {
        return { status: "error", message: "No template selected" };
      }
      await deps.insertTemplate(body);
      return { status: "success" };
    },
  },
];
