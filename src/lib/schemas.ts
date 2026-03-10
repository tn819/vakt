import { z } from "zod";

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

export const AgentConfigSchema = z.object({
  paths: z.record(z.string()).default({
    code: "~/Code",
    documents: "~/Documents",
    vault: "~/Documents/vault",
  }),
  providers: z.array(z.string()).default(["claude", "cursor"]),
  secretsBackend: z.enum(["auto", "keychain", "pass", "env"]).default("auto"),
});

const PropertyMappingSchema = z.object({
  typeProperty: z.string().optional(),
  typeValue: z.string().optional(),
  urlProperty: z.string().optional(),
  headersProperty: z.string().optional(),
  commandProperty: z.string().optional(),
  argsProperty: z.string().optional(),
  envProperty: z.string().optional(),
});

export const ProviderSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  detectCommand: z.string(),
  documentationUrl: z.string().optional(),
  transports: z.array(z.enum(["stdio", "http"])),
  supportedPlatforms: z.array(z.string()),
  configFormat: z.enum(["json", "toml"]),
  syncMethod: z.enum(["file", "cli"]).default("file"),
  additionalImportPaths: z.record(z.array(z.string())).optional(),
  configPath: z.record(z.string()),
  configStructure: z.object({
    serversPropertyName: z.string(),
    httpPropertyMapping: PropertyMappingSchema.optional(),
    stdioPropertyMapping: PropertyMappingSchema.optional(),
  }),
  skills: z.object({
    path: z.union([z.string(), z.record(z.string())]),
    method: z.enum(["symlink", "native"]),
  }),
});

export const ProvidersSchema = z.record(ProviderSchema);

export type StdioServer = z.infer<typeof StdioServerSchema>;
export type HttpServer = z.infer<typeof HttpServerSchema>;
export type McpServer = z.infer<typeof McpServerSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
export type Providers = z.infer<typeof ProvidersSchema>;
