import Link from "next/link";
import { appRepository } from "@envelope/db";
import { AppCommandShell } from "@/components/app-command-shell";
import { RoutePerfMarker } from "@/components/route-perf-marker";
import { SettingsPanel } from "@/components/settings-panel";
import { cn } from "@/lib/client/cn";
import { requirePageUser } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { user } = await requirePageUser();
  const settings = await appRepository.getUserSettings(user.id);

  return (
    <main
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 py-8",
        settings.contrast === "high" ? "envelope-contrast-high" : "",
      )}
    >
      <RoutePerfMarker route="/settings" />
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-semibold text-balance">Settings</h1>
        <Link href="/inbox" className="text-sm text-amber-300">
          Back to inbox
        </Link>
      </div>

      <SettingsPanel
        initial={{
          theme: settings.theme === "light" ? "light" : "dark",
          density: settings.density === "compact" ? "compact" : "comfortable",
          keymap: settings.keymap === "vim" ? "vim" : "superhuman",
          contrast: settings.contrast === "high" ? "high" : "standard",
          hideRareLabels: settings.hideRareLabels,
        }}
      />
      <AppCommandShell
        userId={user.id}
        scope="settings"
        route="/settings"
        initialSettings={{
          theme: settings.theme === "light" ? "light" : "dark",
          density: settings.density === "compact" ? "compact" : "comfortable",
          keymap: settings.keymap === "vim" ? "vim" : "superhuman",
          contrast: settings.contrast === "high" ? "high" : "standard",
          hideRareLabels: settings.hideRareLabels,
        }}
      />
    </main>
  );
}
