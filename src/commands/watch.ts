import type { Command } from "commander";
import { existsSync, mkdirSync, copyFileSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { loadProviders } from "../lib/config";

const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red    = (s: string) => `\x1b[31m${s}\x1b[0m`;
const ok     = (s: string) => console.log(`  ${green("✓")}  ${s}`);
const warn   = (s: string) => console.log(`  ${yellow("⚠")}  ${s}`);
const err    = (s: string) => console.log(`  ${red("✗")}  ${s}`);

function detectWatcher(): "fswatch" | "inotifywait" | null {
  if (spawnSync("which", ["fswatch"], { encoding: "utf-8" }).status === 0) return "fswatch";
  if (spawnSync("which", ["inotifywait"], { encoding: "utf-8" }).status === 0) return "inotifywait";
  return null;
}

function resolveProviderPaths(home: string): string[] {
  let providers;
  try {
    providers = loadProviders();
  } catch {
    return [];
  }

  const plat = process.platform as "darwin" | "linux" | "win32";
  const paths: string[] = [];

  for (const provider of Object.values(providers)) {
    const cp = provider.configPath;
    const rawPath = typeof cp === "string" ? cp : (cp as Record<string, string>)[plat] ?? "";
    if (!rawPath) continue;
    const expanded = rawPath.replace(/^~/, home).replace(/\$HOME/g, home);
    if (existsSync(expanded)) paths.push(expanded);
  }
  return paths;
}

function takeSnapshot(path: string, snapshotDir: string): void {
  const snapName = path.replace(/\//g, "_");
  mkdirSync(snapshotDir, { recursive: true });
  if (existsSync(path)) {
    copyFileSync(path, join(snapshotDir, snapName));
  }
}

function revertFile(path: string, snapshotDir: string): boolean {
  const snapName = path.replace(/\//g, "_");
  const snapshot = join(snapshotDir, snapName);
  if (existsSync(snapshot)) {
    copyFileSync(snapshot, path);
    return true;
  }
  return false;
}

export function registerWatch(program: Command): void {
  program
    .command("watch")
    .description("Monitor provider config files for unauthorized changes")
    .option("--revert", "automatically revert unauthorized changes")
    .option("--alert-only", "log changes but take no action")
    .action(async (opts: { revert?: boolean; alertOnly?: boolean }) => {
      const home = process.env["HOME"] ?? "~";
      const agentsDir = process.env["AGENTS_DIR"] ?? join(home, ".agents");

      if (!existsSync(agentsDir)) {
        console.error("Error: ~/.agents/ not initialized. Run 'vakt init' first.");
        process.exit(1);
      }

      const watcher = detectWatcher();
      if (!watcher) {
        console.error("Error: No file watcher found.");
        console.error("  Install fswatch (macOS): brew install fswatch");
        console.error("  Install inotify-tools (Linux): apt-get install inotify-tools");
        process.exit(1);
      }

      const watchPaths = resolveProviderPaths(home);
      if (watchPaths.length === 0) {
        warn("No provider config files found to watch");
        process.exit(0);
      }

      const snapshotDir = join(agentsDir, ".snapshots");
      for (const p of watchPaths) takeSnapshot(p, snapshotDir);

      console.log("");
      console.log(bold("vakt watch"));
      console.log(`  watcher: ${watcher}`);
      console.log(`  watching: ${watchPaths.length} provider config file(s)`);
      if (opts.revert) console.log(`  mode: auto-revert`);
      else if (opts.alertOnly) console.log(`  mode: alert only`);
      else console.log(`  mode: log`);
      console.log("");
      console.log("  Press Ctrl+C to stop.");
      console.log("");

      const watchArgs =
        watcher === "fswatch"
          ? ["--one-event", "--event=Updated", "--event=Created", "--event=Removed", ...watchPaths]
          : ["-m", "-r", ...watchPaths, "--event", "MODIFY,CREATE,DELETE"];

      const proc = Bun.spawn([watcher, ...watchArgs], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const auditLog = join(agentsDir, "audit.log");

      const reader = proc.stdout.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const changedPath = line.trim();
          if (!changedPath) continue;
          if (!watchPaths.some((p) => changedPath.includes(p))) continue;

          const timestamp = new Date().toISOString();
          const logLine = `${timestamp} DRIFT_DETECTED path=${changedPath}\n`;
          appendFileSync(auditLog, logLine);

          err(`drift detected: ${changedPath}`);

          if (opts.revert) {
            const reverted = revertFile(changedPath, snapshotDir);
            if (reverted) ok(`reverted: ${changedPath}`);
            else warn(`no snapshot available for: ${changedPath}`);
          }
        }
      }

      // Suppress unused variable warning
      void ok;
      void dirname;
    });
}
