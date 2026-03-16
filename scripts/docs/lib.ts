import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type {
  ApiRouteDoc,
  CommandDoc,
  CommandKeybindingDoc,
  DataEnumDoc,
  DataFieldDoc,
  DataTableDoc,
  DocsInventory,
  EnvSurface,
  EnvSurfaceDoc,
  EnvVarDoc,
  GeneratedDoc,
  HttpMethod,
} from "./types";

const THIS_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(THIS_DIR, "../..");

export const INVENTORY_RELATIVE_PATH = "docs/.generated/inventory.json";

export const GENERATED_DOC_RELATIVE_PATHS = {
  apiRoutes: "docs/reference/api-routes.generated.md",
  environment: "docs/reference/environment.generated.md",
  commandCatalog: "docs/reference/command-catalog.generated.md",
  dataModel: "docs/reference/data-model.generated.md",
} as const;

const METHOD_PATTERN = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;

const posixPath = (value: string): string => value.split(path.sep).join("/");

const absolutePath = (relativePath: string): string => path.join(REPO_ROOT, relativePath);

const normalizeText = (value: string): string => value.replace(/\r\n/g, "\n");

const normalizeLiteralText = (value: string): string => {
  let text = value.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith("`") && text.endsWith("`"))
  ) {
    text = text.slice(1, -1);
  }
  return text.replace(/\s+/g, " ").trim();
};

const sortUnique = (values: string[]): string[] => [...new Set(values)].sort((a, b) => a.localeCompare(b));

const listFilesRecursive = async (relativeDir: string): Promise<string[]> => {
  const absoluteDir = absolutePath(relativeDir);
  const items = await readdir(absoluteDir, { withFileTypes: true });

  const files: string[] = [];
  for (const item of items) {
    const nestedRelative = posixPath(path.join(relativeDir, item.name));
    if (item.isDirectory()) {
      const nestedFiles = await listFilesRecursive(nestedRelative);
      files.push(...nestedFiles);
      continue;
    }

    if (item.isFile()) {
      files.push(nestedRelative);
    }
  }

  return files;
};

const inferRoutePurpose = (routePath: string): string => {
  if (routePath.startsWith("/api/actions/")) {
    return "Executes mailbox actions (thread mutations, compose, scheduling, or reminders).";
  }

  if (routePath.startsWith("/api/auth/passkey/")) {
    return "Passkey registration/login challenge and verification endpoints.";
  }

  if (routePath.startsWith("/api/auth/")) {
    return "Authentication and session lifecycle operations.";
  }

  if (routePath.startsWith("/api/setup/")) {
    return "Instance bootstrap endpoints for initial user and Gmail OAuth configuration.";
  }

  if (routePath.startsWith("/api/diagnostics/")) {
    return "Diagnostics export, queue/health telemetry, and recovery actions.";
  }

  if (routePath.startsWith("/api/sync/")) {
    return "Manual sync triggers and sync progress polling.";
  }

  if (routePath.startsWith("/api/accounts/")) {
    return "Account connection lifecycle endpoints (start OAuth, reconnect, remove).";
  }

  if (routePath.startsWith("/api/messages/")) {
    return "Message body/attachment retrieval endpoints.";
  }

  if (routePath.startsWith("/api/thread/")) {
    return "Thread detail retrieval.";
  }

  if (routePath === "/api/inbox") {
    return "Inbox thread list retrieval for selected account.";
  }

  if (routePath === "/api/search") {
    return "Inbox thread search for active account.";
  }

  if (routePath === "/api/settings") {
    return "User settings retrieval and updates.";
  }

  if (routePath === "/api/labels") {
    return "Label list retrieval for selected account.";
  }

  if (routePath === "/api/snippets") {
    return "Snippet and template retrieval.";
  }

  if (routePath === "/api/commands/events") {
    return "Command execution telemetry ingestion.";
  }

  if (routePath === "/api/health") {
    return "Health probe endpoint for runtime and dependency checks.";
  }

  return "API endpoint for Envelope web application behavior.";
};

const parseApiRoutes = async (): Promise<ApiRouteDoc[]> => {
  const apiFiles = (await listFilesRecursive("apps/web/app/api"))
    .filter((filePath) => filePath.endsWith("/route.ts"))
    .sort((a, b) => a.localeCompare(b));

  const routes: ApiRouteDoc[] = [];

  for (const filePath of apiFiles) {
    const content = await readFile(absolutePath(filePath), "utf8");
    const methods = sortUnique([...content.matchAll(METHOD_PATTERN)].map((match) => match[1] as HttpMethod));

    const routePath = posixPath(
      `/${filePath.replace(/^apps\/web\/app\//, "").replace(/\/route\.ts$/, "")}`,
    );

    const usesRunMutationRoute = content.includes("runMutationRoute(");
    const usesRequireAuthenticated =
      usesRunMutationRoute ||
      content.includes("requireAuthenticatedRequest(") ||
      content.includes("requireSession(");
    const usesRequireCsrf = usesRunMutationRoute || content.includes("requireCsrf(");

    const notes: string[] = [];
    if (usesRunMutationRoute) {
      notes.push("Uses runMutationRoute wrapper (session + CSRF guard).");
    }
    if (!usesRunMutationRoute && content.includes("requireAuthenticatedRequest(")) {
      notes.push("Uses explicit per-route authentication guard.");
    }
    if (content.includes("requireSameOrigin(")) {
      notes.push("Enforces same-origin request checks.");
    }

    routes.push({
      filePath,
      routePath,
      methods,
      purpose: inferRoutePurpose(routePath),
      auth: usesRequireAuthenticated ? "required" : "optional",
      csrf: usesRequireCsrf ? "required" : "not-required",
      notes,
    });
  }

  return routes.sort((a, b) => a.routePath.localeCompare(b.routePath) || a.filePath.localeCompare(b.filePath));
};

const parseEnvExample = async (): Promise<Map<string, string>> => {
  const content = await readFile(absolutePath(".env.example"), "utf8");
  const vars = new Map<string, string>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }

    const name = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[A-Z0-9_]+$/.test(name)) {
      continue;
    }

    vars.set(name, value);
  }

  return vars;
};

type ZodEnvEntry = {
  name: string;
  required: boolean;
  defaultValue: string | null;
};

const getStringValue = (expression: ts.Expression, sourceFile: ts.SourceFile): string | null => {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  if (ts.isNumericLiteral(expression)) {
    return expression.text;
  }

  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return "true";
  }

  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return "false";
  }

  return normalizeLiteralText(expression.getText(sourceFile));
};

const unwrapZodFlags = (initializer: ts.Expression, sourceFile: ts.SourceFile): { required: boolean; defaultValue: string | null } => {
  let optional = false;
  let defaultValue: string | null = null;

  let cursor: ts.Expression | undefined = initializer;
  while (cursor && ts.isCallExpression(cursor)) {
    if (ts.isPropertyAccessExpression(cursor.expression)) {
      const method = cursor.expression.name.text;
      if (method === "optional") {
        optional = true;
      }

      if (method === "default" && cursor.arguments[0]) {
        defaultValue = getStringValue(cursor.arguments[0], sourceFile);
      }

      cursor = cursor.expression.expression;
      continue;
    }

    break;
  }

  return {
    required: !optional && defaultValue === null,
    defaultValue,
  };
};

const parseZodEnvSchema = async (relativeFilePath: string): Promise<ZodEnvEntry[]> => {
  const content = await readFile(absolutePath(relativeFilePath), "utf8");
  const sourceFile = ts.createSourceFile(relativeFilePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const entries: ZodEnvEntry[] = [];

  const visit = (node: ts.Node) => {
    if (!ts.isCallExpression(node)) {
      ts.forEachChild(node, visit);
      return;
    }

    if (!ts.isPropertyAccessExpression(node.expression)) {
      ts.forEachChild(node, visit);
      return;
    }

    if (node.expression.name.text !== "object") {
      ts.forEachChild(node, visit);
      return;
    }

    if (!ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== "z") {
      ts.forEachChild(node, visit);
      return;
    }

    const objectArg = node.arguments[0];
    if (!objectArg || !ts.isObjectLiteralExpression(objectArg)) {
      ts.forEachChild(node, visit);
      return;
    }

    for (const property of objectArg.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }

      const rawName = property.name.getText(sourceFile).replace(/['"]/g, "");
      if (!/^[A-Z0-9_]+$/.test(rawName)) {
        continue;
      }

      const flags = unwrapZodFlags(property.initializer, sourceFile);
      entries.push({
        name: rawName,
        required: flags.required,
        defaultValue: flags.defaultValue,
      });
    }
  };

  visit(sourceFile);

  const deduped = new Map<string, ZodEnvEntry>();
  for (const entry of entries) {
    deduped.set(entry.name, entry);
  }

  return [...deduped.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const parseEnvVars = async (): Promise<EnvVarDoc[]> => {
  const byName = new Map<string, EnvSurfaceDoc[]>();

  const addSurface = (name: string, doc: EnvSurfaceDoc) => {
    const existing = byName.get(name) ?? [];
    existing.push(doc);
    byName.set(name, existing);
  };

  const envExample = await parseEnvExample();
  for (const [name, value] of envExample.entries()) {
    addSurface(name, {
      surface: "env-example",
      required: true,
      defaultValue: value.length > 0 ? value : null,
      source: ".env.example",
    });
  }

  const webEntries = await parseZodEnvSchema("apps/web/lib/server/env.ts");
  for (const entry of webEntries) {
    addSurface(entry.name, {
      surface: "web",
      required: entry.required,
      defaultValue: entry.defaultValue,
      source: "apps/web/lib/server/env.ts",
    });
  }

  const workerEntries = await parseZodEnvSchema("apps/worker/src/env.ts");
  for (const entry of workerEntries) {
    addSurface(entry.name, {
      surface: "worker",
      required: entry.required,
      defaultValue: entry.defaultValue,
      source: "apps/worker/src/env.ts",
    });
  }

  const order: Record<EnvSurface, number> = {
    "env-example": 0,
    web: 1,
    worker: 2,
  };

  return [...byName.entries()]
    .map(([name, surfaces]) => ({
      name,
      surfaces: surfaces.sort((a, b) => order[a.surface] - order[b.surface]),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

const getObjectProperty = (objectLiteral: ts.ObjectLiteralExpression, name: string): ts.ObjectLiteralElementLike | null => {
  for (const property of objectLiteral.properties) {
    const key = property.name?.getText()?.replace(/['"]/g, "");
    if (key === name) {
      return property;
    }
  }
  return null;
};

const propertyValue = (property: ts.ObjectLiteralElementLike | null): ts.Expression | null => {
  if (!property) {
    return null;
  }

  if (ts.isPropertyAssignment(property)) {
    return property.initializer;
  }

  return null;
};

const expressionToString = (expression: ts.Expression | null): string | null => {
  if (!expression) {
    return null;
  }

  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }

  return null;
};

const expressionToStringArray = (expression: ts.Expression | null): string[] => {
  if (!expression || !ts.isArrayLiteralExpression(expression)) {
    return [];
  }

  const values: string[] = [];
  for (const element of expression.elements) {
    if (!ts.isStringLiteral(element) && !ts.isNoSubstitutionTemplateLiteral(element)) {
      continue;
    }
    values.push(element.text);
  }

  return values;
};

const parseCommandKeybindings = (expression: ts.Expression | null): CommandKeybindingDoc[] => {
  if (!expression || !ts.isArrayLiteralExpression(expression)) {
    return [];
  }

  const results: CommandKeybindingDoc[] = [];
  for (const element of expression.elements) {
    if (!ts.isObjectLiteralExpression(element)) {
      continue;
    }

    const sequence = expressionToString(propertyValue(getObjectProperty(element, "sequence")));
    if (!sequence) {
      continue;
    }

    const keymap = expressionToString(propertyValue(getObjectProperty(element, "keymap")));
    results.push({ sequence, keymap });
  }

  return results;
};

const parseCommands = async (): Promise<CommandDoc[]> => {
  const sourcePath = "apps/web/lib/client/commands/inbox-commands.ts";
  const content = await readFile(absolutePath(sourcePath), "utf8");
  const sourceFile = ts.createSourceFile(sourcePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const commands = new Map<string, CommandDoc>();

  const visit = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const id = expressionToString(propertyValue(getObjectProperty(node, "id")));
      const scope = expressionToStringArray(propertyValue(getObjectProperty(node, "scope")));
      const presentationExpr = propertyValue(getObjectProperty(node, "presentation"));
      const executeExpr = propertyValue(getObjectProperty(node, "execute"));

      if (id && scope.length > 0 && presentationExpr && ts.isObjectLiteralExpression(presentationExpr) && executeExpr) {
        const title = expressionToString(propertyValue(getObjectProperty(presentationExpr, "title")));
        const category = expressionToString(propertyValue(getObjectProperty(presentationExpr, "category")));

        if (title && category) {
          const keybindings = parseCommandKeybindings(propertyValue(getObjectProperty(node, "keybindings")));

          commands.set(id, {
            id,
            title,
            category,
            scope,
            keybindings,
            source: sourcePath,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return [...commands.values()].sort((a, b) => a.id.localeCompare(b.id));
};

const parseDataModel = async (): Promise<{ enums: DataEnumDoc[]; tables: DataTableDoc[] }> => {
  const sourcePath = "packages/db/src/schema.ts";
  const content = await readFile(absolutePath(sourcePath), "utf8");
  const sourceFile = ts.createSourceFile(sourcePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  const enums = new Map<string, DataEnumDoc>();
  const tables = new Map<string, DataTableDoc>();

  const declarationName = (declaration: ts.VariableDeclaration): string | null => {
    if (!ts.isIdentifier(declaration.name)) {
      return null;
    }
    return declaration.name.text;
  };

  const inferFieldType = (fieldText: string): string => {
    const typeMatch = fieldText.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (!typeMatch) {
      return "unknown";
    }

    const symbol = typeMatch[1];
    const enumDoc = enums.get(symbol);
    if (enumDoc) {
      return `enum:${enumDoc.dbName}`;
    }

    return symbol;
  };

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      const symbol = declarationName(declaration);
      if (!symbol || !declaration.initializer || !ts.isCallExpression(declaration.initializer)) {
        continue;
      }

      const call = declaration.initializer;
      if (ts.isIdentifier(call.expression) && call.expression.text === "pgEnum") {
        const nameArg = call.arguments[0];
        const valuesArg = call.arguments[1];
        if (!nameArg || !valuesArg) {
          continue;
        }

        const dbName = ts.isStringLiteral(nameArg) || ts.isNoSubstitutionTemplateLiteral(nameArg)
          ? nameArg.text
          : nameArg.getText(sourceFile);

        const values = ts.isArrayLiteralExpression(valuesArg)
          ? valuesArg.elements
              .filter((element): element is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral =>
                ts.isStringLiteral(element) || ts.isNoSubstitutionTemplateLiteral(element),
              )
              .map((element) => element.text)
          : [];

        enums.set(symbol, {
          symbol,
          dbName,
          values,
          source: sourcePath,
        });

        continue;
      }

      if (ts.isIdentifier(call.expression) && call.expression.text === "pgTable") {
        const nameArg = call.arguments[0];
        const fieldsArg = call.arguments[1];

        if (!nameArg || !fieldsArg || !ts.isObjectLiteralExpression(fieldsArg)) {
          continue;
        }

        const dbName = ts.isStringLiteral(nameArg) || ts.isNoSubstitutionTemplateLiteral(nameArg)
          ? nameArg.text
          : nameArg.getText(sourceFile);

        const fields: DataFieldDoc[] = [];
        for (const property of fieldsArg.properties) {
          if (!ts.isPropertyAssignment(property)) {
            continue;
          }

          const name = property.name.getText(sourceFile).replace(/['"]/g, "");
          const fieldText = property.initializer.getText(sourceFile);

          fields.push({
            name,
            type: inferFieldType(fieldText),
            nullable: !fieldText.includes(".notNull()"),
            primaryKey: fieldText.includes(".primaryKey()"),
            referencesOtherTable: fieldText.includes(".references("),
            hasDefault:
              fieldText.includes(".default(") ||
              fieldText.includes(".defaultNow(") ||
              fieldText.includes(".defaultRandom("),
          });
        }

        tables.set(symbol, {
          symbol,
          dbName,
          fields,
          source: sourcePath,
        });
      }
    }
  }

  return {
    enums: [...enums.values()].sort((a, b) => a.dbName.localeCompare(b.dbName)),
    tables: [...tables.values()].sort((a, b) => a.dbName.localeCompare(b.dbName)),
  };
};

export const collectInventory = async (): Promise<DocsInventory> => {
  const [apiRoutes, envVars, commands, dataModel] = await Promise.all([
    parseApiRoutes(),
    parseEnvVars(),
    parseCommands(),
    parseDataModel(),
  ]);

  return {
    sources: {
      apiRouteRoot: "apps/web/app/api",
      envSources: [".env.example", "apps/web/lib/server/env.ts", "apps/worker/src/env.ts"],
      commandSources: [
        "apps/web/lib/client/commands/inbox-commands.ts",
        "apps/web/lib/client/commands/keybinding-manager.ts",
      ],
      dataModelSources: ["packages/db/src/schema.ts", "packages/db/src/repositories/app-repository.ts"],
    },
    apiRoutes,
    envVars,
    commands,
    dataModel,
  };
};

export const stableInventoryJson = (inventory: DocsInventory): string => `${JSON.stringify(inventory, null, 2)}\n`;

const mdHeader = (title: string, generatedFrom: string[]): string[] => [
  `# ${title}`,
  "",
  "> This file is generated by `bun run docs:generate`. Do not edit it directly.",
  "",
  "## Generated From",
  ...generatedFrom.map((entry) => `- \`${entry}\``),
  "",
];

const relativeLinkFromReference = (repoRelativePath: string): string =>
  posixPath(path.relative("docs/reference", repoRelativePath));

const renderApiReference = (inventory: DocsInventory): string => {
  const sources = sortUnique([
    ...inventory.apiRoutes.map((route) => route.filePath),
    "apps/web/lib/server/schemas.ts",
    "apps/web/lib/server/mutation-route.ts",
    "apps/web/lib/server/guards.ts",
  ]);

  const lines = mdHeader("API Routes Reference (Generated)", sources);

  lines.push("## Routes");
  lines.push("");
  lines.push("| Route | Methods | Auth | CSRF | Purpose | Source | Notes |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");

  for (const route of inventory.apiRoutes) {
    const methods = route.methods.length > 0 ? route.methods.join(", ") : "unknown";
    const notes = route.notes.length > 0 ? route.notes.join("<br>") : "";
    const sourceLink = `[${route.filePath}](${relativeLinkFromReference(route.filePath)})`;
    lines.push(
      `| \`${route.routePath}\` | ${methods} | ${route.auth} | ${route.csrf} | ${route.purpose} | ${sourceLink} | ${notes} |`,
    );
  }

  lines.push("");
  lines.push(`Total routes: **${inventory.apiRoutes.length}**.`);
  lines.push("");

  return `${lines.join("\n")}\n`;
};

const surfaceInfo = (variable: EnvVarDoc, surface: EnvSurface): string => {
  const info = variable.surfaces.find((entry) => entry.surface === surface);
  if (!info) {
    return "-";
  }

  const requiredText = info.required ? "required" : "optional";
  const defaultText = info.defaultValue ? `, default: \`${info.defaultValue}\`` : "";
  return `${requiredText}${defaultText}`;
};

const renderEnvironmentReference = (inventory: DocsInventory): string => {
  const lines = mdHeader("Environment Reference (Generated)", inventory.sources.envSources);

  lines.push("## Variables");
  lines.push("");
  lines.push("| Variable | `.env.example` | Web (`apps/web`) | Worker (`apps/worker`) |");
  lines.push("| --- | --- | --- | --- |");

  for (const variable of inventory.envVars) {
    lines.push(
      `| \`${variable.name}\` | ${surfaceInfo(variable, "env-example")} | ${surfaceInfo(variable, "web")} | ${surfaceInfo(variable, "worker")} |`,
    );
  }

  lines.push("");
  lines.push(`Total variables: **${inventory.envVars.length}**.`);
  lines.push("");

  return `${lines.join("\n")}\n`;
};

const formatKeybindings = (keybindings: CommandKeybindingDoc[]): string => {
  if (keybindings.length === 0) {
    return "-";
  }

  return keybindings
    .map((binding) => (binding.keymap ? `\`${binding.sequence}\` (${binding.keymap})` : `\`${binding.sequence}\``))
    .join("<br>");
};

const renderCommandReference = (inventory: DocsInventory): string => {
  const sources = sortUnique([
    ...inventory.sources.commandSources,
    ...sortUnique(inventory.commands.map((command) => command.source)),
  ]);

  const lines = mdHeader("Command Catalog (Generated)", sources);

  lines.push("## Commands");
  lines.push("");
  lines.push("| Command ID | Title | Category | Scope | Keybindings | Source |");
  lines.push("| --- | --- | --- | --- | --- | --- |");

  for (const command of inventory.commands) {
    const scope = command.scope.map((entry) => `\`${entry}\``).join(", ");
    const sourceLink = `[${command.source}](${relativeLinkFromReference(command.source)})`;
    lines.push(
      `| \`${command.id}\` | ${command.title} | ${command.category} | ${scope} | ${formatKeybindings(command.keybindings)} | ${sourceLink} |`,
    );
  }

  lines.push("");
  lines.push(`Total commands: **${inventory.commands.length}**.`);
  lines.push("");

  return `${lines.join("\n")}\n`;
};

const renderDataModelReference = (inventory: DocsInventory): string => {
  const lines = mdHeader("Data Model Reference (Generated)", inventory.sources.dataModelSources);

  lines.push("## Enums");
  lines.push("");
  lines.push("| DB Enum | Symbol | Values |");
  lines.push("| --- | --- | --- |");

  for (const enumDoc of inventory.dataModel.enums) {
    lines.push(`| \`${enumDoc.dbName}\` | \`${enumDoc.symbol}\` | ${enumDoc.values.map((value) => `\`${value}\``).join(", ")} |`);
  }

  lines.push("");
  lines.push("## Tables");
  lines.push("");
  lines.push("| DB Table | Symbol | Key Fields | Field Count |");
  lines.push("| --- | --- | --- | --- |");

  for (const table of inventory.dataModel.tables) {
    const keyFields = table.fields
      .filter((field) => field.primaryKey || field.referencesOtherTable)
      .map((field) => `\`${field.name}\``)
      .join(", ");

    lines.push(
      `| \`${table.dbName}\` | \`${table.symbol}\` | ${keyFields || "-"} | ${table.fields.length} |`,
    );
  }

  for (const table of inventory.dataModel.tables) {
    lines.push("");
    lines.push(`### ${table.dbName}`);
    lines.push("");
    lines.push(`Source: \`${table.source}\``);
    lines.push("");
    lines.push("| Field | Type | Nullable | PK | FK | Default |");
    lines.push("| --- | --- | --- | --- | --- | --- |");

    for (const field of table.fields) {
      lines.push(
        `| \`${field.name}\` | \`${field.type}\` | ${field.nullable ? "yes" : "no"} | ${field.primaryKey ? "yes" : "no"} | ${field.referencesOtherTable ? "yes" : "no"} | ${field.hasDefault ? "yes" : "no"} |`,
      );
    }
  }

  lines.push("");
  lines.push(`Total tables: **${inventory.dataModel.tables.length}**. Total enums: **${inventory.dataModel.enums.length}**.`);
  lines.push("");

  return `${lines.join("\n")}\n`;
};

export const renderGeneratedDocs = (inventory: DocsInventory): GeneratedDoc[] => [
  {
    path: GENERATED_DOC_RELATIVE_PATHS.apiRoutes,
    content: renderApiReference(inventory),
  },
  {
    path: GENERATED_DOC_RELATIVE_PATHS.environment,
    content: renderEnvironmentReference(inventory),
  },
  {
    path: GENERATED_DOC_RELATIVE_PATHS.commandCatalog,
    content: renderCommandReference(inventory),
  },
  {
    path: GENERATED_DOC_RELATIVE_PATHS.dataModel,
    content: renderDataModelReference(inventory),
  },
];

export const resolveRepoPath = (relativePath: string): string => absolutePath(relativePath);

export const fileExists = async (relativePath: string): Promise<boolean> => {
  try {
    await stat(absolutePath(relativePath));
    return true;
  } catch {
    return false;
  }
};

export const readRepoFile = async (relativePath: string): Promise<string> =>
  normalizeText(await readFile(absolutePath(relativePath), "utf8"));

export const markdownFilesForValidation = async (): Promise<string[]> => {
  const docsFiles = (await listFilesRecursive("docs")).filter((file) => file.endsWith(".md"));
  return ["README.md", ...docsFiles].sort((a, b) => a.localeCompare(b));
};

export interface LinkIssue {
  file: string;
  link: string;
  reason: string;
}

const shouldSkipLink = (link: string): boolean => {
  if (!link) {
    return true;
  }
  if (link.startsWith("http://") || link.startsWith("https://") || link.startsWith("mailto:") || link.startsWith("tel:")) {
    return true;
  }
  if (link.startsWith("#")) {
    return true;
  }
  return false;
};

const splitLink = (link: string): { targetPath: string; anchor: string | null } => {
  const hash = link.indexOf("#");
  if (hash === -1) {
    return { targetPath: link, anchor: null };
  }

  return {
    targetPath: link.slice(0, hash),
    anchor: link.slice(hash + 1),
  };
};

const resolveLinkTarget = (fromFile: string, targetPath: string): string => {
  if (!targetPath) {
    return fromFile;
  }

  if (targetPath.startsWith("/")) {
    return posixPath(targetPath.replace(/^\//, ""));
  }

  const fromDir = path.dirname(fromFile);
  return posixPath(path.normalize(path.join(fromDir, targetPath)));
};

const markdownAnchorFromHeading = (headingText: string): string =>
  headingText
    .trim()
    .toLowerCase()
    .replace(/[`]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const collectAnchors = (content: string): Set<string> => {
  const anchors = new Set<string>();
  for (const line of content.split("\n")) {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    if (!match) {
      continue;
    }

    anchors.add(markdownAnchorFromHeading(match[1]));
  }
  return anchors;
};

export const validateMarkdownLinks = async (): Promise<LinkIssue[]> => {
  const files = await markdownFilesForValidation();
  const fileContent = new Map<string, string>();

  for (const file of files) {
    fileContent.set(file, await readRepoFile(file));
  }

  const issues: LinkIssue[] = [];
  const markdownLinkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;

  for (const [file, content] of fileContent.entries()) {
    for (const match of content.matchAll(markdownLinkPattern)) {
      const rawLink = match[1]?.trim() ?? "";
      if (!rawLink || shouldSkipLink(rawLink)) {
        continue;
      }

      const { targetPath, anchor } = splitLink(rawLink);
      const resolvedPath = resolveLinkTarget(file, targetPath);

      if (!fileContent.has(resolvedPath)) {
        if (await fileExists(resolvedPath)) {
          continue;
        }

        issues.push({
          file,
          link: rawLink,
          reason: `Target file not found: ${resolvedPath}`,
        });
        continue;
      }

      if (anchor) {
        const anchors = collectAnchors(fileContent.get(resolvedPath) ?? "");
        if (!anchors.has(markdownAnchorFromHeading(anchor))) {
          issues.push({
            file,
            link: rawLink,
            reason: `Target anchor not found in ${resolvedPath}`,
          });
        }
      }
    }
  }

  return issues;
};

export const extractCommandSequencesFromSource = async (): Promise<string[]> => {
  const content = await readRepoFile("apps/web/lib/client/commands/inbox-commands.ts");
  return sortUnique([...content.matchAll(/sequence:\s*"([^"]+)"/g)].map((match) => match[1]));
};

export const listApiRouteFiles = async (): Promise<string[]> =>
  (await listFilesRecursive("apps/web/app/api"))
    .filter((file) => file.endsWith("/route.ts"))
    .sort((a, b) => a.localeCompare(b));

export const listEnvNamesFromSource = async (): Promise<string[]> => {
  const names = new Set<string>();
  const envExample = await parseEnvExample();
  for (const key of envExample.keys()) {
    names.add(key);
  }

  for (const entry of await parseZodEnvSchema("apps/web/lib/server/env.ts")) {
    names.add(entry.name);
  }

  for (const entry of await parseZodEnvSchema("apps/worker/src/env.ts")) {
    names.add(entry.name);
  }

  return [...names].sort((a, b) => a.localeCompare(b));
};
