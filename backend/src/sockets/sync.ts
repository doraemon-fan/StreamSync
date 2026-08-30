import { Server, Socket } from 'socket.io';
import { roomStore } from '../utils/roomStore';

export function registerSyncHandlers(io: Server, socket: Socket) {

    socket.on('join-room', ({ roomId, memberName }) => {
        console.log(`${memberName} joining room ${roomId}`);
        socket.join(roomId);

        roomStore.bindSocket(roomId, memberName, socket.id);

        const room = roomStore.getRoom(roomId);
        if (room) {
            const now = Date.now();
            let currentTimestamp = room.state.timestamp;
            if (room.state.isPlaying && room.state.updatedAt) {
                currentTimestamp += (now - room.state.updatedAt) / 1000;
            }
            socket.emit('sync-state', {
                isPlaying: room.state.isPlaying,
                timestamp: currentTimestamp,
                isReady: room.isReady,
            });

            socket.to(roomId).emit('member-joined', {
                memberName,
                members: room.members,
            });
        }
    });

    socket.on('play', ({ roomId, timestamp }) => {
        roomStore.updateState(roomId, { isPlaying: true, timestamp, updatedAt: Date.now() });
        socket.to(roomId).emit('play', { timestamp });
    });

    socket.on('pause', ({ roomId, timestamp }) => {
        roomStore.updateState(roomId, { isPlaying: false, timestamp, updatedAt: Date.now() });
        socket.to(roomId).emit('pause', { timestamp });
    });

    socket.on('seek', ({ roomId, timestamp }) => {
        roomStore.updateState(roomId, { timestamp, updatedAt: Date.now() });
        socket.to(roomId).emit('seek', { timestamp });
    });

    socket.on('stream-ready', ({ roomId }) => {
        roomStore.setReady(roomId);
        io.to(roomId).emit('stream-ready', { roomId });
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);

        const result = roomStore.removeMemberBySocket(socket.id);
        if (result) {
            const { roomId, memberName, room } = result;
            io.to(roomId).emit('member-left', {
                memberName,
                members: room.members,
            });
            console.log(`${memberName} removed from room ${roomId}`);
        }
    });
}
