// src/commands/upgrade.ts
import { dirname } from "path";
import { existsSync } from "fs";
import type { Command } from "commander";

export function registerUpgrade(program: Command): void {
  program
    .command("upgrade")
    .description("Upgrade to the latest version")
    .action(async () => {
      const scriptDir = dirname(import.meta.path);
      const repoRoot = dirname(scriptDir);
      if (existsSync(`${repoRoot}/.git`)) {
        console.log("Upgrading via git pull...");
        const proc = Bun.spawn(["git", "-C", repoRoot, "pull"], { stdout: "inherit", stderr: "inherit" });
        await proc.exited;
        console.log("Done.");
      } else {
        console.log("Manual upgrade required. Visit: https://github.com/tn819/vakt");
      }
    });
}
