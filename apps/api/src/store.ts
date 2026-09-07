import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Run } from "@mcpsentinel/shared";

export interface StoredRun extends Run {
  manifestHash?: string;
  approvedAt?: string;
}
export class RunStore {
  private db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS run_events (id INTEGER PRIMARY KEY, run_id TEXT NOT NULL, at TEXT NOT NULL, body TEXT NOT NULL);",
    );
  }
  save(run: StoredRun) {
    run.updatedAt = new Date().toISOString();
    const json = JSON.stringify(run);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db
        .prepare(
          "INSERT INTO runs VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        )
        .run(run.id, run.createdAt, json);
      this.db
        .prepare("INSERT INTO run_events(run_id, at, body) VALUES (?, ?, ?)")
        .run(run.id, run.updatedAt, json);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return run;
  }
  get(id: string): StoredRun | undefined {
    const row = this.db.prepare("SELECT body FROM runs WHERE id=?").get(id);
    return row ? JSON.parse(row.body as string) : undefined;
  }
  list(): StoredRun[] {
    return this.db
      .prepare(
        "SELECT body FROM runs ORDER BY created_at DESC, rowid DESC LIMIT 100",
      )
      .all()
      .map((row) => JSON.parse(row.body as string));
  }
  close() {
    this.db.close();
  }
}
