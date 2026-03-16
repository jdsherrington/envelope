import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const API_ROOT = path.resolve(process.cwd(), "apps/web/app/api");

const collectRouteFiles = async (dir: string, acc: string[] = []): Promise<string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectRouteFiles(full, acc);
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") {
      acc.push(full);
    }
  }
  return acc;
};

describe("mutation route coverage", () => {
  test("all POST routes require runMutationRoute or same-origin guard", async () => {
    const routeFiles = await collectRouteFiles(API_ROOT);
    const offenders: string[] = [];

    for (const file of routeFiles) {
      const source = await readFile(file, "utf8");
      if (!source.includes("export async function POST")) {
        continue;
      }

      const hasMutationWrapper = source.includes("runMutationRoute(");
      const hasSameOriginGuard = source.includes("requireSameOrigin(");

      if (!hasMutationWrapper && !hasSameOriginGuard) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
