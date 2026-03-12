const REGISTRY_BASE = "https://registry.modelcontextprotocol.io";

interface RegistryPackage {
  registryType: "npm" | "oci";
  identifier: string;
  version?: string;
  runtimeHint?: string;
  runtimeArguments?: Array<{ value: string }>;
  packageArguments?: Array<{ value: string }>;
  environmentVariables?: Array<{ name: string; isSecret?: boolean; isRequired?: boolean }>;
}

export interface RegistryEntry {
  server: {
    name: string;
    description?: string;
    version?: string;
    packages?: RegistryPackage[];
    remotes?: Array<{ type: string; url: string }>;
  };
}

export interface ResolvedPackage {
  command: string;
  args: string[];
  requiredSecrets: string[];
}

export class RegistryClient {
  lookupUrl(id: string): string {
    return `${REGISTRY_BASE}/v0/servers/${encodeURIComponent(id)}`;
  }

  async lookup(id: string): Promise<RegistryEntry | null> {
    const res = await fetch(this.lookupUrl(id));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Registry ${res.status}: ${id}`);
    return res.json() as Promise<RegistryEntry>;
  }

  async search(query: string, limit = 10): Promise<RegistryEntry[]> {
    const res = await fetch(
      `${REGISTRY_BASE}/v0/servers?q=${encodeURIComponent(query)}&limit=${limit}`,
    );
    if (!res.ok) throw new Error(`Registry search failed: ${res.status}`);
    const data = await res.json() as { servers?: RegistryEntry[] };
    return data.servers ?? [];
  }

  resolvePackage(entry: RegistryEntry): ResolvedPackage {
    const pkg = entry.server.packages?.[0];
    if (!pkg) throw new Error(`No package info for ${entry.server.name}`);

    const requiredSecrets = (pkg.environmentVariables ?? [])
      .filter(v => v.isSecret)
      .map(v => v.name);

    if (pkg.registryType === "npm") {
      return {
        command: pkg.runtimeHint ?? "npx",
        args: [
          ...(pkg.runtimeArguments ?? []).map(a => a.value),
          pkg.identifier,
          ...(pkg.packageArguments ?? []).map(a => a.value),
        ],
        requiredSecrets,
      };
    }

    if (pkg.registryType === "oci") {
      return {
        command: "docker",
        args: ["run", "--rm", "-i", pkg.identifier],
        requiredSecrets,
      };
    }

    throw new Error(`Unsupported registry type: ${pkg.registryType}`);
  }
}
