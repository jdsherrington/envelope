import { describe, expect, test } from "bun:test";
import { ActionRegistry } from "./registry";

describe("ActionRegistry", () => {
  test("registers and executes actions", async () => {
    const registry = new ActionRegistry();
    registry.register({
      id: "math.double",
      run: async (input: { value: number }) => ({ result: input.value * 2 }),
    });

    const action = registry.get<{ value: number }, { result: number }>("math.double");
    const output = await action.run({ value: 4 });

    expect(output.result).toBe(8);
  });
});
