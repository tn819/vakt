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
