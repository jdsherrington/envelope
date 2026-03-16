import { NextResponse, type NextRequest } from "next/server";
import { appRepository } from "@envelope/db";
import { requireAuthenticatedRequest } from "@/lib/server/guards";
import { badRequest, serverError, unauthorized } from "@/lib/server/http";
import { runMutationRoute } from "@/lib/server/mutation-route";
import { normalizeSettingsPatch } from "@/lib/server/settings-registry";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuthenticatedRequest(request);
    const settings = await appRepository.getUserSettings(auth.user.id);
    return NextResponse.json({
      theme: settings.theme,
      density: settings.density,
      keymap: settings.keymap,
      contrast: settings.contrast === "high" ? "high" : "standard",
      hideRareLabels: settings.hideRareLabels,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return unauthorized();
    }
    return serverError(error instanceof Error ? error.message : "Failed to load settings");
  }
}

export async function POST(request: NextRequest) {
  return runMutationRoute(
    request,
    async (auth) => {
      let patch:
        | {
            theme?: "dark" | "light";
            density?: "comfortable" | "compact";
            keymap?: "superhuman" | "vim";
            contrast?: "standard" | "high";
            hideRareLabels?: boolean;
          }
        | null = null;

      try {
        patch = normalizeSettingsPatch(await request.json());
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : "Invalid settings payload");
      }

      const settings = await appRepository.upsertUserSettings({
        userId: auth.user.id,
        ...patch,
      });

      return NextResponse.json({
        theme: settings.theme,
        density: settings.density,
        keymap: settings.keymap,
        contrast: settings.contrast === "high" ? "high" : "standard",
        hideRareLabels: settings.hideRareLabels,
      });
    },
    "Failed to update settings",
  );
}
