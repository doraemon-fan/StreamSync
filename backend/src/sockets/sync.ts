import { Server, Socket } from "socket.io";
import { roomStore } from "../utils/roomStore";
import { db } from "../db";

type JoinPayload = { roomId: string; memberId: string; memberName: string };
type ControlPayload = { roomId: string; memberId: string; timestamp: number };
type HeartbeatPayload = { roomId: string; memberId: string };

export function registerSyncHandlers(io: Server, socket: Socket) {
  socket.on("join-room", ({ roomId, memberId, memberName }: JoinPayload) => {
    const room = roomStore.join(roomId, memberId, memberName);
    if (!room) {
      socket.emit("error", { message: "room is not found" });
      return;
    }
    socket.join(roomId);
    (socket as any).memberId = memberId;
    (socket as any).roomId = roomId;

    console.log(`[Sync] ${memberName} joined room: ${roomId}`);

    const host = (room.members as any[]).find((m) => m.is_admin);
    if (host) socket.emit("room-info", { hostName: host.name });

    const state = db.prepare(`SELECT * FROM playback_state WHERE room_id = ?`).get(roomId) as any;
    if (state) {
      const elapsed = state.is_playing ? (Date.now() - state.updated_at) / 1000 : 0;
      socket.emit("sync-state", {
        isPlaying: !!state.is_playing,
        timestamp: state.timestamp + elapsed,
      });
    }

    socket.to(roomId).emit("member-joined", { memberId, memberName });
  });

  function inRoom(roomId: string) {
    return socket.rooms.has(roomId);
  }

  function requireControl(roomId: string, memberId: string): boolean {
    if (!roomStore.canControlPlayback(roomId, memberId)) {
      socket.emit("error", { message: "not authorized to control playback" });
      return false;
    }
    return true;
  }

  function writePlaybackState(roomId: string, isPlaying: boolean, timestamp: number) {
    db.prepare(`
      INSERT INTO playback_state (room_id, is_playing, timestamp, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(room_id) DO UPDATE SET is_playing = excluded.is_playing,
        timestamp = excluded.timestamp, updated_at = excluded.updated_at
    `).run(roomId, isPlaying ? 1 : 0, timestamp, Date.now());
    roomStore.touch(roomId);
  }

  //PLAY
  socket.on("play", ({ roomId, memberId, timestamp }: ControlPayload) => {
    if (!inRoom(roomId) || !requireControl(roomId, memberId)) return;
    writePlaybackState(roomId, true, timestamp);
    console.log(`[Sync] Play in room ${roomId} at ${timestamp}`);
    socket.to(roomId).emit("play", { timestamp });
  });

  //PAUSE
  socket.on("pause", ({ roomId, memberId, timestamp }: ControlPayload) => {
    if (!inRoom(roomId) || !requireControl(roomId, memberId)) return;
    writePlaybackState(roomId, false, timestamp);
    console.log(`[Sync] Pause in room: ${roomId} at ${timestamp}s`);
    socket.to(roomId).emit("pause", { timestamp });
  });

  //SEEK
  socket.on("seek", ({ roomId, memberId, timestamp }: ControlPayload) => {
    if (!inRoom(roomId) || !requireControl(roomId, memberId)) return;
    const state = db.prepare(`SELECT is_playing FROM playback_state WHERE room_id = ?`).get(roomId) as any;
    writePlaybackState(roomId, !!state?.is_playing, timestamp);
    console.log(`[Sync] Seek in room: ${roomId} to ${timestamp}s`);
    socket.to(roomId).emit("seek", { timestamp });
  });

  //HEARTBEAT — keeps an idle-but-connected viewer's room/member from being
  //swept by the TTL job even if nobody hits play/pause for a while.
  socket.on("heartbeat", ({ roomId, memberId }: HeartbeatPayload) => {
    if (!inRoom(roomId)) return;
    roomStore.markSeen(memberId, roomId);
  });

  //LEAVE
  socket.on("disconnecting", () => {
    const memberId = (socket as any).memberId;
    const roomId = (socket as any).roomId;
    if (!memberId || !roomId) return;
    roomStore.markSeen(memberId, roomId); // last_seen updated; TTL sweep decides real removal
    socket.to(roomId).emit("member-left", { memberId });
    console.log(`[Sync] ${memberId} left room: ${roomId}`);
  });
}
