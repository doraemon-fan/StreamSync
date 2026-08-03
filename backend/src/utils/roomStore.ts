import { db } from "../db";
import crypto from "crypto";

export const roomStore = {
  create(roomId: string, adminName: string) {
    const now = Date.now();
    const adminId = crypto.randomUUID();
    db.prepare(`INSERT INTO rooms (room_id, admin_id, created_at, last_active, is_ready)
                VALUES (?, ?, ?, ?, 0)`).run(roomId, adminId, now, now);
    db.prepare(`INSERT INTO members
                (member_id, room_id, name, is_admin, can_control_playback, can_upload, joined_at, last_seen)
                VALUES (?, ?, ?, 1, 1, 1, ?, ?)`).run(adminId, roomId, adminName, now, now);
    return { roomId, adminId, ...this.get(roomId) };
  },

  get(roomId: string) {
    const room = db.prepare(`SELECT * FROM rooms WHERE room_id = ?`).get(roomId) as any;
    if (!room) return undefined;
    const members = db.prepare(`SELECT * FROM members WHERE room_id = ?`).all(roomId);
    return { ...room, members };
  },

  // memberId is now REQUIRED — generated client-side, persisted in localStorage,
  // sent on every join (first time or reconnect). See note below on why.
  join(roomId: string, memberId: string, memberName: string) {
    const room = db.prepare(`SELECT room_id FROM rooms WHERE room_id = ?`).get(roomId);
    if (!room) return null;
    const now = Date.now();
    db.prepare(`
      INSERT INTO members (member_id, room_id, name, is_admin, can_control_playback, can_upload, joined_at, last_seen)
      VALUES (?, ?, ?, 0, 0, 0, ?, ?)
      ON CONFLICT(member_id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen
    `).run(memberId, roomId, memberName, now, now);
    this.touch(roomId);
    return this.get(roomId);
  },

  touch(roomId: string) {
    db.prepare(`UPDATE rooms SET last_active = ? WHERE room_id = ?`).run(Date.now(), roomId);
  },

  markSeen(memberId: string, roomId: string) {
    db.prepare(`UPDATE members SET last_seen = ? WHERE member_id = ?`).run(Date.now(), memberId);
    this.touch(roomId);
  },

  setReady(roomId: string) {
    db.prepare(`UPDATE rooms SET is_ready = 1 WHERE room_id = ?`).run(roomId);
  },

  setPermissions(
    roomId: string,
    callerMemberId: string,
    targetMemberId: string,
    perms: { canControlPlayback?: boolean; canUpload?: boolean }
  ) {
    const caller = db.prepare(`SELECT is_admin FROM members WHERE member_id = ? AND room_id = ?`)
      .get(callerMemberId, roomId) as { is_admin: number } | undefined;
    if (!caller?.is_admin) throw new Error("only admin can grant permissions");

    if (perms.canControlPlayback !== undefined)
      db.prepare(`UPDATE members SET can_control_playback = ? WHERE member_id = ? AND room_id = ?`)
        .run(perms.canControlPlayback ? 1 : 0, targetMemberId, roomId);
    if (perms.canUpload !== undefined)
      db.prepare(`UPDATE members SET can_upload = ? WHERE member_id = ? AND room_id = ?`)
        .run(perms.canUpload ? 1 : 0, targetMemberId, roomId);
  },

  canControlPlayback(roomId: string, memberId: string) {
    const m = db.prepare(`SELECT can_control_playback FROM members WHERE member_id = ? AND room_id = ?`)
      .get(memberId, roomId) as { can_control_playback: number } | undefined;
    return !!m?.can_control_playback;
  },

  canUpload(roomId: string, memberId: string) {
    const m = db.prepare(`SELECT can_upload FROM members WHERE member_id = ? AND room_id = ?`)
      .get(memberId, roomId) as { can_upload: number } | undefined;
    return !!m?.can_upload;
  },

  list() {
    return db.prepare(`SELECT * FROM rooms`).all();
  },
};
