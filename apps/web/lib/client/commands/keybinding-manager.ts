import type { CommandContext, CommandDefinition } from "@envelope/core";
import { CommandRegistry } from "@envelope/core";

const normalizeStroke = (event: KeyboardEvent): string => {
  const key = event.key.toLowerCase();
  const parts = [
    event.metaKey ? "cmd" : null,
    event.ctrlKey ? "ctrl" : null,
    event.altKey ? "alt" : null,
    event.shiftKey ? "shift" : null,
    key,
  ]
    .filter(Boolean)
    .join("+");

  return parts;
};

export class KeybindingManager {
  private pendingStroke: string | null = null;
  private pendingUntil = 0;

  constructor(private readonly chordTimeoutMs = 800) {}

  resolve(
    event: KeyboardEvent,
    ctx: CommandContext,
    registry: CommandRegistry,
  ): { command: CommandDefinition | null; consumed: boolean } {
    const now = Date.now();
    if (this.pendingStroke && now > this.pendingUntil) {
      this.pendingStroke = null;
      this.pendingUntil = 0;
    }

    const stroke = normalizeStroke(event);

    if (this.pendingStroke) {
      const chord = `${this.pendingStroke} ${stroke}`;
      const command = registry.matchKeybinding(ctx, chord);
      this.pendingStroke = null;
      this.pendingUntil = 0;
      if (command) {
        return { command, consumed: true };
      }
    }

    const direct = registry.matchKeybinding(ctx, stroke);
    if (direct) {
      return { command: direct, consumed: true };
    }

    const waitingForChord = registry
      .listAvailable(ctx)
      .some((command) =>
        (command.keybindings ?? []).some((binding) => binding.sequence.toLowerCase().startsWith(`${stroke} `)),
      );

    if (waitingForChord) {
      this.pendingStroke = stroke;
      this.pendingUntil = now + this.chordTimeoutMs;
      return { command: null, consumed: true };
    }

    return { command: null, consumed: false };
  }

  clear() {
    this.pendingStroke = null;
    this.pendingUntil = 0;
  }
}
