import { collectInventory, extractCommandSequencesFromSource, listApiRouteFiles, listEnvNamesFromSource, INVENTORY_RELATIVE_PATH, readRepoFile, renderGeneratedDocs, stableInventoryJson, validateMarkdownLinks } from "./lib";

const fail = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const ensureEqual = async (path: string, expected: string) => {
  const current = await readRepoFile(path);
  if (current !== expected) {
    fail(`Stale generated file: ${path}. Run bun run docs:generate.`);
  }
};

const main = async () => {
  const inventory = await collectInventory();

  await ensureEqual(INVENTORY_RELATIVE_PATH, stableInventoryJson(inventory));

  for (const doc of renderGeneratedDocs(inventory)) {
    await ensureEqual(doc.path, doc.content);
  }

  const routeFiles = await listApiRouteFiles();
  const inventoryRouteFiles = new Set(inventory.apiRoutes.map((route) => route.filePath));
  for (const routeFile of routeFiles) {
    if (!inventoryRouteFiles.has(routeFile)) {
      fail(`API route missing from inventory: ${routeFile}`);
    }
  }

  const envNames = await listEnvNamesFromSource();
  const inventoryEnvNames = new Set(inventory.envVars.map((entry) => entry.name));
  for (const envName of envNames) {
    if (!inventoryEnvNames.has(envName)) {
      fail(`Environment variable missing from inventory: ${envName}`);
    }
  }

  const sourceSequences = await extractCommandSequencesFromSource();
  const inventorySequences = new Set(
    inventory.commands.flatMap((command) => command.keybindings.map((binding) => binding.sequence)),
  );
  for (const sequence of sourceSequences) {
    if (!inventorySequences.has(sequence)) {
      fail(`Command keybinding missing from inventory: ${sequence}`);
    }
  }

  const linkIssues = await validateMarkdownLinks();
  if (linkIssues.length > 0) {
    const output = linkIssues
      .map((issue) => `- ${issue.file}: ${issue.link} (${issue.reason})`)
      .join("\n");
    fail(`Broken markdown links detected:\n${output}`);
  }

  console.log("Documentation checks passed.");
};

await main();
