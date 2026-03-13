import { spawnSync } from "node:child_process";

export type VerifyResult =
  | { ok: true; signer: string; source: string }
  | { ok: false; reason: string };

const SAFE_PATH = "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin";

function cmdAvailable(cmd: string): boolean {
  const r = spawnSync("/usr/bin/which", [cmd], { encoding: "utf-8", env: { PATH: SAFE_PATH } });
  return r.status === 0;
}

export function verifyOci(identifier: string): VerifyResult {
  if (!cmdAvailable("cosign")) {
    return { ok: false, reason: "cosign not installed (brew install cosign)" };
  }
  const r = spawnSync("cosign", ["verify", identifier], {
    encoding: "utf-8",
    env: { ...(process.env as Record<string, string>), PATH: SAFE_PATH },
  });
  if (r.status === 0) {
    let signer = "verified";
    try {
      const data = JSON.parse(r.stdout) as unknown[];
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0] as Record<string, unknown>;
        const optional = first["optional"] as Record<string, unknown> | undefined;
        signer = (optional?.["Subject"] as string | undefined) ?? "verified";
      }
    } catch { /* ignore */ }
    return { ok: true, signer, source: "cosign" };
  }
  const reason = ((r.stderr as string) || (r.stdout as string)).trim();
  return { ok: false, reason: `cosign verify failed: ${reason}` };
}

export async function verifyNpm(identifier: string, version?: string): Promise<VerifyResult> {
  // Strip npx flags (e.g. "-y @scope/pkg" → "@scope/pkg")
  const pkg = identifier.replace(/^-y\s+/, "").trim();
  const encoded = pkg.replace(/\//g, "%2F");
  const versionStr = version ? `@${version}` : "";
  const url = `https://registry.npmjs.org/-/npm/v1/attestations/${encoded}${versionStr}`;

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "vakt-verify/1.0.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      if (resp.status === 404) return { ok: false, reason: `No attestations found for ${pkg}` };
      return { ok: false, reason: `npm registry error: HTTP ${resp.status}` };
    }
    const data = (await resp.json()) as { attestations?: Array<{ predicateType?: string; bundleMediaType?: string }> };
    const attestations = data.attestations ?? [];
    if (attestations.length === 0) return { ok: false, reason: `No attestations for ${pkg}` };

    const hasSLSA = attestations.some(
      (a) =>
        (a.predicateType ?? "").toLowerCase().includes("slsa") ||
        (a.bundleMediaType ?? "").toLowerCase().includes("slsa")
    );
    return {
      ok: true,
      signer: hasSLSA ? "npm-registry-slsa" : "npm-registry",
      source: "npm-attestations",
    };
  } catch (e) {
    return { ok: false, reason: `Could not reach npm registry: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function verifyPackage(
  pkgType: "oci" | "npm" | "npx",
  identifier: string,
  version?: string
): Promise<VerifyResult> {
  if (pkgType === "oci") return verifyOci(identifier);
  return verifyNpm(identifier, version);
}
