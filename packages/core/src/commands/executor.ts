import type {
  CommandContext,
  CommandDefinition,
  CommandResult,
} from "./types";
import type { CommandRegistry } from "./registry";

export type CommandExecutionHooks = {
  onInvoked?: (event: {
    commandId: string;
    commandVersion: number;
    ctx: CommandContext;
  }) => void;
  onSucceeded?: (event: {
    commandId: string;
    commandVersion: number;
    durationMs: number;
    result: CommandResult;
  }) => void;
  onFailed?: (event: {
    commandId: string;
    commandVersion: number;
    durationMs: number;
    error: unknown;
  }) => void;
};

export class CommandExecutor {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly hooks: CommandExecutionHooks = {},
  ) {}

  async run(commandId: string, ctx: CommandContext, input?: unknown): Promise<CommandResult> {
    const cmd = this.registry.getById(commandId);
    if (!cmd) {
      return { status: "error", message: `Unknown command: ${commandId}` };
    }

    if (!this.isAvailable(cmd, ctx)) {
      return { status: "error", message: `Command unavailable: ${commandId}` };
    }

    this.hooks.onInvoked?.({
      commandId: cmd.id,
      commandVersion: cmd.version,
      ctx,
    });

    const startedAt = performance.now();
    try {
      const result = await cmd.execute(ctx, input);
      this.hooks.onSucceeded?.({
        commandId: cmd.id,
        commandVersion: cmd.version,
        durationMs: performance.now() - startedAt,
        result,
      });
      return result;
    } catch (error) {
      this.hooks.onFailed?.({
        commandId: cmd.id,
        commandVersion: cmd.version,
        durationMs: performance.now() - startedAt,
        error,
      });

      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown command error",
      };
    }
  }

  private isAvailable(cmd: CommandDefinition, ctx: CommandContext): boolean {
    if (!(cmd.scope.includes("global") || cmd.scope.includes(ctx.view.scope))) {
      return false;
    }
    return cmd.availability(ctx);
  }
}
