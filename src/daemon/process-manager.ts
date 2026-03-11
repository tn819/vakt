import type { McpConfig, AgentConfig } from "../lib/schemas";

export type ServerStatus = {
  status: "stopped" | "starting" | "running" | "crashed";
  pid?: number;
  restarts: number;
  lastStartedAt?: number;
};

export class ProcessManager {
  private statuses: Record<string, ServerStatus> = {};
  private procs: Record<string, ReturnType<typeof Bun.spawn>> = {};

  constructor(
    private mcpConfig: McpConfig,
    private _agentConfig: AgentConfig | Record<string, never>
  ) {
    for (const name of Object.keys(mcpConfig)) {
      this.statuses[name] = { status: "stopped", restarts: 0 };
    }
  }

  listStatuses(): Record<string, ServerStatus> {
    return { ...this.statuses };
  }

  async start(name: string): Promise<void> {
    const server = this.mcpConfig[name] as any;
    if (!server?.command) throw new Error(`No command configured for server: ${name}`);

    this.statuses[name] = { ...this.statuses[name]!, status: "starting" };

    const proc = Bun.spawn([server.command as string, ...(server.args as string[] ?? [])], {
      stdin: "pipe", stdout: "pipe", stderr: "pipe",
      env: { ...process.env, ...(server.env as Record<string, string> ?? {}) },
    });

    this.procs[name] = proc;
    this.statuses[name] = {
      status: "running",
      pid: proc.pid,
      restarts: this.statuses[name]?.restarts ?? 0,
      lastStartedAt: Date.now(),
    };

    // Auto-restart on unexpected exit
    void proc.exited.then((code) => {
      if (code !== 0 && this.statuses[name]?.status === "running") {
        this.statuses[name]!.status = "crashed";
        this.statuses[name]!.restarts += 1;
        setTimeout(() => { void this.start(name).catch(console.error); }, 2_000);
      }
    });
  }

  async stop(name: string): Promise<void> {
    this.procs[name]?.kill();
    delete this.procs[name];
    if (this.statuses[name]) this.statuses[name]!.status = "stopped";
  }

  async restart(name: string): Promise<void> {
    await this.stop(name);
    await this.start(name);
  }

  getProcess(name: string) { return this.procs[name] ?? null; }
}
