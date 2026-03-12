import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENTS_DIR } from "./config";

export function defaultAuditDbPath(): string {
  return join(AGENTS_DIR, "audit.db");
}

export interface ToolCallRecord {
  sessionId: string;
  serverName: string;
  toolName: string;
  runtime: string;
  provider: string;
  policyResult: string;
  policyRule?: string;
  startedAt: number;
  endedAt: number;
  responseOk: boolean;
  errorCode?: string;
}

export class AuditStore {
  private db: Database;

  constructor(dbPath: string = defaultAuditDbPath()) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id   TEXT,
        server_name  TEXT NOT NULL,
        tool_name    TEXT NOT NULL,
        runtime      TEXT,
        provider     TEXT,
        policy_result TEXT,
        policy_rule  TEXT,
        started_at   INTEGER NOT NULL,
        ended_at     INTEGER,
        duration_ms  INTEGER,
        response_ok  INTEGER,
        error_code   TEXT
      );
      CREATE TABLE IF NOT EXISTS sync_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        synced_at   INTEGER NOT NULL,
        providers   TEXT NOT NULL,
        servers     TEXT NOT NULL,
        dry_run     INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tc_server  ON tool_calls(server_name);
      CREATE INDEX IF NOT EXISTS idx_tc_started ON tool_calls(started_at);
    `);
  }

  recordToolCall(r: ToolCallRecord): void {
    this.db.prepare(`
      INSERT INTO tool_calls
        (session_id, server_name, tool_name, runtime, provider, policy_result,
         policy_rule, started_at, ended_at, duration_ms, response_ok, error_code)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      r.sessionId, r.serverName, r.toolName, r.runtime, r.provider,
      r.policyResult, r.policyRule ?? null,
      r.startedAt, r.endedAt, r.endedAt - r.startedAt,
      r.responseOk ? 1 : 0, r.errorCode ?? null
    );
  }

  query(opts: { serverName?: string; since?: number; limit?: number } = {}): any[] {
    const conds: string[] = [];
    const params: import("bun:sqlite").SQLQueryBindings[] = [];
    if (opts.serverName) { conds.push("server_name = ?"); params.push(opts.serverName); }
    if (opts.since)      { conds.push("started_at >= ?"); params.push(opts.since); }
    const where = conds.length ? `WHERE ${conds.join(" AND ")}` : "";
    params.push(opts.limit ?? 100);
    return this.db.prepare(
      `SELECT * FROM tool_calls ${where} ORDER BY started_at DESC LIMIT ?`
    ).all(...params) as any[];
  }

  recordSync(r: { providers: string[]; servers: string[]; dryRun: boolean }): void {
    this.db.prepare(
      "INSERT INTO sync_events (synced_at, providers, servers, dry_run) VALUES (?,?,?,?)"
    ).run(Date.now(), JSON.stringify(r.providers), JSON.stringify(r.servers), r.dryRun ? 1 : 0);
  }

  recentSyncs(limit: number): any[] {
    return this.db.prepare(
      "SELECT * FROM sync_events ORDER BY synced_at DESC LIMIT ?"
    ).all(limit) as any[];
  }
}
