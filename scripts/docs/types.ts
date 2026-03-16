export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export type RouteAuthExpectation = "required" | "optional" | "unknown";
export type RouteCsrfExpectation = "required" | "not-required" | "unknown";

export interface ApiRouteDoc {
  filePath: string;
  routePath: string;
  methods: HttpMethod[];
  purpose: string;
  auth: RouteAuthExpectation;
  csrf: RouteCsrfExpectation;
  notes: string[];
}

export type EnvSurface = "env-example" | "web" | "worker";

export interface EnvSurfaceDoc {
  surface: EnvSurface;
  required: boolean;
  defaultValue: string | null;
  source: string;
}

export interface EnvVarDoc {
  name: string;
  surfaces: EnvSurfaceDoc[];
}

export interface CommandKeybindingDoc {
  sequence: string;
  keymap: string | null;
}

export interface CommandDoc {
  id: string;
  title: string;
  category: string;
  scope: string[];
  keybindings: CommandKeybindingDoc[];
  source: string;
}

export interface DataEnumDoc {
  symbol: string;
  dbName: string;
  values: string[];
  source: string;
}

export interface DataFieldDoc {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  referencesOtherTable: boolean;
  hasDefault: boolean;
}

export interface DataTableDoc {
  symbol: string;
  dbName: string;
  fields: DataFieldDoc[];
  source: string;
}

export interface DocsInventory {
  sources: {
    apiRouteRoot: string;
    envSources: string[];
    commandSources: string[];
    dataModelSources: string[];
  };
  apiRoutes: ApiRouteDoc[];
  envVars: EnvVarDoc[];
  commands: CommandDoc[];
  dataModel: {
    enums: DataEnumDoc[];
    tables: DataTableDoc[];
  };
}

export interface GeneratedDoc {
  path: string;
  content: string;
}
