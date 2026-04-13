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
  global: z.boolean().default(false),
});

export const HttpServerSchema = z.object({
  transport: z.literal("http"),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  global: z.boolean().default(false),
});

export const McpServerSchema = z.union([StdioServerSchema, HttpServerSchema]);

export const McpConfigSchema = z.preprocess(
  (input) => {
    if (input !== null && typeof input === "object" && !Array.isArray(input)) {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>).filter(([k]) => !k.startsWith("_"))
      );
    }
    return input;
  },
  z.record(McpServerSchema)
);

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


// ── Remote config ─────────────────────────────────────────────────────────────

export const RemoteConfigSchema = z.object({
  url: z.string(),
  token: z.string().optional(),
  autoSync: z.boolean().default(false),
});

export type RemoteConfig = z.infer<typeof RemoteConfigSchema>;

// ── Skills registry config ────────────────────────────────────────────────────

export const SkillsRegistryConfigSchema = z.object({
  url: z.string(),
  token: z.string().optional(),
});

export const SkillsIndexEntrySchema = z.object({
  name: z.string(),
  url: z.string(),
  type: z.enum(["git", "archive"]).default("git"),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  version: z.string().optional(),
});

export const SkillsIndexSchema = z.object({
  version: z.literal("1"),
  skills: z.array(SkillsIndexEntrySchema),
});

export type SkillsIndexEntry = z.infer<typeof SkillsIndexEntrySchema>;

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
    default: z.enum(["local", "e2b", "docker"]).default("local"),
    servers: z.record(z.string(), z.enum(["local", "e2b", "docker"])).optional(),
    e2b: z.object({
      api_key:  z.string(),
      template: z.string().optional(),
    }).optional(),
    docker: z.object({
      socket:  z.string().default("/var/run/docker.sock"),
      image:   z.string().default("node:20-slim"),
      memory:  z.string().optional(),
      cpus:    z.string().optional(),
      network: z.enum(["none", "bridge"]).default("none"),
    }).optional(),
  }).optional(),
  remote: RemoteConfigSchema.optional(),
  skills: z.object({
    registry: SkillsRegistryConfigSchema.optional(),
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
    /**
     * How MCP servers are stored in the config file.
     * "record" (default): keyed object { "server-name": { ... } }
     * "array": array of tables with an injected "name" field [{ name: "server-name", ... }]
     */
    serversFormat: z.enum(["record", "array"]).default("record"),
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
    /**
     * Path to the provider's native permissions config file, keyed by platform.
     * When present and policy.tools is non-empty, vakt sync writes a managed
     * block to this file. Absent = no permissions-file target for this provider.
     */
    permissionsPath: PlatformStringMapSchema.optional(),
    /**
     * Format of the permissions config file.
     * "claude-settings" — ~/.claude/settings.json permissions.allow/deny arrays.
     */
    permissionsFormat: z.enum(["claude-settings"]).optional(),
  })
  .refine(
    (p) => p.syncMethod !== "cli" || p.configFormat === "json",
    { message: "syncMethod 'cli' is only valid with configFormat 'json'" }
  )
  .refine(
    (p) => (p.permissionsPath === undefined) === (p.permissionsFormat === undefined),
    { message: "permissionsPath and permissionsFormat must both be set or both be absent" }
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

/**
 * Canonical list of Claude Code built-in tool names.
 * Source: https://code.claude.com/docs/en/permissions#permission-rule-syntax
 * Verified: 2026-03-17
 *
 * Run `bun run check:tool-enum` to detect drift against the live docs.
 */
export const KNOWN_TOOLS = [
  "Agent",
  "Bash",
  "Edit",
  "Glob",
  "Grep",
  "LS",
  "NotebookEdit",
  "NotebookRead",
  "Read",
  "TodoRead",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "Write",
] as const;


/**
 * A permission rule entry in the format `ToolName` or `ToolName(specifier)`.
 *
 * Known tools are validated against KNOWN_TOOLS; unknown tools (new Claude Code
 * releases) pass through as `{ tool: string; specifier?: string }` with a
 * warning emitted at sync time rather than a hard parse error.
 *
 * Specifier format is tool-specific per the Claude Code docs:
 *   Bash       — command glob, e.g. `git *`
 *   Read/Edit/Write — gitignore-style path, e.g. `~/.env`, `/src/**`
 *   WebFetch   — domain prefix, e.g. `domain:github.com`
 *   Agent      — subagent name, e.g. `Explore`
 *
 * MCP tool rules (`mcp__*`) belong in `policy.servers`, not `policy.tools`.
 */
const TOOL_PERMISSION_RE = /^([A-Z][A-Za-z0-9]*)(?:\((.+)\))?$/;

export const ToolPermissionSchema = z
  .string()
  .refine(
    (s) => TOOL_PERMISSION_RE.test(s),
    { message: 'Must be "ToolName" or "ToolName(specifier)" — e.g. "Bash(git *)" or "Read(~/.env)"' }
  )
  .refine(
    (s) => !s.toLowerCase().startsWith("mcp__"),
    { message: 'MCP tool rules (mcp__*) belong in policy.servers, not policy.tools' }
  )
  .transform((s): ToolPermission => {
    const m = TOOL_PERMISSION_RE.exec(s)!;
    const tool = m[1]!;
    const specifier = m[2];
    return specifier === undefined ? { tool } : { tool, specifier };
  });

export type ToolPermission = { tool: string; specifier?: string };

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
  /**
   * Top-level tool permissions written to provider-specific permission files
   * during `vakt sync` (e.g. ~/.claude/settings.json for Claude Code).
   * Providers without a native permissions config receive a sync-time notice.
   */
  tools: z.object({
    allow: z.array(ToolPermissionSchema).optional(),
    deny:  z.array(ToolPermissionSchema).optional(),
  }).optional(),
  skills: z.object({
    /**
     * Unscoped skills (no `allowed-tools`) become gate errors instead of warnings.
     */
    scopeRequired: z.boolean().default(false),
    /**
     * When false, unscoped skills are silently allowed (no warning or error).
     * Useful when installing third-party skills that intentionally omit allowed-tools.
     * Default: true (unscoped skills produce a warning).
     */
    warnUnscoped: z.boolean().default(true),
    /**
     * Skills with static hazard findings (curl-pipe-sh, eval-exec, etc.)
     * become gate errors instead of warnings.
     */
    blockOnHazards: z.boolean().default(false),
  }).optional(),
  _meta: z.object({
    lockedKeys: z.array(z.string()).optional(),
  }).optional(),
});

export type PolicyServerRules = z.infer<typeof PolicyServerRulesSchema>;
export type Policy = z.infer<typeof PolicySchema>;
