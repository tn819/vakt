import type { Command } from "commander";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { loadAgentConfig } from "../lib/config";
import { SkillsIndexSchema, type SkillsIndexEntry } from "../lib/schemas";

const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const ok     = (s: string) => console.log(`  ${green("✓")}  ${s}`);
const warn   = (s: string) => console.log(`  ${yellow("⚠")}  ${s}`);
const info   = (s: string) => console.log(`  ${cyan("→")}  ${s}`);

async function fetchIndex(indexUrl: string, token?: string): Promise<SkillsIndexEntry[] | null> {
  const headers: Record<string, string> = { "User-Agent": "vakt-skills/1.0.0" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const resp = await fetch(indexUrl, { headers, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) {
      console.error(`Error fetching skills index: HTTP ${resp.status}`);
      return null;
    }
    const raw = await resp.json();
    const parsed = SkillsIndexSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(`Invalid skills index format: ${parsed.error.issues[0]?.message}`);
      return null;
    }
    return parsed.data.skills;
  } catch (e) {
    console.error(`Could not reach skills registry: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

function searchSkills(skills: SkillsIndexEntry[], query: string): SkillsIndexEntry[] {
  const q = query.toLowerCase();
  return skills.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q) ||
      (s.tags ?? []).some((t) => t.toLowerCase().includes(q))
  );
}

function installSkill(entry: SkillsIndexEntry, targetDir: string): boolean {
  const dest = join(targetDir, entry.name);
  if (existsSync(dest)) {
    warn(`'${entry.name}' already installed at ${dest}`);
    info(`To update: rm -rf ${dest} && vakt registry skills install ${entry.name}`);
    return false;
  }
  mkdirSync(targetDir, { recursive: true });

  if (entry.type === "git") {
    if (!entry.url.startsWith("https://")) {
      console.error(`Rejected: skill URL must use https:// (got: ${entry.url})`);
      return false;
    }
    info(`Cloning ${entry.name} from ${entry.url}...`);
    const r = spawnSync("git", ["clone", "--depth", "1", entry.url, dest], {
      encoding: "utf-8",
      stdio: "inherit",
    });
    if (r.status !== 0) {
      console.error(`Failed to clone ${entry.name}`);
      return false;
    }
    ok(`installed: ${entry.name} → ${dest}`);
    return true;
  }

  // archive type — not implemented yet
  console.error(`Unsupported skill type: ${entry.type}`);
  return false;
}

export function registerRegistry(program: Command): void {
  const registry = program.command("registry").description("Skills registry management");

  const skills = registry.command("skills").description("Manage skills from registry");

  skills
    .command("list")
    .description("List all available skills in the registry")
    .action(async () => {
      let cfg;
      try { cfg = loadAgentConfig(); } catch (e) {
        console.error(`Error loading config: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
      const registryCfg = cfg.skills?.registry;
      if (!registryCfg?.url) {
        console.error("No skills.registry.url configured.");
        console.error("Set it with: vakt config set skills.registry.url https://example.com/skills-index.json");
        process.exit(1);
      }
      const entries = await fetchIndex(registryCfg.url, registryCfg.token);
      if (!entries) process.exit(1);
      console.log("");
      console.log(bold("Available skills"));
      console.log("");
      for (const s of entries) {
        console.log(`  ${bold(s.name)}  ${dim(`v${s.version ?? "?"}`)}  ${s.description ?? ""}`);
        if (s.tags?.length) console.log(`    ${dim("tags:")} ${s.tags.join(", ")}`);
      }
      console.log("");
    });

  skills
    .command("search <query>")
    .description("Search skills by name, description, or tag")
    .action(async (query: string) => {
      let cfg;
      try { cfg = loadAgentConfig(); } catch (e) {
        console.error(`Error loading config: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
      const registryCfg = cfg.skills?.registry;
      if (!registryCfg?.url) {
        console.error("No skills.registry.url configured.");
        process.exit(1);
      }
      const entries = await fetchIndex(registryCfg.url, registryCfg.token);
      if (!entries) process.exit(1);
      const results = searchSkills(entries, query);
      console.log("");
      if (results.length === 0) {
        warn(`No skills found matching '${query}'`);
      } else {
        console.log(bold(`Skills matching '${query}'`));
        console.log("");
        for (const s of results) {
          console.log(`  ${bold(s.name)}  ${dim(`v${s.version ?? "?"}`)}  ${s.description ?? ""}`);
        }
      }
      console.log("");
    });

  skills
    .command("install <name>")
    .description("Install a skill from the registry")
    .action(async (name: string) => {
      const home = process.env["HOME"] ?? "~";
      const agentsDir = process.env["AGENTS_DIR"] ?? join(home, ".agents");
      let cfg;
      try { cfg = loadAgentConfig(); } catch (e) {
        console.error(`Error loading config: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
      const registryCfg = cfg.skills?.registry;
      if (!registryCfg?.url) {
        console.error("No skills.registry.url configured.");
        process.exit(1);
      }
      const entries = await fetchIndex(registryCfg.url, registryCfg.token);
      if (!entries) process.exit(1);
      const entry = entries.find((s) => s.name === name);
      if (!entry) {
        console.error(`Skill '${name}' not found in registry.`);
        process.exit(1);
      }
      const targetDir = join(agentsDir, "skills");
      const installed = installSkill(entry, targetDir);
      if (!installed) process.exit(1);
      info("Run 'vakt sync --skills-only' to link this skill to all providers");
    });
}
