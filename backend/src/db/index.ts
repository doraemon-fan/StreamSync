import Database from "better-sqlite3"
import path from "path"
import fs from "fs"

const DATA_DIR = path.join(__dirname, "../../data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, "streamsync.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    room_id     TEXT PRIMARY KEY,
    admin_id    TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    last_active INTEGER NOT NULL,
    is_ready    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS members (
    member_id             TEXT PRIMARY KEY,
    room_id                TEXT NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
    name                   TEXT NOT NULL,
    is_admin               INTEGER NOT NULL DEFAULT 0,
    can_control_playback   INTEGER NOT NULL DEFAULT 0,
    can_upload             INTEGER NOT NULL DEFAULT 0,
    joined_at              INTEGER NOT NULL,
    last_seen              INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS playback_state (
    room_id     TEXT PRIMARY KEY REFERENCES rooms(room_id) ON DELETE CASCADE,
    is_playing  INTEGER NOT NULL DEFAULT 0,
    timestamp   REAL NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_members_room ON members(room_id);
  CREATE INDEX IF NOT EXISTS idx_rooms_last_active ON rooms(last_active);
`);
