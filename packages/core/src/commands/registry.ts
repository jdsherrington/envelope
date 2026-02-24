import type {
  CommandContext,
  CommandDefinition,
  CommandId,
  PickerSource,
  PickerSourceId,
} from "./types";

export class CommandRegistry {
  private commands = new Map<CommandId, CommandDefinition>();

  register(cmd: CommandDefinition): void {
    if (this.commands.has(cmd.id)) {
      throw new Error(`Duplicate command id: ${cmd.id}`);
    }
    this.commands.set(cmd.id, cmd);
  }

  registerMany(cmds: CommandDefinition[]): void {
    for (const cmd of cmds) {
      this.register(cmd);
    }
  }

  getById(id: CommandId): CommandDefinition | null {
    return this.commands.get(id) ?? null;
  }

  listAll(): CommandDefinition[] {
    return [...this.commands.values()];
  }

  listAvailable(ctx: CommandContext): CommandDefinition[] {
    return this.listAll().filter((cmd) => {
      const scopeOk = cmd.scope.includes("global") || cmd.scope.includes(ctx.view.scope);
      return scopeOk && cmd.availability(ctx);
    });
  }

  search(ctx: CommandContext, query: string, limit: number): CommandDefinition[] {
    const q = query.trim().toLowerCase();
    const commands = this.listAvailable(ctx);
    if (!q) {
      return commands.slice(0, limit);
    }

    return commands
      .map((cmd) => {
        const haystack = [
          cmd.presentation.title,
          cmd.presentation.subtitle ?? "",
          ...(cmd.presentation.keywords ?? []),
        ]
          .join(" ")
          .toLowerCase();
        const score = haystack.includes(q) ? 1 : 0;
        return { cmd, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => entry.cmd);
  }

  matchKeybinding(ctx: CommandContext, keystroke: string): CommandDefinition | null {
    const normalized = normalizeSequence(keystroke);
    for (const cmd of this.listAvailable(ctx)) {
      for (const keybinding of cmd.keybindings ?? []) {
        if (normalizeSequence(keybinding.sequence) !== normalized) {
          continue;
        }
        if (keybinding.when && !keybinding.when(ctx)) {
          continue;
        }
        return cmd;
      }
    }
    return null;
  }
}

export class PickerSourceRegistry {
  private sources = new Map<PickerSourceId, PickerSource>();

  register(source: PickerSource): void {
    if (this.sources.has(source.id)) {
      throw new Error(`Duplicate picker source id: ${source.id}`);
    }
    this.sources.set(source.id, source);
  }

  registerMany(sources: PickerSource[]): void {
    for (const source of sources) {
      this.register(source);
    }
  }

  getById(id: PickerSourceId): PickerSource {
    const source = this.sources.get(id);
    if (!source) {
      throw new Error(`Unknown picker source: ${id}`);
    }
    return source;
  }
}

const normalizeSequence = (sequence: string): string =>
  sequence
    .trim()
    .toLowerCase()
    .replace("command", "cmd")
    .replace("control", "ctrl");
