export type UserTheme = "dark" | "light" | "system";
export type UserDensity = "comfortable" | "compact";
export type UserKeymap = "superhuman" | "vim";
export type UserAccent = "amber" | "blue" | "emerald" | "rose" | "violet";

export type UserSettings = {
  theme: UserTheme;
  density: UserDensity;
  keymap: UserKeymap;
  accent: UserAccent;
  hideRareLabels: boolean;
};

export const defaultUserSettings: UserSettings = {
  theme: "system",
  density: "comfortable",
  keymap: "superhuman",
  accent: "amber",
  hideRareLabels: true,
};
