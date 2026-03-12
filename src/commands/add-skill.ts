// src/commands/add-skill.ts
import { join, basename, resolve } from "node:path";
import { existsSync, symlinkSync, mkdirSync } from "node:fs";
import type { Command } from "commander";
import { AGENTS_DIR } from "../lib/config";

const skillsDir = join(AGENTS_DIR, "skills");

export function registerAddSkill(program: Command): void {
  const cmd = program
    .command("add-skill <path> [name]")
    .description("Add a local skill directory or clone from git")
    .action(async (skillPath: string, name?: string) => {
      const isGit = skillPath.startsWith("http") || skillPath.startsWith("git@");

      mkdirSync(skillsDir, { recursive: true });

      if (isGit) {
        const repoName = name ?? basename(skillPath).replace(/\.git$/, "");
        const dest = join(skillsDir, repoName);
        if (existsSync(dest)) { console.log(`Skill '${repoName}' already exists.`); return; }
        const proc = Bun.spawn(["git", "clone", skillPath, dest], { stdout: "inherit", stderr: "inherit" });
        if ((await proc.exited) !== 0) { console.error("git clone failed"); process.exit(1); }
        console.log(`Cloned skill: ${repoName}`);
      } else {
        const abs = resolve(skillPath);
        if (!existsSync(abs)) { console.error(`Path not found: ${abs}`); process.exit(1); }
        const skillName = name ?? basename(abs);
        const dest = join(skillsDir, skillName);
        if (existsSync(dest)) {
          console.log(`Skill '${skillName}' already linked.`);
          return;
        }
        symlinkSync(abs, dest);
        console.log(`Linked skill: ${skillName} → ${abs}`);
      }
      console.log("Run 'vakt sync' to push to providers.");
    });

  cmd.configureOutput({
    outputError(str, write) {
      write(str);
      write(`\nUsage: vakt add-skill <path> [name]\n`);
    },
  });
}
