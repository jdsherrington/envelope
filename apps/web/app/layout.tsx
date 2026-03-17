import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Envelope",
  description: "Self-hosted keyboard-first Gmail client",
};

const themeBootScript = `
(() => {
  try {
    const storedTheme = window.localStorage.getItem("envelope-theme");
    const storedAccent = window.localStorage.getItem("envelope-accent");
    const theme =
      storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
        ? storedTheme
        : "system";
    const accent =
      storedAccent === "amber" ||
      storedAccent === "blue" ||
      storedAccent === "emerald" ||
      storedAccent === "rose" ||
      storedAccent === "violet"
        ? storedAccent
        : "amber";
    const resolvedTheme =
      theme === "system"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.dataset.themePreference = theme;
    root.dataset.accent = accent;
    root.style.colorScheme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");
  } catch {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.themePreference = "system";
    document.documentElement.dataset.accent = "amber";
    document.documentElement.style.colorScheme = "dark";
    document.documentElement.classList.add("dark");
  }
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={inter.variable}
      data-theme="dark"
      data-theme-preference="system"
      data-accent="amber"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
