export type CommandId = string;

export type CommandCategory =
  | "Navigation"
  | "Thread"
  | "Message"
  | "Compose"
  | "Label"
  | "Snippet"
  | "Account"
  | "Settings"
  | "Diagnostics";

export type CommandDanger = "safe" | "destructive";

export type CommandViewScope =
  | "global"
  | "inbox"
  | "thread"
  | "compose"
  | "settings"
  | "diagnostics";

export type CommandContext = {
  userId: string;
  activeAccountId: string | null;
  view: {
    scope: CommandViewScope;
    route: string;
  };
  selection: {
    threadIds: string[];
    messageId: string | null;
  };
  capabilities: {
    provider: string;
    supportsSendLater: boolean;
    supportsSnooze: boolean;
    supportsUndoSend: boolean;
  };
  ui: {
    density: "compact" | "comfortable";
    theme: "dark" | "light";
    keymap: "superhuman" | "vim";
    paletteOpen: boolean;
  };
};

export type CommandAvailability = (ctx: CommandContext) => boolean;

export type CommandKeybinding = {
  sequence: string;
  when?: (ctx: CommandContext) => boolean;
};

export type CommandPresentation = {
  title: string;
  subtitle?: string;
  icon?: string;
  keywords?: string[];
  category: CommandCategory;
  danger?: CommandDanger;
};

export type CommandConfirm =
  | { type: "none" }
  | { type: "confirm"; title: string; body?: string }
  | { type: "undo"; timeoutMs: number; undoCommandId: CommandId };

export type CommandResult =
  | { status: "success" }
  | { status: "queued"; jobId: string }
  | { status: "error"; message: string; retryable?: boolean };

export type CommandExecute = (
  ctx: CommandContext,
  input?: unknown,
) => Promise<CommandResult>;

export type PickerSourceId = string;

export type CommandInputSchema =
  | { type: "none" }
  | { type: "text"; placeholder: string; maxLength?: number }
  | { type: "picker"; source: PickerSourceId; placeholder?: string }
  | { type: "form"; schemaId: string };

export type CommandDefinition = {
  id: CommandId;
  version: number;
  scope: CommandViewScope[];
  availability: CommandAvailability;
  presentation: CommandPresentation;
  input: CommandInputSchema;
  confirm: CommandConfirm;
  keybindings?: CommandKeybinding[];
  execute: CommandExecute;
};

export type PickerItem = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  keywords?: string[];
};

export type PickerSource = {
  id: PickerSourceId;
  getItems(ctx: CommandContext, query: string): Promise<PickerItem[]>;
  resolve?(ctx: CommandContext, itemId: string): Promise<unknown>;
};
