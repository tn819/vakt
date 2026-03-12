import { z } from "zod";

// ── Platform ─────────────────────────────────────────────────────────────────

export const PLATFORMS = ["darwin", "linux", "win32"] as const;
export type PlatformKey = typeof PLATFORMS[number];

/** A record keyed by known OS platform names (at least one must be present). */
const PlatformStringMapSchema = z
  .object({
    darwin: z.string().optional(),
    linux: z.string().optional(),
    win32: z.string().optional(),
  })
  .refine((m) => Object.values(m).some(Boolean), {
    message: "At least one platform entry is required",
  });

/** Same as PlatformStringMapSchema but values are arrays of strings. */
const PlatformStringArrayMapSchema = z.object({
  darwin: z.array(z.string()).optional(),
  linux: z.array(z.string()).optional(),
  win32: z.array(z.string()).optional(),
});

// ── MCP servers ──────────────────────────────────────────────────────────────

export const StdioServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
});

export const HttpServerSchema = z.object({
  transport: z.literal("http"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});

export const McpServerSchema = z.union([StdioServerSchema, HttpServerSchema]);

export const McpConfigSchema = z.record(McpServerSchema);

// ── Raw provider config files ─────────────────────────────────────────────────
// Schema for a single server entry as it appears in a provider's config file
// (before normalisation to McpServer). Fields are a superset of all known
// provider formats; unknown fields are passed through via .passthrough().

export const RawProviderServerSchema = z
  .object({
    // Stdio fields
    command: z.union([z.string(), z.array(z.string())]).optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    cwd: z.string().optional(),
    // HTTP fields — various provider conventions
    url: z.string().optional(),
    httpUrl: z.string().optional(),
    serverUrl: z.string().optional(),
    headers: z.record(z.string()).optional(),
    // Type discriminator used by some providers (e.g. "http", "local", "remote")
    type: z.string().optional(),
  })
  .passthrough();

export type RawProviderServer = z.infer<typeof RawProviderServerSchema>;

// ── Agent config ─────────────────────────────────────────────────────────────

export const AgentConfigSchema = z.object({
  paths: z.record(z.string()).default({
    code: "~/Code",
    documents: "~/Documents",
    vault: "~/Documents/vault",
  }),
  providers: z.array(z.string()).default(["claude", "cursor"]),
  secretsBackend: z.enum(["auto", "keychain", "pass", "env"]).default("auto"),
  otel: z.object({
    endpoint: z.string().optional(),
    enabled:  z.boolean().default(true),
  }).optional(),
  runtime: z.object({
    default: z.enum(["local", "e2b"]).default("local"),
    servers: z.record(z.string(), z.enum(["local", "e2b"])).optional(),
    e2b: z.object({
      api_key:  z.string(),
      template: z.string().optional(),
    }).optional(),
  }).optional(),
});

// ── Provider registry ─────────────────────────────────────────────────────────

const PropertyMappingSchema = z
  .object({
    typeProperty: z.string().optional(),
    typeValue: z.string().optional(),
    urlProperty: z.string().optional(),
    headersProperty: z.string().optional(),
    commandProperty: z.string().optional(),
    argsProperty: z.string().optional(),
    envProperty: z.string().optional(),
  })
  .refine(
    (m) => m.typeValue === undefined || m.typeProperty !== undefined,
    { message: "typeValue requires typeProperty" }
  );

export const ProviderSchema = z
  .object({
    id: z.string(),
    displayName: z.string(),
    detectCommand: z.string(),
    documentationUrl: z.string().optional(),
    transports: z.array(z.enum(["stdio", "http"])),
    supportedPlatforms: z.array(z.enum(PLATFORMS)),
    /** File format of the provider's config file. */
    configFormat: z.enum(["json", "toml"]),
    /** How to write MCP config during sync. Defaults to "file". */
    syncMethod: z.enum(["file", "cli"]).default("file"),
    /** Primary config file path, keyed by platform. */
    configPath: PlatformStringMapSchema,
    /** Extra paths to scan during import only (e.g. alternate user config locations). */
    additionalImportPaths: PlatformStringArrayMapSchema.optional(),
    configStructure: z.object({
      serversPropertyName: z.string(),
      httpPropertyMapping: PropertyMappingSchema.optional(),
      stdioPropertyMapping: PropertyMappingSchema.optional(),
    }),
    skills: z.object({
      path: z.union([z.string(), PlatformStringMapSchema]),
      method: z.enum(["symlink", "native"]),
    }),
  })
  .refine(
    (p) => p.syncMethod !== "cli" || p.configFormat === "json",
    { message: "syncMethod 'cli' is only valid with configFormat 'json'" }
  );

export const ProvidersSchema = z.record(ProviderSchema);

export type StdioServer = z.infer<typeof StdioServerSchema>;
export type HttpServer = z.infer<typeof HttpServerSchema>;
export type McpServer = z.infer<typeof McpServerSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type Providers = z.infer<typeof ProvidersSchema>;

// ── Policy ───────────────────────────────────────────────────────────────────

export type PolicyResult = "allow" | "deny" | "ask";
export type RegistryPolicy = "allow-unverified" | "warn-unverified" | "registry-only";

export const PolicyServerRulesSchema = z.object({
  tools: z.object({
    allow: z.array(z.string()).optional(),
    deny:  z.array(z.string()).optional(),
  }).optional(),
  paths: z.object({
    allow: z.array(z.string()).optional(),
    deny:  z.array(z.string()).optional(),
  }).optional(),
});

export const PolicySchema = z.object({
  version:        z.literal("1"),
  default:        z.enum(["allow", "deny", "ask"]),
  registryPolicy: z.enum(["allow-unverified", "warn-unverified", "registry-only"])
    .default("allow-unverified"),
  servers: z.record(z.string(), PolicyServerRulesSchema).optional(),
});

export type PolicyServerRules = z.infer<typeof PolicyServerRulesSchema>;
export type Policy = z.infer<typeof PolicySchema>;
