import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { AGENTS_DIR } from "./config";

export function defaultAuditDbPath(): string {
  return join(AGENTS_DIR, "audit.db");
}

export interface SandboxSession {
  id: string;
  provider: string;
  container_id: string;
  image: string | null;
  repo: string | null;
  name: string | null;
  status: string;
  created_at: number;
  closed_at: number | null;
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
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS tool_calls (
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
      )`,
      `CREATE TABLE IF NOT EXISTS sync_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        synced_at   INTEGER NOT NULL,
        providers   TEXT NOT NULL,
        servers     TEXT NOT NULL,
        dry_run     INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_tc_server  ON tool_calls(server_name)`,
      `CREATE INDEX IF NOT EXISTS idx_tc_started ON tool_calls(started_at)`,
      `CREATE TABLE IF NOT EXISTS sandbox_sessions (
        id           TEXT PRIMARY KEY,
        provider     TEXT NOT NULL,
        container_id TEXT NOT NULL,
        image        TEXT,
        repo         TEXT,
        name         TEXT,
        status       TEXT NOT NULL DEFAULT 'running',
        created_at   INTEGER NOT NULL,
        closed_at    INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ss_status ON sandbox_sessions(status)`,
      `CREATE TABLE IF NOT EXISTS routing_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        routed_at   INTEGER NOT NULL,
        backend     TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        tool_count  INTEGER NOT NULL,
        has_code    INTEGER NOT NULL,
        has_math    INTEGER NOT NULL,
        matched_rule INTEGER,
        latency_ms  INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS idx_re_backend ON routing_events(backend)`,
      `CREATE INDEX IF NOT EXISTS idx_re_routed ON routing_events(routed_at)`,
    ]) {
      this.db.prepare(sql).run();
    }
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

  createSession(opts: {
    provider: string;
    containerId: string;
    image?: string;
    repo?: string;
    name?: string;
  }): string {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO sandbox_sessions (id, provider, container_id, image, repo, name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, opts.provider, opts.containerId, opts.image ?? null,
           opts.repo ?? null, opts.name ?? null, Date.now());
    return id;
  }

  getSession(id: string): SandboxSession | null {
    return this.db.prepare(
      "SELECT * FROM sandbox_sessions WHERE id = ?"
    ).get(id) as SandboxSession | null;
  }

  listSessions(opts: { status?: string } = {}): SandboxSession[] {
    if (opts.status) {
      return this.db.prepare(
        "SELECT * FROM sandbox_sessions WHERE status = ? ORDER BY created_at DESC"
      ).all(opts.status) as SandboxSession[];
    }
    return this.db.prepare(
      "SELECT * FROM sandbox_sessions ORDER BY created_at DESC"
    ).all() as SandboxSession[];
  }

  closeSession(id: string): void {
    this.db.prepare(
      "UPDATE sandbox_sessions SET status = 'closed', closed_at = ? WHERE id = ?"
    ).run(Date.now(), id);
  }

  recordRouting(r: {
    backend: string;
    promptTokens: number;
    toolCount: number;
    hasCode: boolean;
    hasMath: boolean;
    matchedRule?: number;
    latencyMs?: number;
  }): void {
    this.db.prepare(
      `INSERT INTO routing_events
       (routed_at, backend, prompt_tokens, tool_count, has_code, has_math, matched_rule, latency_ms)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(
      Date.now(),
      r.backend,
      r.promptTokens,
      r.toolCount,
      r.hasCode ? 1 : 0,
      r.hasMath ? 1 : 0,
      r.matchedRule ?? null,
      r.latencyMs ?? null
    );
  }

  recentRoutingEvents(limit: number): any[] {
    return this.db.prepare(
      "SELECT * FROM routing_events ORDER BY routed_at DESC LIMIT ?"
    ).all(limit) as any[];
  }
}
