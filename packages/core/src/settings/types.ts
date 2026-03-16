export type UserTheme = "dark" | "light";
export type UserDensity = "comfortable" | "compact";
export type UserKeymap = "superhuman" | "vim";
export type UserContrast = "standard" | "high";

export type UserSettings = {
  theme: UserTheme;
  density: UserDensity;
  keymap: UserKeymap;
  contrast: UserContrast;
  hideRareLabels: boolean;
};

export const defaultUserSettings: UserSettings = {
  theme: "dark",
  density: "comfortable",
  keymap: "superhuman",
  contrast: "standard",
  hideRareLabels: true,
};
