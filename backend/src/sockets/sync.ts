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

            // Emit member list to EVERYONE in the room (including the joining user)
            io.to(roomId).emit('member-joined', {
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

    // Admin grants admin role to another member
    socket.on('promote-member', ({ roomId, targetName }) => {
        const info = roomStore.getSocketRoom(socket.id);
        if (!info || !roomStore.isAdmin(roomId, info.memberName)) return;

        const room = roomStore.getRoom(roomId);
        if (!room) return;

        const target = room.members.find(m => m.name === targetName);
        if (target) {
            target.role = 'admin';
            io.to(roomId).emit('members-updated', { members: room.members });
        }
    });

    // Admin kicks a member
    socket.on('kick-member', ({ roomId, targetName }) => {
        const info = roomStore.getSocketRoom(socket.id);
        if (!info || !roomStore.isAdmin(roomId, info.memberName)) return;

        const room = roomStore.getRoom(roomId);
        if (!room) return;

        const target = room.members.find(m => m.name === targetName);
        if (target && target.socketId) {
            // Tell the kicked user they're kicked
            io.to(target.socketId).emit('kicked');
            // Disconnect them from the room
            const targetSocket = io.sockets.sockets.get(target.socketId);
            if (targetSocket) targetSocket.leave(roomId);
        }

        room.members = room.members.filter(m => m.name !== targetName);
        if (target?.socketId) roomStore.unbindSocket(target.socketId);

        io.to(roomId).emit('member-left', {
            memberName: targetName,
            members: room.members,
        });
    });

    // Member leaves voluntarily
    socket.on('leave-room', ({ roomId }) => {
        const result = roomStore.removeMemberBySocket(socket.id);
        socket.leave(roomId);
        if (result) {
            io.to(roomId).emit('member-left', {
                memberName: result.memberName,
                members: result.room.members,
            });
            console.log(`${result.memberName} left room ${roomId}`);
        }
    });

    // Admin resets room for re-upload
    socket.on('reset-room', ({ roomId }) => {
        const info = roomStore.getSocketRoom(socket.id);
        if (!info || !roomStore.isAdmin(roomId, info.memberName)) return;

        roomStore.resetRoom(roomId);
        io.to(roomId).emit('room-reset');
        console.log(`Room ${roomId} reset by admin ${info.memberName}`);
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
