import type { Command } from "commander";
import { AuditStore } from "../lib/audit";

function parseDuration(s: string): number {
  const m = s.match(/^(\d+)(h|d|w)$/);
  if (!m) return 24 * 3_600_000;
  const n = Number(m[1]);
  const units: Record<string, number> = { h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return n * (units[m[2]!] ?? 3_600_000);
}

export function registerAudit(program: Command): void {
  const audit = program.command("audit").description("Query the local audit log");

  audit
    .command("show")
    .description("Show recent tool calls")
    .option("--server <name>", "filter by server name")
    .option("--last <window>", "time window: 1h, 24h, 7d, 4w", "24h")
    .option("--limit <n>",    "max rows to show", "50")
    .action((opts) => {
      const store = new AuditStore();
      store.init();
      const rows = store.query({
        serverName: opts.server,
        since: Date.now() - parseDuration(opts.last as string),
        limit: Number(opts.limit),
      });

      if (rows.length === 0) {
        console.log("No tool calls found.");
        return;
      }

      const COL_WIDTH = { time: 12, server: 16, tool: 30, policy: 8 };
      console.log(`\n${"TIME".padEnd(COL_WIDTH.time)} ${"SERVER".padEnd(COL_WIDTH.server)} ${"TOOL".padEnd(COL_WIDTH.tool)} ${"POLICY".padEnd(COL_WIDTH.policy)} DUR`);
      console.log("─".repeat(76));

      for (const r of rows) {
        const time   = new Date(r.started_at as number).toISOString().slice(11, 23);
        const policy = r.policy_result === "deny" ? "✗ deny " : "✓ allow";
        const dur    = (r.duration_ms as number) < 1000
          ? `${r.duration_ms}ms`
          : `${((r.duration_ms as number) / 1000).toFixed(1)}s`;
        console.log(
          `${time.padEnd(COL_WIDTH.time)} ${(r.server_name as string).padEnd(COL_WIDTH.server)} ` +
          `${(r.tool_name as string).padEnd(COL_WIDTH.tool)} ${policy.padEnd(COL_WIDTH.policy)} ${dur}`
        );
      }
    });

  audit
    .command("export")
    .description("Export audit log as JSON (pipe to SIEM or OTLP collector)")
    .option("--since <iso-date>", "only events after this date")
    .option("--limit <n>", "max rows", "10000")
    .action((opts) => {
      const store = new AuditStore();
      store.init();
      const since = opts.since ? new Date(opts.since as string).getTime() : 0;
      const rows = store.query({ since, limit: Number(opts.limit) });
      console.log(JSON.stringify(rows, null, 2));
    });
}
