import { writeFileSync, unlinkSync, existsSync } from "fs";
import { loadMcpConfig, loadAgentConfig } from "../lib/config";
import { AuditStore } from "../lib/audit";
import { ProcessManager } from "./process-manager";
import { SOCKET_PATH, PID_PATH, type DaemonCmd, type DaemonResponse } from "./ipc";

export async function runDaemon(): Promise<void> {
  const mcpConfig   = loadMcpConfig();
  const agentConfig = loadAgentConfig();
  const store       = new AuditStore();
  store.init();
  const pm = new ProcessManager(mcpConfig as any, agentConfig);

  writeFileSync(PID_PATH, process.pid.toString());
  const cleanup = () => {
    if (existsSync(PID_PATH))    unlinkSync(PID_PATH);
    if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);
  };
  process.on("exit", cleanup);
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });

  if (existsSync(SOCKET_PATH)) unlinkSync(SOCKET_PATH);

  Bun.listen({
    unix: SOCKET_PATH,
    socket: {
      async data(socket, data) {
        let response: DaemonResponse;
        try {
          const cmd = JSON.parse(data.toString()) as DaemonCmd;
          response = await handle(cmd, pm, store);
        } catch (e) {
          response = { ok: false, error: String(e) };
        }
        socket.write(JSON.stringify(response));
      },
    },
  });

  console.log(`vakt daemon ready (pid ${process.pid}, socket ${SOCKET_PATH})`);
}

async function handle(cmd: DaemonCmd, pm: ProcessManager, store: AuditStore): Promise<DaemonResponse> {
  switch (cmd.type) {
    case "status":
      return { ok: true, data: { pid: process.pid, servers: pm.listStatuses() } };
    case "servers/list":
      return { ok: true, data: pm.listStatuses() };
    case "servers/restart":
      await pm.restart(cmd.name);
      return { ok: true, data: { restarted: cmd.name } };
    case "audit/query":
      return { ok: true, data: store.query({ serverName: cmd.serverName, limit: cmd.limit }) };
    default:
      return { ok: false, error: "Unknown command" };
  }
}
