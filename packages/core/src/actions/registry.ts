export type ActionDefinition<TInput = unknown, TResult = unknown> = {
  id: string;
  run: (input: TInput) => Promise<TResult>;
};

export class ActionRegistry {
  private readonly actions = new Map<string, ActionDefinition<unknown, unknown>>();

  register<TInput, TResult>(definition: ActionDefinition<TInput, TResult>): void {
    if (this.actions.has(definition.id)) {
      throw new Error(`Duplicate action id: ${definition.id}`);
    }

    this.actions.set(definition.id, definition as ActionDefinition<unknown, unknown>);
  }

  get<TInput, TResult>(id: string): ActionDefinition<TInput, TResult> {
    const definition = this.actions.get(id);
    if (!definition) {
      throw new Error(`Unknown action id: ${id}`);
    }

    return definition as ActionDefinition<TInput, TResult>;
  }

  list(): Array<ActionDefinition<unknown, unknown>> {
    return [...this.actions.values()];
  }
}
