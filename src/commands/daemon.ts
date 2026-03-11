import type { Command } from "commander";
import { existsSync, readFileSync } from "fs";
import { PID_PATH, sendToDaemon } from "../daemon/ipc";

export function registerDaemon(program: Command): void {
  const daemon = program.command("daemon").description("Manage the vakt daemon process");

  daemon.command("start").description("Start the daemon").action(async () => {
    if (existsSync(PID_PATH)) {
      console.log(`Daemon already running (pid ${readFileSync(PID_PATH, "utf-8").trim()})`);
      return;
    }
    const proc = Bun.spawn(
      ["bun", new URL("../daemon/index.ts", import.meta.url).pathname],
      { detached: true, stdio: ["ignore", "ignore", "ignore"] }
    );
    proc.unref();
    await Bun.sleep(400);
    console.log("✓ vakt daemon started");
  });

  daemon.command("stop").description("Stop the daemon").action(() => {
    if (!existsSync(PID_PATH)) { console.log("Daemon not running."); return; }
    const pid = parseInt(readFileSync(PID_PATH, "utf-8"), 10);
    process.kill(pid, "SIGTERM");
    console.log(`✓ Sent SIGTERM to daemon (pid ${pid})`);
  });

  daemon.command("status").description("Show daemon and server status").action(async () => {
    const r = await sendToDaemon({ type: "status" });
    if (!r.ok) { console.log(r.error); return; }
    const d = r.data as { pid: number; servers: Record<string, any> };
    console.log(`\nDaemon running (pid ${d.pid})\n`);
    console.log(`${"SERVER".padEnd(22)} STATUS     PID`);
    console.log("─".repeat(45));
    for (const [name, s] of Object.entries(d.servers)) {
      console.log(`${name.padEnd(22)} ${s.status.padEnd(10)} ${s.pid ?? ""}`);
    }
  });

  daemon.command("logs").description("Tail daemon logs").action(() => {
    console.log("Run: vakt daemon start 2>> ~/.agents/daemon.log");
    console.log("Then: tail -f ~/.agents/daemon.log");
  });
}
