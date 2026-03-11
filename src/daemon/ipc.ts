import { join } from "path";
import { existsSync } from "fs";
import { AGENTS_DIR } from "../lib/config";

export const SOCKET_PATH = join(AGENTS_DIR, "daemon.sock");
export const PID_PATH    = join(AGENTS_DIR, "daemon.pid");

export type DaemonCmd =
  | { type: "status" }
  | { type: "servers/list" }
  | { type: "servers/restart"; name: string }
  | { type: "audit/query"; serverName?: string; limit?: number };

export type DaemonResponse = { ok: true; data: unknown } | { ok: false; error: string };

export async function sendToDaemon(cmd: DaemonCmd): Promise<DaemonResponse> {
  if (!existsSync(SOCKET_PATH)) {
    return { ok: false, error: "Daemon not running. Start with: vakt daemon start" };
  }
  return new Promise((resolve, reject) => {
    void Bun.connect({
      unix: SOCKET_PATH,
      socket: {
        data(_, data) {
          try { resolve(JSON.parse(data.toString()) as DaemonResponse); }
          catch (e) { reject(e); }
        },
        error(_, e) { reject(e); },
        open(s) { s.write(JSON.stringify(cmd)); },
      },
    });
  });
}
