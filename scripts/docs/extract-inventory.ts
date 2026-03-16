import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { collectInventory, INVENTORY_RELATIVE_PATH, resolveRepoPath, stableInventoryJson } from "./lib";

const main = async () => {
  const inventory = await collectInventory();
  const outputPath = resolveRepoPath(INVENTORY_RELATIVE_PATH);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, stableInventoryJson(inventory), "utf8");
  console.log(`Wrote ${INVENTORY_RELATIVE_PATH}`);
};

await main();
