import { SettingsRegistry, type UserSettings } from "@envelope/core";

const registry = new SettingsRegistry();
registry.registerDefaults();

const settingIds = new Set(registry.list().map((definition) => definition.id));

export const normalizeSettingsPatch = (input: unknown): Partial<UserSettings> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Settings payload must be an object");
  }

  const source = input as Record<string, unknown>;
  const patch: Partial<UserSettings> = {};

  for (const [key, value] of Object.entries(source)) {
    if (!settingIds.has(key as keyof UserSettings)) {
      throw new Error(`Unknown setting key: ${key}`);
    }

    const definition = registry
      .list()
      .find((entry): entry is (typeof entry) & { id: keyof UserSettings } => entry.id === key);

    if (!definition) {
      throw new Error(`Unknown setting key: ${key}`);
    }

    if (!definition.validate(value)) {
      throw new Error(`Invalid setting value for: ${key}`);
    }

    (patch as Record<string, unknown>)[key] = value;
  }

  return patch;
};

export const applySettingsDefaults = (input: Partial<UserSettings> | null | undefined): UserSettings =>
  registry.apply(input);

export const listRegisteredSettingIds = (): string[] =>
  registry
    .list()
    .map((entry) => String(entry.id))
    .sort();
