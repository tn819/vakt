import { describe, it, expect } from "bun:test";
import { RegistryClient } from "../../src/lib/registry";

describe("RegistryClient", () => {
  it("builds the correct lookup URL", () => {
    const client = new RegistryClient();
    expect(client.lookupUrl("io.github.modelcontextprotocol/server-github"))
      .toBe("https://registry.modelcontextprotocol.io/v0/servers/io.github.modelcontextprotocol%2Fserver-github");
  });

  it("resolves command and args from an npm package entry", () => {
    const entry = {
      server: {
        name: "io.github.test/server",
        packages: [{
          registryType: "npm",
          identifier: "@modelcontextprotocol/server-github",
          version: "0.6.2",
          runtimeHint: "npx",
          runtimeArguments: [{ value: "-y" }],
          packageArguments: [],
          environmentVariables: [
            { name: "GITHUB_PERSONAL_ACCESS_TOKEN", isSecret: true, isRequired: true },
          ],
        }],
      },
    };
    const resolved = new RegistryClient().resolvePackage(entry as any);
    expect(resolved.command).toBe("npx");
    expect(resolved.args).toContain("-y");
    expect(resolved.args).toContain("@modelcontextprotocol/server-github");
    expect(resolved.requiredSecrets).toContain("GITHUB_PERSONAL_ACCESS_TOKEN");
  });

  it("resolves docker run for an OCI package entry", () => {
    const entry = {
      server: {
        name: "io.example/server",
        packages: [{
          registryType: "oci",
          identifier: "docker.io/example/server:1.0.0",
          environmentVariables: [],
        }],
      },
    };
    const resolved = new RegistryClient().resolvePackage(entry as any);
    expect(resolved.command).toBe("docker");
    expect(resolved.args).toContain("docker.io/example/server:1.0.0");
  });
});

describe("RegistryClient.resolvePackage — error paths", () => {
  it("throws when entry has no packages", () => {
    const entry = { server: { name: "no-pkg" } };
    expect(() => new RegistryClient().resolvePackage(entry as any)).toThrow("No package info");
  });

  it("throws for unsupported registry type", () => {
    const entry = {
      server: {
        name: "exotic",
        packages: [{ registryType: "helm", identifier: "chart/server" }],
      },
    };
    expect(() => new RegistryClient().resolvePackage(entry as any)).toThrow("Unsupported registry type");
  });
});

describe("RegistryClient.lookup", () => {
  it("returns null on 404", async () => {
    const client = new RegistryClient();
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 404 }) as any;
    try {
      expect(await client.lookup("nonexistent/server")).toBeNull();
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("throws on non-404 HTTP error", async () => {
    const client = new RegistryClient();
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 500 }) as any;
    try {
      await expect(client.lookup("bad/server")).rejects.toThrow("Registry 500");
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("returns parsed entry on success", async () => {
    const client = new RegistryClient();
    const payload = { server: { name: "test/server", packages: [] } };
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 }) as any;
    try {
      const result = await client.lookup("test/server");
      expect(result?.server.name).toBe("test/server");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

describe("RegistryClient.search", () => {
  it("returns servers array on success", async () => {
    const client = new RegistryClient();
    const payload = { servers: [{ server: { name: "result/server" } }] };
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify(payload), { status: 200 }) as any;
    try {
      const results = await client.search("test query");
      expect(results).toHaveLength(1);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("returns empty array when servers key is absent", async () => {
    const client = new RegistryClient();
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200 }) as any;
    try {
      expect(await client.search("nothing")).toHaveLength(0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("throws on HTTP error", async () => {
    const client = new RegistryClient();
    const origFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(null, { status: 503 }) as any;
    try {
      await expect(client.search("q")).rejects.toThrow("Registry search failed");
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
