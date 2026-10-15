// SQLite storage using Node's built-in `node:sqlite` (no native build step).
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('student','organiser')),
  student_code  TEXT,
  device_id     TEXT UNIQUE,
  device_name   TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS device_requests (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id),
  new_device_id   TEXT NOT NULL,
  new_device_name TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at      INTEGER NOT NULL,
  resolved_at     INTEGER,
  resolved_by     TEXT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS courses (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  code         TEXT NOT NULL UNIQUE,
  organiser_id TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  course_id  TEXT NOT NULL REFERENCES courses(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (course_id, user_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  short_id       TEXT NOT NULL UNIQUE,
  course_id      TEXT NOT NULL REFERENCES courses(id),
  organiser_id   TEXT NOT NULL REFERENCES users(id),
  secret         TEXT NOT NULL,
  title          TEXT,
  started_at     INTEGER NOT NULL,
  ends_at        INTEGER NOT NULL,
  closed_at      INTEGER,
  duration_sec   INTEGER NOT NULL,
  rotation_ms    INTEGER NOT NULL,
  rssi_threshold INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  device_id  TEXT,
  marked_at  INTEGER NOT NULL,
  method     TEXT NOT NULL CHECK (method IN ('auto','manual')),
  rssi       INTEGER,
  UNIQUE (session_id, user_id),
  UNIQUE (session_id, device_id)
);

CREATE TABLE IF NOT EXISTS mark_attempts (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  user_id    TEXT REFERENCES users(id),
  device_id  TEXT,
  reason     TEXT NOT NULL,
  rssi       INTEGER,
  at         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_course ON sessions(course_id, started_at);
CREATE INDEX IF NOT EXISTS idx_attendance_user ON attendance(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_session ON mark_attempts(session_id, at);
`;

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

export const uuid = () => randomUUID();
export const now = () => Date.now();
