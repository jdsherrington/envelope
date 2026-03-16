import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readRepoFile, renderGeneratedDocs, resolveRepoPath } from "./lib";
import type { DocsInventory } from "./types";

const main = async () => {
  const inventory = JSON.parse(await readRepoFile("docs/.generated/inventory.json")) as DocsInventory;
  const generated = renderGeneratedDocs(inventory);

  for (const file of generated) {
    const absolutePath = resolveRepoPath(file.path);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, "utf8");
    console.log(`Wrote ${file.path}`);
  }
};

await main();
