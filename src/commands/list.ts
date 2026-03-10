// src/commands/list.ts
import { join } from "path";
import { existsSync, readdirSync, readFileSync } from "fs";
import type { Command } from "commander";
import { AGENTS_DIR, loadMcpConfig } from "../lib/config";
import { secretsList, getBackend } from "../lib/secrets";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

export function registerList(program: Command): void {
  program
    .command("list [filter]")
    .description("List configured servers, skills, and secrets (filter: all|servers|skills|secrets)")
    .action(async (filter: string = "all") => {
      const showServers = filter === "all" || filter === "servers";
      const showSkills = filter === "all" || filter === "skills";
      const showSecrets = filter === "all" || filter === "secrets";

      console.log(dim(`Config: ~/.agents/`));

      if (showServers) {
        console.log(`\n${bold("── MCP Servers ──────────────────────────────────────")}`);
        const config = loadMcpConfig();
        const entries = Object.entries(config);
        if (entries.length === 0) {
          console.log(`  ${dim("No servers configured.")}`);
        } else {
          for (const [name, server] of entries) {
            const desc = "transport" in server && server.transport === "http"
              ? cyan(server.url)
              : dim(`${(server as import("../lib/schemas").StdioServer).command} ${((server as import("../lib/schemas").StdioServer).args ?? []).join(" ")}`);
            console.log(`  ${bold(name)}  ${desc}`);
          }
        }
      }

      if (showSkills) {
        console.log(`\n${bold("── Skills ───────────────────────────────────────────")}`);
        const skillsDir = join(AGENTS_DIR, "skills");
        if (!existsSync(skillsDir)) {
          console.log(`  ${dim("No skills directory.")}`);
        } else {
          const skills = readdirSync(skillsDir);
          if (skills.length === 0) {
            console.log(`  ${dim("No skills installed.")}`);
          } else {
            for (const skill of skills) {
              const skillMd = join(skillsDir, skill, "SKILL.md");
              let desc = "";
              if (existsSync(skillMd)) {
                const content = readFileSync(skillMd, "utf-8");
                const m = content.match(/^description:\s*(.+)$/m);
                if (m) desc = dim(m[1]!);
              }
              console.log(`  ${bold(skill)}  ${desc}`);
            }
          }
        }
      }

      if (showSecrets) {
        const backend = getBackend();
        console.log(`\n${bold("── Secrets ──────────────────────────────────────────")}  ${dim(`Backend: ${backend}`)}`);
        const keys = await secretsList();
        if (keys.length === 0) {
          console.log(`  ${dim("No secrets stored.")}`);
        } else {
          for (const k of keys) console.log(`  ${bold(k)}`);
        }
      }

      console.log();
    });
}
