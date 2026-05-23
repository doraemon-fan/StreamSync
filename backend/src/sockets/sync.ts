import { Server, Socket } from "socket.io";
import { roomStore } from "../utils/roomStore";

type PlayPayload = { roomId: string; timestamp: number };
type PausePayload = { roomId: string; timestamp: number };
type SeekPayload = { roomId: string; timestamp: number };
type JoinPayload = { roomId: string; memberName: string };

const roomState: Record<
  string,
  {
    isPlaying: boolean;
    timestamp: number;
    updatedAt: number;
  }
> = {};

export function registerSyncHandlers(io: Server, socket: Socket) {
  //JOIN ROOM
  socket.on("join-room", ({ roomId, memberName }: JoinPayload) => {
    const room = roomStore.get(roomId);
    if (!room) {
      socket.emit("error", { message: "room is not found" });
      return;
    }

    socket.join(roomId);
    console.log(`[Sync] ${memberName} joined the room: ${roomId}`);

    if (roomState[roomId]) {
      const state = roomState[roomId];

      const elapsed = state.isPlaying
        ? (Date.now() - state.updatedAt) / 100
        : 0;

      const currentTimestamp = state.timestamp + elapsed;

      socket.emit("sync-state", {
        isPlaying: state.isPlaying,
        timestamp: currentTimestamp,
      });
    }

    socket.to(roomId).emit("member-joined", { memberName });
  });

  //PLAY
  socket.on("play", ({ roomId, timestamp }: PlayPayload) => {
    roomState[roomId] = {
      isPlaying: true,
      timestamp,
      updatedAt: Date.now(),
    };
    console.log(`[Sync] Play in room ${roomId} at ${timestamp}`);

    socket.to(roomId).emit("play", { timestamp });
  });

  //PAUSE
  socket.on("pause", ({ roomId, timestamp }: PausePayload) => {
    roomState[roomId] = {
      isPlaying: false,
      timestamp,
      updatedAt: Date.now(),
    };
    console.log(`[Sync] Pause in room: ${roomId} at ${timestamp}s`);

    socket.to(roomId).emit("pause", { timestamp });
  });
  //SEEK
  socket.on("seek", ({ roomId, timestamp }: SeekPayload) => {
    if (roomState[roomId]) {
      roomState[roomId].timestamp = timestamp
      roomState[roomId].updatedAt = Date.now()
    }
    console.log(`[Sync] Seek in room: ${roomId} to ${timestamp}s`)

    socket.to(roomId).emit("seek", { timestamp })
  })
  
  //LEAVE
  socket.on("disconnecting", () => {
    socket.rooms.forEach(roomId => {
      socket.to(roomId).emit("member-left", { socketId: socket.id })
      console.log(`[Sync] Socket ${socket.id} left room: ${roomId}`)
    })
  })

}
