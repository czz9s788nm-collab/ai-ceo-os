import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";

export class WorkbenchStore {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'owner',
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'P1',
        business TEXT NOT NULL DEFAULT '总控',
        due_at TEXT,
        start_at TEXT,
        progress INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_records_owner_type_updated
      ON records(owner_id, type, updated_at DESC);
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        schedule_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        repeat_rule TEXT NOT NULL DEFAULT 'none',
        reminder_minutes INTEGER NOT NULL DEFAULT 10,
        auto_rollover INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        business TEXT NOT NULL DEFAULT '老板总控',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_schedules_owner_date
      ON schedules(owner_id, schedule_date, start_time);
    `);
  }

  close() {
    this.db.close();
  }

  ownerExists() {
    return Boolean(this.db.prepare("SELECT 1 FROM users WHERE role = 'owner' LIMIT 1").get());
  }

  async createOwner(username, passwordHash) {
    if (this.ownerExists()) throw new Error("owner already exists");
    const now = new Date().toISOString();
    const result = this.db.prepare("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, 'owner', ?)").run(username, passwordHash, now);
    return { id: Number(result.lastInsertRowid), username, role: "owner" };
  }

  findUserByUsername(username) {
    return this.db.prepare("SELECT id, username, password_hash AS passwordHash, role FROM users WHERE username = ?").get(username) ?? null;
  }

  createSession(userId, token, maxAgeSeconds = 60 * 60 * 24 * 14) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + maxAgeSeconds * 1000).toISOString();
    this.db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .run(hashToken(token), userId, expiresAt, now.toISOString());
    return { expiresAt, maxAgeSeconds };
  }

  findUserBySession(token) {
    if (!token) return null;
    return this.db.prepare(`
      SELECT users.id, users.username, users.role
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `).get(hashToken(token), new Date().toISOString()) ?? null;
  }

  deleteSession(token) {
    if (!token) return false;
    return this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token)).changes === 1;
  }

  createRecord(ownerId, input) {
    const title = String(input.title ?? "").trim();
    if (!title) throw new Error("title is required");
    const now = new Date().toISOString();
    const values = {
      type: String(input.type ?? "task"),
      title,
      description: String(input.description ?? ""),
      status: String(input.status ?? "pending"),
      priority: String(input.priority ?? "P1"),
      business: String(input.business ?? "总控"),
      dueAt: input.dueAt ? String(input.dueAt) : null,
      startAt: input.startAt ? String(input.startAt) : null,
      progress: clampProgress(input.progress),
    };
    const result = this.db.prepare(`
      INSERT INTO records (owner_id, type, title, description, status, priority, business, due_at, start_at, progress, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ownerId, values.type, values.title, values.description, values.status, values.priority, values.business, values.dueAt, values.startAt, values.progress, now, now);
    return this.getRecord(ownerId, Number(result.lastInsertRowid));
  }

  listRecords(ownerId, type = null) {
    const statement = type
      ? this.db.prepare(`${recordSelect} WHERE owner_id = ? AND type = ? ORDER BY updated_at DESC, id DESC`)
      : this.db.prepare(`${recordSelect} WHERE owner_id = ? ORDER BY updated_at DESC, id DESC`);
    return type ? statement.all(ownerId, type) : statement.all(ownerId);
  }

  getRecord(ownerId, id) {
    return this.db.prepare(`${recordSelect} WHERE owner_id = ? AND id = ?`).get(ownerId, id) ?? null;
  }

  updateRecord(ownerId, id, changes) {
    const current = this.getRecord(ownerId, id);
    if (!current) return null;
    const next = { ...current, ...changes, progress: "progress" in changes ? clampProgress(changes.progress) : current.progress };
    next.title = String(next.title).trim();
    if (!next.title) throw new Error("title is required");
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE records SET type = ?, title = ?, description = ?, status = ?, priority = ?, business = ?, due_at = ?, start_at = ?, progress = ?, updated_at = ?
      WHERE id = ? AND owner_id = ?
    `).run(next.type, next.title, next.description ?? "", next.status, next.priority, next.business, next.dueAt ?? null, next.startAt ?? null, next.progress, now, id, ownerId);
    return this.getRecord(ownerId, id);
  }

  deleteRecord(ownerId, id) {
    return this.db.prepare("DELETE FROM records WHERE id = ? AND owner_id = ?").run(id, ownerId).changes === 1;
  }

  createSchedule(ownerId, input) {
    const values = normalizeSchedule(input);
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      INSERT INTO schedules (owner_id, title, description, schedule_date, start_time, end_time, repeat_rule, reminder_minutes, auto_rollover, status, business, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ownerId, values.title, values.description, values.scheduleDate, values.startTime, values.endTime, values.repeatRule, values.reminderMinutes, values.autoRollover ? 1 : 0, values.status, values.business, now, now);
    return this.getSchedule(ownerId, Number(result.lastInsertRowid));
  }

  listSchedules(ownerId, from = null, to = null) {
    if (from && to) return this.db.prepare(`${scheduleSelect} WHERE owner_id = ? AND schedule_date <= ? ORDER BY schedule_date, start_time`).all(ownerId, to);
    return this.db.prepare(`${scheduleSelect} WHERE owner_id = ? ORDER BY schedule_date, start_time`).all(ownerId);
  }

  getSchedule(ownerId, id) {
    return this.db.prepare(`${scheduleSelect} WHERE owner_id = ? AND id = ?`).get(ownerId, id) ?? null;
  }

  updateSchedule(ownerId, id, changes) {
    const current = this.getSchedule(ownerId, id);
    if (!current) return null;
    const next = normalizeSchedule({ ...current, ...changes });
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE schedules SET title=?, description=?, schedule_date=?, start_time=?, end_time=?, repeat_rule=?, reminder_minutes=?, auto_rollover=?, status=?, business=?, updated_at=? WHERE owner_id=? AND id=?`)
      .run(next.title, next.description, next.scheduleDate, next.startTime, next.endTime, next.repeatRule, next.reminderMinutes, next.autoRollover ? 1 : 0, next.status, next.business, now, ownerId, id);
    return this.getSchedule(ownerId, id);
  }

  deleteSchedule(ownerId, id) {
    return this.db.prepare("DELETE FROM schedules WHERE owner_id = ? AND id = ?").run(ownerId, id).changes === 1;
  }
}

const recordSelect = `SELECT id, owner_id AS ownerId, type, title, description, status, priority, business,
  due_at AS dueAt, start_at AS startAt, progress, created_at AS createdAt, updated_at AS updatedAt FROM records`;
const scheduleSelect = `SELECT id, owner_id AS ownerId, title, description, schedule_date AS scheduleDate,
  start_time AS startTime, end_time AS endTime, repeat_rule AS repeatRule, reminder_minutes AS reminderMinutes,
  auto_rollover AS autoRollover, status, business, created_at AS createdAt, updated_at AS updatedAt FROM schedules`;

function normalizeSchedule(input) {
  const title = String(input.title ?? "").trim();
  const scheduleDate = String(input.scheduleDate ?? "").trim();
  const startTime = String(input.startTime ?? "").trim();
  if (!title) throw new Error("title is required");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) throw new Error("schedule date is required");
  if (!/^\d{2}:\d{2}$/.test(startTime)) throw new Error("start time is required");
  const repeatRule = ["none", "daily", "weekdays", "weekly", "monthly"].includes(input.repeatRule) ? input.repeatRule : "none";
  return { title, scheduleDate, startTime, endTime: input.endTime ? String(input.endTime) : null, description: String(input.description ?? ""), repeatRule, reminderMinutes: Math.max(0, Math.min(1440, Number(input.reminderMinutes ?? 10) || 0)), autoRollover: input.autoRollover === true || input.autoRollover === 1, status: input.status === "done" ? "done" : "pending", business: String(input.business ?? "老板总控") };
}

function clampProgress(value) {
  const number = Number(value ?? 0);
  return Math.max(0, Math.min(100, Number.isFinite(number) ? Math.round(number) : 0));
}

function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}
