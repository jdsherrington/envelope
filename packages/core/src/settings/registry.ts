import {
  defaultUserSettings,
  type UserSettings,
} from "./types";

export type SettingDefinition<T> = {
  id: keyof UserSettings;
  defaultValue: T;
  validate: (value: unknown) => value is T;
};

export class SettingsRegistry {
  private readonly defs = new Map<keyof UserSettings, SettingDefinition<unknown>>();

  register<T>(definition: SettingDefinition<T>): void {
    if (this.defs.has(definition.id)) {
      throw new Error(`Duplicate setting id: ${String(definition.id)}`);
    }

    this.defs.set(definition.id, definition as SettingDefinition<unknown>);
  }

  registerDefaults(): void {
    this.register<UserSettings["theme"]>({
      id: "theme",
      defaultValue: defaultUserSettings.theme,
      validate: (value): value is UserSettings["theme"] => value === "dark" || value === "light",
    });

    this.register<UserSettings["density"]>({
      id: "density",
      defaultValue: defaultUserSettings.density,
      validate: (value): value is UserSettings["density"] =>
        value === "comfortable" || value === "compact",
    });

    this.register<UserSettings["keymap"]>({
      id: "keymap",
      defaultValue: defaultUserSettings.keymap,
      validate: (value): value is UserSettings["keymap"] =>
        value === "superhuman" || value === "vim",
    });

    this.register<UserSettings["contrast"]>({
      id: "contrast",
      defaultValue: defaultUserSettings.contrast,
      validate: (value): value is UserSettings["contrast"] => value === "standard" || value === "high",
    });

    this.register<UserSettings["hideRareLabels"]>({
      id: "hideRareLabels",
      defaultValue: defaultUserSettings.hideRareLabels,
      validate: (value): value is UserSettings["hideRareLabels"] => typeof value === "boolean",
    });
  }

  apply(partial: Partial<UserSettings> | null | undefined): UserSettings {
    const source = partial ?? {};
    const next: UserSettings = { ...defaultUserSettings };

    for (const [id, definition] of this.defs.entries()) {
      const value = source[id];
      if (definition.validate(value)) {
        (next[id] as unknown) = value;
      }
    }

    return next;
  }

  list(): Array<SettingDefinition<unknown>> {
    return [...this.defs.values()];
  }
}
