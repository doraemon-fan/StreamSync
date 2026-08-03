import { db } from "../db";
import fs from "fs";
import path from "path";

const ROOM_GRACE_MS = 15 * 60 * 1000;
const ROOM_HARD_CAP_MS = 6 * 60 * 60 * 1000;
const HLS_DIR = process.env.HLS_DIR || "/hls";

export function startCleanupJob(intervalMs = 5 * 60 * 1000) {
  setInterval(() => {
    const now = Date.now();
    const staleRooms = db.prepare(`
      SELECT room_id FROM rooms
      WHERE (last_active < ?) OR (created_at < ?)
    `).all(now - ROOM_GRACE_MS, now - ROOM_HARD_CAP_MS) as { room_id: string }[];

    for (const { room_id } of staleRooms) {
      db.prepare(`DELETE FROM rooms WHERE room_id = ?`).run(room_id); // cascades
      const dir = path.join(HLS_DIR, room_id);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      console.log(`[cleanup] removed stale room ${room_id}`);
    }
  }, intervalMs);
}
